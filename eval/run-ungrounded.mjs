#!/usr/bin/env node
/**
 * UNGROUNDED-PROMPT BASELINE for the paper.
 *
 * Question: does the grounding discipline in the prompt (evidence-bound,
 * absence=none, quote-or-none, conservatism, verifier warning) change
 * cross-model judgment agreement, compared to a plain assessment prompt?
 *
 * This is a slim variant of eval/run-experiment.mjs: SAME retrieval (the
 * Corpus A index from eval/results-spectrum/_index is COPIED, never rebuilt;
 * same embedder, same precomputed query vectors, topk 6), SAME provider stack
 * (getLlm, temperature 0 — omitted for gpt-5.5 by provider logic), SAME JSON
 * output mode. The ONLY change is the prompt pair: a minimal, NON-grounding
 * system + task prompt. No evidence-bound rule, no absence=none rule, no quote
 * requirement, no conservatism rules, no verifier warning.
 *
 * Output: raw_{model}.jsonl ({id, raw_coverage}) + summary.json per run.
 *
 * Usage:
 *   node eval/run-ungrounded.mjs --out eval/results-ungrounded \
 *     [--models openai:gpt-4o-mini,openai:gpt-4o,openai:gpt-5.5] \
 *     [--index eval/results-spectrum/_index] [--topk 6] [--limit 0]
 */

import { cp, appendFile, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { buildContext } from '../src/core/context.js';
import { loadCsfCore } from '../src/csf/loader.js';
import { loadIndex, topK } from '../src/store/vectorStore.js';
import { getLlm } from '../src/llm/index.js';
import { renderEvidence } from '../src/prompts/templates.js';
import { extractJsonObject } from '../src/engine/mapping.js';
import { writeJsonAtomic, ensureDir, fileExists } from '../src/util/fsx.js';
import { createLogger } from '../src/core/logger.js';

const LEVELS = new Set(['none', 'partial', 'substantial', 'full']);

// ---------------------------------------------------------------------------
// The MINIMAL, NON-GROUNDING prompts (the only deviation from the harness).
// ---------------------------------------------------------------------------
const UNGROUNDED_SYSTEM_PROMPT = `You are a cybersecurity assessor performing a NIST CSF 2.0 gap analysis. For a single CSF subcategory, judge how well the organization achieves the subcategory's outcome, based on the document excerpts provided. Respond with a SINGLE valid JSON object and nothing else, with keys: subcategory_id, coverage (one of "none", "partial", "substantial", "full"), confidence (0.0-1.0), rationale (2-4 sentences). Do not add extra keys.`;

/** Same header block + same rendered evidence as buildTaskPrompt, no rules. */
function buildUngroundedTaskPrompt(sub, hits) {
  return `=== SUBCATEGORY UNDER ASSESSMENT ===
Function:    ${sub.functionId} — ${sub.functionName}
Category:    ${sub.categoryId} — ${sub.category}
Subcategory: ${sub.id}
Outcome text (official NIST CSF 2.0, judge whether THIS outcome is achieved):
${sub.outcome}

=== RETRIEVED EVIDENCE ===
${renderEvidence(hits)}

Decide how well the organization achieves the outcome of ${sub.id}. Return the JSON object only.`;
}

// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const a = {
    csf: 'data/csf-core.json',
    topk: 6,
    limit: 0,
    out: 'eval/results-ungrounded',
    index: 'eval/results-spectrum/_index',
    embed: 'local-transformers',
    models: ['openai:gpt-4o-mini', 'openai:gpt-4o', 'openai:gpt-5.5'],
    reasoningEffort: 'low',
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--models') a.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--csf') a.csf = argv[++i];
    else if (k === '--topk') a.topk = Number(argv[++i]);
    else if (k === '--limit') a.limit = Number(argv[++i]);
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--index') a.index = argv[++i];
    else if (k === '--reasoning-effort') a.reasoningEffort = argv[++i];
  }
  return a;
}

const splitSpec = (s) => ({ provider: s.slice(0, s.indexOf(':')), model: s.slice(s.indexOf(':') + 1) });

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logger = createLogger({ level: 'warn' });
  await ensureDir(args.out);

  // Copy the EXISTING Corpus A index (never rebuild) so retrieval is identical
  // to the grounded run in eval/results-spectrum.
  const workDir = `${args.out}/_index`;
  if (!(await fileExists(`${workDir}/index.json`))) {
    if (!(await fileExists(`${args.index}/index.json`))) {
      throw new Error(`Precomputed index not found at ${args.index} — refusing to rebuild.`);
    }
    await cp(args.index, workDir, { recursive: true });
    process.stderr.write(`Copied precomputed index ${args.index} -> ${workDir}\n`);
  }

  // Context only for .env loading, config shape, and the (same) embedder.
  const ctx = await buildContext({
    csfCorePath: args.csf, workDir,
    embeddings: { provider: args.embed }, llm: { provider: 'mock' },
  });
  ctx.ui = { isInteractive: false, info() {}, warn() {}, success() {}, note() {} };

  const index = await loadIndex(ctx.paths.index);
  const csf = await loadCsfCore(args.csf, logger);
  let subs = csf.subcategories;
  if (args.limit > 0) subs = subs.slice(0, args.limit);

  // Same embedder as the grounded run; query vectors precomputed once so
  // retrieval is held fixed across models.
  const embedder = await ctx.getEmbedder();
  if (embedder.id !== index.embedder_id) {
    throw new Error(`Embedder mismatch: index built with ${index.embedder_id}, got ${embedder.id}`);
  }
  process.stderr.write(`Embedding ${subs.length} queries (embedder ${embedder.id})...\n`);
  const queryVecs = await embedder.embed(subs.map((s) => s.outcome));
  const hitsPerSub = subs.map((s, i) => topK(index, queryVecs[i], args.topk));

  const summaryRows = [];
  for (const spec of args.models) {
    const { provider, model } = splitSpec(spec);
    const type = provider === 'openai' ? 'cloud' : provider === 'ollama' ? 'local' : provider;
    process.stderr.write(`\n=== ${spec} (${type}, UNGROUNDED prompt) ===\n`);
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
      model: spec, type, prompt_condition: 'ungrounded',
      reasoning_effort: type === 'cloud' ? args.reasoningEffort : '',
      items: 0, parse_failures: 0, call_errors: 0,
      cov_none: 0, cov_partial: 0, cov_substantial: 0, cov_full: 0,
      latencies: [],
    };
    const errors = [];

    // RESUMABLE: each verdict is appended to the raw JSONL immediately; on
    // restart, already-recorded ids are skipped (no API call repeated).
    const safe = spec.replace(/[^\w.-]/g, '_');
    const rawPath = `${args.out}/raw_${safe}.jsonl`;
    const done = new Set();
    if (await fileExists(rawPath)) {
      for (const line of (await readFile(rawPath, 'utf8')).split('\n')) {
        const s = line.trim();
        if (!s) continue;
        try { const o = JSON.parse(s); if (o?.id && LEVELS.has(o.raw_coverage)) done.add(o.id); } catch {}
      }
      if (done.size) process.stderr.write(`  resuming: ${done.size} verdicts already on disk\n`);
    }

    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      if (done.has(sub.id)) continue;
      const hits = hitsPerSub[i];
      const user = buildUngroundedTaskPrompt(sub, hits);
      let raw = '';
      const t0 = performance.now();
      try {
        raw = await llm.judge({ system: UNGROUNDED_SYSTEM_PROMPT, user, meta: { subcategory: sub, hits, pass: 'first' } });
      } catch (err) {
        m.call_errors++;
        errors.push({ id: sub.id, error: String(err.message ?? err) });
        continue;
      }
      m.latencies.push(performance.now() - t0);
      m.items++;

      const obj = extractJsonObject(raw);
      const cov = obj?.coverage;
      if (!obj || !LEVELS.has(cov)) {
        m.parse_failures++;
        errors.push({ id: sub.id, error: 'parse_fail', raw: raw.slice(0, 400) });
        continue;
      }
      await appendFile(rawPath, JSON.stringify({ id: sub.id, raw_coverage: cov }) + '\n', 'utf8');
      done.add(sub.id);
      if ((i + 1) % 25 === 0) process.stderr.write(`  ${i + 1}/${subs.length}\n`);
    }

    // Recompute the verdict distribution from the file (covers resumed items).
    const finalVerdicts = [];
    if (await fileExists(rawPath)) {
      for (const line of (await readFile(rawPath, 'utf8')).split('\n')) {
        const s = line.trim();
        if (!s) continue;
        try { const o = JSON.parse(s); if (o?.id && LEVELS.has(o.raw_coverage)) finalVerdicts.push(o); } catch {}
      }
    }
    for (const v of finalVerdicts) m['cov_' + v.raw_coverage]++;
    m.items = finalVerdicts.length;

    const lat = m.latencies.slice().sort((a, b) => a - b);
    const row = {
      ...m,
      latency_ms_mean: lat.length ? Math.round(lat.reduce((s, x) => s + x, 0) / lat.length) : 0,
      latency_ms_median: lat.length ? Math.round(lat[Math.floor(lat.length / 2)]) : 0,
    };
    delete row.latencies;
    if (errors.length) row.errors = errors;
    summaryRows.push(row);
    process.stderr.write(`  valid=${finalVerdicts.length}/${subs.length} | none/partial/substantial/full = ${m.cov_none}/${m.cov_partial}/${m.cov_substantial}/${m.cov_full} | call_errors=${m.call_errors} parse_fail=${m.parse_failures} | med_latency=${row.latency_ms_median}ms\n`);
  }

  // Merge into any existing summary (per-model rows replaced by model name) so
  // partial/resumed runs accumulate into one complete summary.json.
  const summaryPath = `${args.out}/summary.json`;
  let prevModels = [];
  if (await fileExists(summaryPath)) {
    try { prevModels = JSON.parse(await readFile(summaryPath, 'utf8')).models ?? []; } catch {}
  }
  const byName = new Map(prevModels.map((r) => [r.model, r]));
  for (const r of summaryRows) byName.set(r.model, r);
  await writeJsonAtomic(summaryPath, {
    condition: 'ungrounded-prompt baseline',
    index_source: args.index,
    csf: args.csf, subcategories: subs.length, topk: args.topk,
    embedder: index.embedder_id, temperature: 0,
    reasoning_effort: args.reasoningEffort,
    system_prompt: UNGROUNDED_SYSTEM_PROMPT,
    models: [...byName.values()],
  });
  process.stderr.write(`\nWrote ${args.out}/summary.json (+ raw JSONL per model)\n`);
}

main().catch((err) => { process.stderr.write(`ungrounded run failed: ${err.stack ?? err.message}\n`); process.exitCode = 1; });
