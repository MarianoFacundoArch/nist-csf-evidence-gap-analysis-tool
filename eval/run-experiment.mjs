#!/usr/bin/env node
/**
 * Evaluation harness for the paper:
 *   "Grounding Generative AI in Authoritative Security Frameworks"
 *
 * Measures, per LLM, how faithfully it grounds its claims in the retrieved
 * evidence — how often it emits quotes that are NOT verbatim substrings of the
 * evidence (the model's fabrication signal) — and confirms the code-side
 * verifier drives unverifiable quotes in the DELIVERED output to zero. Reuses
 * the real tool modules. Retrieval is held FIXED across models (one embedder,
 * precomputed query vectors) so differences are attributable to the LLM.
 *
 * Saves EVERYTHING to disk (not just for graphs): CSV summary + per-item CSV,
 * plus JSONL with raw model evidence + retrieved chunk ids (for offline
 * ablations). Numbers are real.
 *
 * Usage:
 *   node eval/run-experiment.mjs --docs <dir> \
 *     --models openai:gpt-5.5,ollama:qwen2.5:7b,... \
 *     [--csf data/csf-core.json] [--topk 6] [--limit 0] \
 *     [--reasoning-effort low] [--out eval/results]
 */

import { performance } from 'node:perf_hooks';
import { buildContext } from '../src/core/context.js';
import { ingest } from '../src/actions/ingest.js';
import { loadCsfCore } from '../src/csf/loader.js';
import { loadIndex, topK } from '../src/store/vectorStore.js';
import { getLlm } from '../src/llm/index.js';
import { SYSTEM_PROMPT, buildTaskPrompt } from '../src/prompts/templates.js';
import { extractJsonObject } from '../src/engine/mapping.js';
import { validateAssessment } from '../src/engine/assessment.schema.js';
import { verifyAndDowngrade, normalizeForMatch } from '../src/engine/verifier.js';
import { writeJsonAtomic, writeFileAtomic, ensureDir, fileExists } from '../src/util/fsx.js';
import { toCsv } from '../src/util/csv.js';
import { createLogger } from '../src/core/logger.js';

function parseArgs(argv) {
  const a = { csf: 'data/csf-core.json', topk: 6, limit: 0, out: 'eval/results', embed: 'local-transformers', reasoningEffort: 'low' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--docs') a.docs = argv[++i];
    else if (k === '--models') a.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--csf') a.csf = argv[++i];
    else if (k === '--topk') a.topk = Number(argv[++i]);
    else if (k === '--limit') a.limit = Number(argv[++i]);
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--embed') a.embed = argv[++i];
    else if (k === '--reasoning-effort') a.reasoningEffort = argv[++i];
    else if (k === '--no-warning') a.noWarning = true; // ablation: strip the verifier-warning paragraph from the system prompt
  }
  if (!a.docs || !a.models?.length) throw new Error('Required: --docs <dir> --models provider:model[,...]');
  return a;
}

const splitSpec = (s) => ({ provider: s.slice(0, s.indexOf(':')), model: s.slice(s.indexOf(':') + 1) });
const estTokens = (s) => Math.ceil((s?.length ?? 0) / 4); // rough char/4 estimate (labeled as estimate)

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logger = createLogger({ level: 'warn' });
  await ensureDir(args.out);
  // --no-warning ablation: remove the final paragraph that tells the model an
  // automated verifier re-checks every quote (deterrence vs enforcement).
  const systemPrompt = args.noWarning
    ? SYSTEM_PROMPT.replace(/\n*You will be told that an automated verifier[\s\S]*$/, '').trimEnd()
    : SYSTEM_PROMPT;
  if (args.noWarning && systemPrompt.length === SYSTEM_PROMPT.length) {
    throw new Error('--no-warning: warning paragraph not found in SYSTEM_PROMPT');
  }

  // Fixed embedder + index (retrieval held constant for all models).
  const workDir = `${args.out}/_index`;
  const ctx = await buildContext({
    docsPath: args.docs, csfCorePath: args.csf, workDir,
    embeddings: { provider: args.embed }, llm: { provider: 'mock' },
  });
  ctx.ui = { isInteractive: false, info() {}, warn() {}, success() {}, note() {} };
  if (!(await fileExists(ctx.paths.index))) {
    process.stderr.write(`Building index over ${args.docs} (embedder ${args.embed})...\n`);
    await ingest(ctx);
  }
  const index = await loadIndex(ctx.paths.index);
  const normChunks = index.chunks.map((c) => normalizeForMatch(c.text));
  const isVerbatim = (q) => { const n = normalizeForMatch(q); return !!n && normChunks.some((c) => c.includes(n)); };

  const csf = await loadCsfCore(args.csf, logger);
  let subs = csf.subcategories;
  if (args.limit > 0) subs = subs.slice(0, args.limit);

  const embedder = await ctx.getEmbedder();
  process.stderr.write(`Embedding ${subs.length} queries...\n`);
  const queryVecs = await embedder.embed(subs.map((s) => s.outcome));
  const hitsPerSub = subs.map((s, i) => topK(index, queryVecs[i], args.topk));

  const summaryRows = [];
  for (const spec of args.models) {
    const { provider, model } = splitSpec(spec);
    const type = provider === 'openai' ? 'cloud' : provider === 'ollama' ? 'local' : provider;
    process.stderr.write(`\n=== ${spec} (${type}) @ ${new Date ? '' : ''}===\n`);
    let llm;
    try {
      const cfg = structuredClone(ctx.config);
      cfg.llm = { provider, model, temperature: 0, maxTokens: 1024, reasoningEffort: args.reasoningEffort };
      llm = await getLlm(cfg, logger);
    } catch (err) {
      process.stderr.write(`  skipped: ${err.message}\n`);
      summaryRows.push({ model: spec, type, skipped: 1, reason: err.message });
      continue;
    }

    const m = {
      model: spec, type, reasoning_effort: type === 'cloud' ? args.reasoningEffort : '',
      items: 0, parse_failures: 0, call_errors: 0,
      raw_quotes: 0, raw_unverifiable: 0, raw_overclaim_items: 0,
      delivered_quotes: 0, delivered_unverifiable: 0,
      cov_none: 0, cov_partial: 0, cov_substantial: 0, cov_full: 0,
      est_in_tokens: 0, est_out_tokens: 0, latencies: [],
    };
    const itemRows = [];
    const rawDump = [];

    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      const hits = hitsPerSub[i];
      const user = buildTaskPrompt(sub, hits);
      let raw = '';
      const t0 = performance.now();
      try {
        raw = await llm.judge({ system: systemPrompt, user, meta: { subcategory: sub, hits, pass: 'first' } });
      } catch (err) {
        m.call_errors++;
        continue;
      }
      const dt = performance.now() - t0;
      m.latencies.push(dt);
      m.items++;
      m.est_in_tokens += estTokens(systemPrompt) + estTokens(user);
      m.est_out_tokens += estTokens(raw);

      const parsed = validateAssessment(extractJsonObject(raw));
      if (!parsed.ok) {
        m.parse_failures++;
        itemRows.push([sub.id, Math.round(dt), 'PARSE_FAIL', 0, 0, 'none', 'parse_fail']);
        continue;
      }
      const v = parsed.value;
      m['cov_' + v.coverage] = (m['cov_' + v.coverage] ?? 0) + 1;

      const rawQuotes = v.evidence ?? [];
      let verifiable = 0;
      for (const e of rawQuotes) { m.raw_quotes++; if (isVerbatim(e.quote)) verifiable++; else m.raw_unverifiable++; }
      if (v.coverage !== 'none' && verifiable === 0) m.raw_overclaim_items++;

      const delivered = verifyAndDowngrade({ ...v, evidence: [...rawQuotes] }, hits);
      for (const e of delivered.evidence ?? []) { m.delivered_quotes++; if (!isVerbatim(e.quote)) m.delivered_unverifiable++; }

      itemRows.push([sub.id, Math.round(dt), v.coverage, rawQuotes.length, rawQuotes.length - verifiable, delivered.coverage, delivered.verifier_action ?? '']);
      rawDump.push({ id: sub.id, raw_coverage: v.coverage, raw_evidence: rawQuotes, hit_chunk_ids: hits.map((h) => (h.chunk ?? h).id) });
      if ((i + 1) % 25 === 0) process.stderr.write(`  ${i + 1}/${subs.length}\n`);
    }

    const lat = m.latencies.slice().sort((a, b) => a - b);
    const row = {
      ...m,
      UQR: m.raw_quotes ? +(m.raw_unverifiable / m.raw_quotes).toFixed(4) : 0,
      delivered_UQR: m.delivered_quotes ? +(m.delivered_unverifiable / m.delivered_quotes).toFixed(4) : 0,
      latency_ms_mean: lat.length ? Math.round(lat.reduce((s, x) => s + x, 0) / lat.length) : 0,
      latency_ms_median: lat.length ? Math.round(lat[Math.floor(lat.length / 2)]) : 0,
    };
    delete row.latencies;
    summaryRows.push(row);

    const safe = spec.replace(/[^\w.-]/g, '_');
    await writeFileAtomic(`${args.out}/items_${safe}.csv`, toCsv(
      ['subcategory_id', 'latency_ms', 'raw_coverage', 'raw_quotes', 'raw_unverifiable', 'delivered_coverage', 'verifier_action'],
      itemRows, { bom: false },
    ));
    await writeFileAtomic(`${args.out}/raw_${safe}.jsonl`, rawDump.map((r) => JSON.stringify(r)).join('\n') + '\n');
    process.stderr.write(`  UQR=${(row.UQR * 100).toFixed(1)}% | overclaim=${m.raw_overclaim_items} | delivered_unverif=${m.delivered_unverifiable} | parse_fail=${m.parse_failures} | med_latency=${row.latency_ms_median}ms\n`);
  }

  // Master summary CSV + JSON.
  const cols = ['model', 'type', 'reasoning_effort', 'items', 'parse_failures', 'call_errors',
    'raw_quotes', 'raw_unverifiable', 'UQR', 'raw_overclaim_items',
    'delivered_quotes', 'delivered_unverifiable', 'delivered_UQR',
    'cov_none', 'cov_partial', 'cov_substantial', 'cov_full',
    'est_in_tokens', 'est_out_tokens', 'latency_ms_mean', 'latency_ms_median'];
  await writeFileAtomic(`${args.out}/summary.csv`, toCsv(cols, summaryRows.map((r) => cols.map((c) => r[c] ?? '')), { bom: false }));
  await writeJsonAtomic(`${args.out}/summary.json`, {
    docs: args.docs, csf: args.csf, subcategories: subs.length, topk: args.topk,
    embedder: index.embedder_id, reasoning_effort: args.reasoningEffort, models: summaryRows,
  });
  process.stderr.write(`\nWrote ${args.out}/summary.csv (+ per-item CSVs, raw JSONL, summary.json)\n`);
}

main().catch((err) => { process.stderr.write(`experiment failed: ${err.stack ?? err.message}\n`); process.exitCode = 1; });
