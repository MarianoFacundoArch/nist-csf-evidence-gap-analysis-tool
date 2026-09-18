#!/usr/bin/env node
/**
 * CORPUS-2 ANALYSIS — grounding results on a REAL public-document corpus
 * (12 New York State ITS security policy PDFs; 376 chunks; retrieval k=6).
 *
 * Everything is recomputed from the raw artifacts on disk:
 *   eval/results-corpus2/raw_openai_*.jsonl         (3 cloud models)
 *   eval/results-corpus2-local/raw_ollama_*.jsonl   (4 local models)
 *   eval/results-corpus2/_index/index.json          (the 376 corpus-2 chunks)
 *   eval/results-corpus2[-local]/items_*.csv        (per-item latency / parse fails)
 *   data/csf-core.json                              (official CSF outcome texts)
 *   eval/results-spectrum/raw_*.jsonl               (corpus-1 verdicts, for the
 *                                                    7-model apples-to-apples alpha)
 *
 * Produces:
 *   eval/results-corpus2/analysis.json
 *   eval/results-corpus2/dropped_quote_taxonomy_corpus2.json
 *
 * Definitions (identical to the verifier, src/engine/verifier.js):
 *   normalize  : NFC; curly quotes -> '/"; en/em dash -> -; whitespace collapse;
 *                trim; lowercase  (normalizeForMatch — imported, not re-implemented)
 *   verbatim   : normalized quote is a substring of ONE normalized hit-chunk text
 *   substantive: normalized length >= 20 AND >= 3 matches of /[a-z]{3,}/g
 *   forcing-rule downgrade (definition-a): item with raw coverage > none and ZERO
 *                quotes that are verbatim AND substantive
 *   definition-b: item with raw coverage > none and an EMPTY evidence array
 *
 * Run: node eval/corpus2-analysis.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeForMatch, verifyAndDowngrade } from '../src/engine/verifier.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...xs) => path.join(ROOT, ...xs);

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
const MODELS = [
  { name: 'openai_gpt-4o-mini', spec: 'openai:gpt-4o-mini', type: 'cloud', dir: 'eval/results-corpus2' },
  { name: 'openai_gpt-4o', spec: 'openai:gpt-4o', type: 'cloud', dir: 'eval/results-corpus2' },
  { name: 'openai_gpt-5.5', spec: 'openai:gpt-5.5', type: 'cloud', dir: 'eval/results-corpus2' },
  { name: 'ollama_llama3.1_8b', spec: 'ollama:llama3.1:8b', type: 'local', dir: 'eval/results-corpus2-local' },
  { name: 'ollama_gemma2_9b', spec: 'ollama:gemma2:9b', type: 'local', dir: 'eval/results-corpus2-local' },
  { name: 'ollama_qwen2.5_7b', spec: 'ollama:qwen2.5:7b', type: 'local', dir: 'eval/results-corpus2-local' },
  { name: 'ollama_mistral_7b', spec: 'ollama:mistral:7b', type: 'local', dir: 'eval/results-corpus2-local' },
];
const CORPUS1_DIR = 'eval/results-spectrum'; // corpus-1 raw verdicts (same 7 model names)
const TOTAL_ITEMS = 106;
const TOPK = 6;

const index = JSON.parse(fs.readFileSync(P('eval/results-corpus2/_index/index.json'), 'utf8'));
const chunkById = new Map(index.chunks.map((c) => [c.id, c]));
const normChunkById = new Map(index.chunks.map((c) => [c.id, normalizeForMatch(c.text)]));
const normAllChunks = index.chunks.map((c) => ({ id: c.id, norm: normChunkById.get(c.id) }));

// Cross-run sanity: the local rerun used the IDENTICAL index.
const localIndex = JSON.parse(fs.readFileSync(P('eval/results-corpus2-local/_index/index.json'), 'utf8'));
if (localIndex.index_id !== index.index_id) throw new Error('cloud/local runs used different indexes');

const csf = JSON.parse(fs.readFileSync(P('data/csf-core.json'), 'utf8'));
const outcomeById = new Map(csf.subcategories.map((s) => [s.id, s.outcome]));

const isSubstantive = (n) => n.length >= 20 && (n.match(/[a-z]{3,}/g)?.length ?? 0) >= 3;

function wilson(k, n, z = 1.959963984540054) {
  if (n === 0) return { p: null, lo: null, hi: null };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

const readJsonl = (file) =>
  fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const readItemsCsv = (file) => {
  const [header, ...rows] = fs.readFileSync(file, 'utf8').trim().split('\n');
  const cols = header.split(',');
  return rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v])));
};

// ---------------------------------------------------------------------------
// 1) Per-model metrics (recomputed from raw JSONL + items CSV; cross-checked
//    against summary.json where the run recorded the same quantity)
// ---------------------------------------------------------------------------
const summaries = {};
for (const dir of new Set(MODELS.map((m) => m.dir))) {
  const s = JSON.parse(fs.readFileSync(P(dir, 'summary.json'), 'utf8'));
  for (const row of s.models) summaries[row.model] = row;
}

const perModel = [];
const nonVerbatimCandidates = []; // for the taxonomy
for (const m of MODELS) {
  const recs = readJsonl(P(m.dir, `raw_${m.name}.jsonl`));
  const items = readItemsCsv(P(m.dir, `items_${m.name}.csv`));
  if (items.length !== TOTAL_ITEMS) throw new Error(`${m.name}: ${items.length} item rows`);

  const parseFailures = items.filter((r) => r.raw_coverage === 'PARSE_FAIL').length;
  if (recs.length !== TOTAL_ITEMS - parseFailures) {
    throw new Error(`${m.name}: ${recs.length} raw records vs ${TOTAL_ITEMS - parseFailures} parsed items`);
  }

  const cov = { none: 0, partial: 0, substantial: 0, full: 0 };
  let quotes = 0;
  let nonVerbatim = 0; // not a substring of any of the item's hit chunks
  let nonVerbatimCorpusWide = 0; // not a substring of ANY corpus chunk (run-harness UQR definition)
  let forcingDowngradesA = 0; // cov>none and zero verbatim+substantive quotes
  let emptyEvidenceAboveNoneB = 0; // cov>none and empty evidence array
  let deliveredQuotes = 0;
  let deliveredUnverifiable = 0;
  let verifierDowngradeActions = 0;

  for (const rec of recs) {
    cov[rec.raw_coverage] += 1;
    const hits = rec.hit_chunk_ids.map((id) => {
      const c = chunkById.get(id);
      if (!c) throw new Error(`${m.name}/${rec.id}: unknown chunk ${id}`);
      return c;
    });
    if (hits.length !== TOPK) throw new Error(`${m.name}/${rec.id}: ${hits.length} hits`);
    const normHits = hits.map((c) => normChunkById.get(c.id));

    let verbatimSubstantive = 0;
    rec.raw_evidence.forEach((e, qi) => {
      quotes += 1;
      const n = normalizeForMatch(e.quote);
      const inHits = !!n && normHits.some((h) => h.includes(n));
      const inCorpus = !!n && normAllChunks.some((c) => c.norm.includes(n));
      if (!inHits) nonVerbatim += 1;
      if (!inCorpus) nonVerbatimCorpusWide += 1;
      if (inHits && isSubstantive(n)) verbatimSubstantive += 1;
      if (!inHits) {
        nonVerbatimCandidates.push({
          model: m.name, item: rec.id, quote_index: qi,
          raw_coverage: rec.raw_coverage,
          claimed_source: e.source_file ?? null,
          quote: e.quote,
          outcome: outcomeById.get(rec.id),
          quote_count_in_item: rec.raw_evidence.length,
          verbatim_elsewhere_in_corpus:
            normAllChunks.find((c) => n && c.norm.includes(n))?.id ?? null,
          hit_chunk_ids: rec.hit_chunk_ids,
        });
      }
    });
    if (rec.raw_coverage !== 'none' && verbatimSubstantive === 0) forcingDowngradesA += 1;
    if (rec.raw_coverage !== 'none' && rec.raw_evidence.length === 0) emptyEvidenceAboveNoneB += 1;

    // Re-run the PRODUCTION verifier on the raw output to confirm the delivered
    // pipeline ships zero unverifiable quotes.
    const delivered = verifyAndDowngrade(
      { coverage: rec.raw_coverage, evidence: rec.raw_evidence.map((e) => ({ ...e })), rationale: '' },
      hits.map((c) => ({ chunk: c, score: null })),
    );
    if (delivered.verifier_action === 'downgraded_to_none_no_valid_quote') verifierDowngradeActions += 1;
    for (const e of delivered.evidence ?? []) {
      deliveredQuotes += 1;
      const n = normalizeForMatch(e.quote);
      if (!normHits.some((h) => h.includes(n))) deliveredUnverifiable += 1;
    }
  }
  if (verifierDowngradeActions !== forcingDowngradesA) {
    throw new Error(`${m.name}: forcing-rule mismatch (recount ${forcingDowngradesA} vs verifier ${verifierDowngradeActions})`);
  }

  // Latency: per-item CSV, successful calls only. Median uses the run harness
  // convention sorted[floor(n/2)] so it ties out with summary.json exactly.
  const lats = items.map((r) => Number(r.latency_ms)).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const median = lats.length ? lats[Math.floor(lats.length / 2)] : null;

  const ci = wilson(nonVerbatim, quotes);
  const sum = summaries[m.spec];
  // Cross-checks against what the harness recorded at run time.
  if (sum.raw_quotes !== quotes) throw new Error(`${m.name}: quote count ${quotes} != summary ${sum.raw_quotes}`);
  if (sum.parse_failures !== parseFailures) throw new Error(`${m.name}: parse failures mismatch`);
  if (sum.raw_unverifiable !== nonVerbatimCorpusWide) {
    throw new Error(`${m.name}: corpus-wide unverifiable ${nonVerbatimCorpusWide} != summary ${sum.raw_unverifiable}`);
  }
  if (sum.raw_overclaim_items !== forcingDowngradesA) {
    throw new Error(`${m.name}: overclaim items mismatch`);
  }
  for (const k of Object.keys(cov)) {
    if (sum['cov_' + k] !== cov[k]) throw new Error(`${m.name}: cov_${k} mismatch`);
  }

  perModel.push({
    model: m.spec, type: m.type,
    items: TOTAL_ITEMS, parse_failures: parseFailures,
    quotes,
    unverifiable_quotes: nonVerbatim, // vs the item's 6 hit chunks (verifier definition)
    unverifiable_quotes_corpus_wide: nonVerbatimCorpusWide, // vs all 376 chunks
    UQR: quotes ? +(nonVerbatim / quotes).toFixed(4) : 0,
    UQR_pct: quotes ? +((100 * nonVerbatim) / quotes).toFixed(1) : 0,
    UQR_wilson95: quotes
      ? { lo_pct: +(100 * ci.lo).toFixed(1), hi_pct: +(100 * ci.hi).toFixed(1) }
      : { lo_pct: null, hi_pct: null },
    items_above_none: cov.partial + cov.substantial + cov.full,
    forcing_rule_downgrades: forcingDowngradesA, // definition-a (zero verbatim+substantive quotes)
    items_above_none_empty_evidence: emptyEvidenceAboveNoneB, // definition-b
    delivered_quotes: deliveredQuotes,
    delivered_unverifiable: deliveredUnverifiable,
    latency_ms_median: median,
    coverage_distribution: cov,
  });
}

// ---------------------------------------------------------------------------
// 2) Taxonomy of every non-verbatim quote (hand-coded after reading each quote,
//    its hit chunks, and the CSF outcome text; the script REFUSES to run if the
//    recomputed candidate set differs from the coded set, so labels can never
//    silently drift from the data)
// ---------------------------------------------------------------------------
// Categories:
//   framework_echo          quote is (≈) the official CSF outcome text, not document text
//   paraphrase_of_present   content is in the hit chunk but reworded/recombined
//   fabricated_content      invented org-specific facts (none observed)
//   near_verbatim_miss      real chunk text with a tiny model-side edit
//   cross_chunk             quote spans two chunks (none observed)
//   pdf_extraction_artifact REAL document text rejected only because the PDF
//                           extraction left noise in the chunk (split tokens,
//                           hyphenation spaces, spaces before punctuation)
//   ambiguous               none of the above cleanly applies (subtype in note)
const TAXONOMY_LABELS = {
  'ollama_llama3.1_8b|GV.OC-03|0': { category: 'framework_echo', note: 'Exact CSF outcome text for GV.OC-03 presented as a document quote; appears in no retrieved chunk.' },
  'ollama_llama3.1_8b|GV.RM-01|0': { category: 'ambiguous', subtype: 'meta_statement', note: 'Model-authored absence claim ("Risk management objectives are not explicitly mentioned in the provided evidence.") placed in the quote field; not document text and asserts no org-specific fact.' },
  'ollama_llama3.1_8b|GV.RM-04|0': { category: 'framework_echo', note: 'CSF outcome text for GV.RM-04 with an appended clause ("through the SE\'s defined risk tolerance") lifted from the hit chunk; the composite exists nowhere in the documents.' },
  'ollama_llama3.1_8b|GV.RR-02|0': { category: 'framework_echo', note: 'Exact CSF outcome text for GV.RR-02.' },
  'ollama_llama3.1_8b|GV.OV-02|0': { category: 'framework_echo', note: 'CSF outcome text for GV.OV-02 with "cybersecurity" dropped; not document text.' },
  'ollama_llama3.1_8b|GV.SC-01|0': { category: 'framework_echo', note: 'Exact CSF outcome text for GV.SC-01 (the item\'s other quote was verbatim, so coverage survived).' },
  'ollama_llama3.1_8b|GV.SC-04|0': { category: 'near_verbatim_miss', note: 'Chunk has "defining risk tolerance includes determining who is allowed to accept risk at defined risk levels (low, moderate, high)."; model inserted "SE" ("defining SE risk tolerance includes...") by fusing the preceding sentence\'s phrasing.' },
  'ollama_llama3.1_8b|GV.SC-05|0': { category: 'framework_echo', note: 'Exact CSF outcome text for GV.SC-05.' },
  'ollama_llama3.1_8b|GV.SC-07|0': { category: 'framework_echo', note: 'Exact CSF outcome text for GV.SC-07.' },
  'ollama_llama3.1_8b|GV.SC-08|0': { category: 'ambiguous', subtype: 'meta_statement', note: 'Model-authored absence claim ("Relevant suppliers and other third parties are not explicitly mentioned in this excerpt.") in the quote field.' },
  'ollama_llama3.1_8b|ID.AM-03|0': { category: 'framework_echo', note: 'Exact CSF outcome text for ID.AM-03.' },
  'ollama_llama3.1_8b|ID.RA-04|0': { category: 'near_verbatim_miss', note: 'Model wrote "Potential threats (both internal and external)..."; the chunk\'s bullet reads "threats (both internal and external)..." — a single inserted word ("Potential", echoing the outcome phrasing); the remaining 38 words incl. the bullet glyph are verbatim.' },
  'ollama_llama3.1_8b|ID.RA-08|0': { category: 'framework_echo', note: 'Exact CSF outcome text for ID.RA-08.' },
  'ollama_llama3.1_8b|PR.AA-01|0': { category: 'framework_echo', note: 'Exact CSF outcome text for PR.AA-01.' },
  'ollama_llama3.1_8b|PR.PS-01|0': { category: 'pdf_extraction_artifact', note: 'Quote is REAL document text (NYS-S15-001 §3). It fails only because PDF extraction left "( see Exhibit 1)" (stray space after the paren) and "non- patch" (line-break hyphenation space) in the chunk, while the model echoed the clean rendering "(see Exhibit 1)" / "non-patch".' },
  'ollama_llama3.1_8b|PR.PS-05|0': { category: 'near_verbatim_miss', note: 'Model wrote "Controls must be implemented to allow only SE approved software..."; the document\'s item 10 reads "Controls must be in place to allow only..." — the verb phrase was borrowed from the adjacent item 9 ("Controls must be implemented to limit storage...").' },
  'ollama_llama3.1_8b|DE.CM-03|1': { category: 'near_verbatim_miss', note: 'Text is verbatim chunk text but the model appended a truncation ellipsis "..." ("...outlined in this policy..."), which the substring check rightly does not strip.' },
  'ollama_llama3.1_8b|DE.CM-06|0': { category: 'pdf_extraction_artifact', note: 'Quote is REAL document text (NYS-P03-002 item 14). The chunk\'s extracted text has a space before the comma ("Security Logging Standard ,"); the model echoed the typographically clean "Standard," and the substring match fails on that single space.' },
  'ollama_llama3.1_8b|RC.RP-01|0': { category: 'framework_echo', note: 'CSF outcome text for RC.RP-01 plus a final period.' },
  'ollama_gemma2_9b|ID.RA-06|0': { category: 'framework_echo', note: 'CSF outcome text for ID.RA-06 plus a final period.' },
  'ollama_gemma2_9b|PR.PS-01|0': { category: 'ambiguous', subtype: 'non_contiguous_splice', note: 'Both halves are verbatim in the SAME chunk ("This process must include the following:" and the "Overseeing patch distribution..." bullet), but the model spliced them together, silently omitting the intervening first bullet — real text, unfaithful joining.' },
  'ollama_gemma2_9b|DE.AE-08|0': { category: 'near_verbatim_miss', note: 'Model replaced the document\'s list marker "1." with a bullet "•" before "Declare Incident"; every following word ("Declare Incident • This involves the review of anomalies ... the nature of the incident.") is verbatim in the chunk.' },
  'ollama_mistral_7b|ID.IM-02|0': { category: 'paraphrase_of_present', note: 'Fuses the subject of item 3 ("vulnerability scanning, and penetration testing") with the predicate of item 4 ("must be included in third party agreements"), dropping item 4\'s "and mitigation provisions" — all content present in the chunk, wording recombined.' },
};

const candKeys = new Set(nonVerbatimCandidates.map((c) => `${c.model}|${c.item}|${c.quote_index}`));
const labelKeys = new Set(Object.keys(TAXONOMY_LABELS));
for (const k of candKeys) if (!labelKeys.has(k)) throw new Error(`unlabelled non-verbatim quote: ${k}`);
for (const k of labelKeys) if (!candKeys.has(k)) throw new Error(`stale taxonomy label (no matching quote): ${k}`);

// Attach, for each entry, an excerpt of the hit chunk closest to the quote
// (most shared content words) so a reader can compare quote vs chunk directly.
const contentWords = (s) => normalizeForMatch(s).match(/[a-z]{3,}/g) ?? [];
function bestChunkExcerpt(c) {
  const qTokens = new Set(contentWords(c.quote));
  let best = null;
  for (const id of c.hit_chunk_ids) {
    const overlap = [...new Set(contentWords(chunkById.get(id).text))].filter((t) => qTokens.has(t)).length;
    if (!best || overlap > best.overlap) best = { id, overlap };
  }
  const norm = normChunkById.get(best.id);
  const words = normalizeForMatch(c.quote).split(' ');
  let at = -1;
  for (let st = 0; st < words.length && at < 0; st++) {
    for (let len = Math.min(8, words.length - st); len >= 3; len--) {
      const p = norm.indexOf(words.slice(st, st + len).join(' '));
      if (p >= 0) { at = p; break; }
    }
  }
  const excerpt = at >= 0
    ? norm.slice(Math.max(0, at - 120), at + Math.min(420, words.join(' ').length + 200))
    : norm.slice(0, 300);
  return { chunk_id: best.id, shared_content_words: best.overlap, chunk_excerpt_normalized: (at > 120 ? '…' : '') + excerpt + '…' };
}

const taxonomyEntries = nonVerbatimCandidates.map((c) => {
  const lab = TAXONOMY_LABELS[`${c.model}|${c.item}|${c.quote_index}`];
  return { ...c, category: lab.category, ...(lab.subtype ? { subtype: lab.subtype } : {}), analyst_note: lab.note, nearest_hit_chunk: bestChunkExcerpt(c) };
});
const CATEGORIES = ['framework_echo', 'paraphrase_of_present', 'fabricated_content', 'near_verbatim_miss', 'cross_chunk', 'pdf_extraction_artifact', 'ambiguous'];
const countBy = (entries) => Object.fromEntries(CATEGORIES.map((cat) => [cat, entries.filter((e) => e.category === cat).length]));
const taxonomy = {
  description: 'Every non-verbatim quote on corpus 2 (normalized quote not a substring of any of the item\'s 6 normalized hit chunks), classified after manual review of the quote, the hit chunks, and the CSF outcome text. All 23 came from local models; the 3 cloud models produced 0.',
  normalization: "NFC; ‘’‛->'; “”->\"; –—->-; whitespace collapse; trim; lowercase",
  total: taxonomyEntries.length,
  counts_by_category: countBy(taxonomyEntries),
  counts_by_model: Object.fromEntries(
    [...new Set(taxonomyEntries.map((e) => e.model))].map((mdl) => [mdl, { total: taxonomyEntries.filter((e) => e.model === mdl).length, ...countBy(taxonomyEntries.filter((e) => e.model === mdl)) }]),
  ),
  entries: taxonomyEntries,
};

// ---------------------------------------------------------------------------
// 3) Cross-model agreement — Krippendorff's ordinal alpha
//    (implementation adapted verbatim from eval/agreement-alpha.mjs, which
//    carries the full validation suite; the canonical checks are re-run here)
// ---------------------------------------------------------------------------
function krippendorffAlpha(units, metric, valueDomain) {
  const observed = new Set();
  for (const u of units) for (const v of u) observed.add(v);
  const domain = (valueDomain ?? [...observed]).slice().sort((a, b) => a - b);
  const idx = new Map(domain.map((v, i) => [v, i]));
  const C = domain.length;
  const o = Array.from({ length: C }, () => new Array(C).fill(0));
  for (const u of units) {
    const m = u.length;
    if (m < 2) continue;
    const w = 1 / (m - 1);
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
      if (i !== j) o[idx.get(u[i])][idx.get(u[j])] += w;
    }
  }
  const nC = o.map((row) => row.reduce((a, b) => a + b, 0));
  const n = nC.reduce((a, b) => a + b, 0);
  if (n === 0) return { alpha: NaN, n };
  function delta(c, k) {
    if (c === k) return 0;
    if (metric === 'nominal') return 1;
    if (metric === 'interval') return (domain[c] - domain[k]) ** 2;
    if (metric === 'ordinal') {
      let cum = 0;
      for (let g = c; g <= k; g++) cum += nC[g];
      return (cum - (nC[c] + nC[k]) / 2) ** 2;
    }
    throw new Error(`unknown metric ${metric}`);
  }
  let Do = 0, De = 0;
  for (let c = 0; c < C; c++) for (let k = c + 1; k < C; k++) {
    const d = delta(c, k);
    Do += o[c][k] * d;
    De += nC[c] * nC[k] * d;
  }
  if (De === 0) return { alpha: NaN, n };
  return { alpha: 1 - ((n - 1) * Do) / De, n };
}

// Re-run the canonical validation checks from eval/agreement-alpha.mjs.
{
  const X = null;
  const A = [X, X, X, X, X, 3, 4, 1, 2, 1, 1, 3, 3, X, 3];
  const B = [1, X, 2, 1, 3, 3, 4, 3, X, X, X, X, X, X, X];
  const Cc = [X, X, 2, 1, 3, 4, 4, X, 2, 1, 1, 3, 3, X, 4];
  const canon = A.map((_, i) => [A[i], B[i], Cc[i]].filter((v) => v !== null));
  const checks = [
    [krippendorffAlpha(canon, 'nominal').alpha, 0.691, 5e-4, 'canonical nominal'],
    [krippendorffAlpha(canon, 'interval').alpha, 0.811, 5e-4, 'canonical interval'],
    [krippendorffAlpha([[0, 0], [1, 1], [2, 2], [3, 3], [0, 3]], 'ordinal').alpha, 334 / 775, 1e-12, 'hand ordinal'],
    [krippendorffAlpha([[0, 0], [1, 1], [0, 1]], 'nominal').alpha, 4 / 9, 1e-12, 'hand nominal'],
    [krippendorffAlpha([0, 1, 2, 3, 0, 1, 2, 3].map((v) => [v, v, v]), 'ordinal').alpha, 1, 0, 'perfect ordinal'],
  ];
  for (const [got, want, eps, label] of checks) {
    if (Math.abs(got - want) > eps) throw new Error(`alpha validation FAILED: ${label} got ${got} want ${want}`);
  }
}

const LEVELS = ['none', 'partial', 'substantial', 'full'];
const CODE = new Map(LEVELS.map((l, i) => [l, i]));
const VALID = new Set(LEVELS);

function loadRaters(specs /* [{name, file}] */) {
  return specs.map(({ name, file }) => {
    const map = new Map();
    for (const rec of readJsonl(file)) {
      if (typeof rec.id === 'string' && VALID.has(rec.raw_coverage) && !map.has(rec.id)) map.set(rec.id, rec.raw_coverage);
    }
    return { name, map, valid: map.size };
  });
}

function agreementStats(raters, label) {
  const incl = raters.filter((r) => r.valid >= TOTAL_ITEMS * 0.5);
  const excluded = raters.filter((r) => r.valid < TOTAL_ITEMS * 0.5).map((r) => `${r.name} (${r.valid}/106)`);
  const ids = [...new Set(incl.flatMap((r) => [...r.map.keys()]))].sort();
  if (ids.length !== TOTAL_ITEMS) throw new Error(`${label}: ${ids.length} ids`);
  const R = incl.length;
  let unanimous = 0;
  for (const id of ids) {
    const vs = incl.map((r) => r.map.get(id)).filter((v) => v !== undefined);
    if (vs.length === R && new Set(vs).size === 1) unanimous++;
  }
  const pair = [];
  for (let i = 0; i < R; i++) for (let j = i + 1; j < R; j++) {
    let both = 0, same = 0;
    for (const id of ids) {
      const a = incl[i].map.get(id), b = incl[j].map.get(id);
      if (a !== undefined && b !== undefined) { both++; if (a === b) same++; }
    }
    pair.push((100 * same) / both);
  }
  const units = ids.map((id) => incl.map((r) => r.map.get(id)).filter((v) => v !== undefined).map((v) => CODE.get(v)));
  const ord = krippendorffAlpha(units, 'ordinal', [0, 1, 2, 3]);
  const intv = krippendorffAlpha(units, 'interval', [0, 1, 2, 3]);
  return {
    raters: incl.map((r) => ({ name: r.name, valid_verdicts: r.valid })),
    excluded_raters: excluded,
    n_raters: R,
    unanimity_count: unanimous,
    unanimity_pct: +((100 * unanimous) / TOTAL_ITEMS).toFixed(1),
    mean_pairwise_agreement_pct: +(pair.reduce((a, b) => a + b, 0) / pair.length).toFixed(1),
    krippendorff_alpha_ordinal: +ord.alpha.toFixed(4),
    krippendorff_alpha_interval: +intv.alpha.toFixed(4),
  };
}

const corpus2Raters = loadRaters(MODELS.map((m) => ({ name: m.name, file: P(m.dir, `raw_${m.name}.jsonl`) })));
const corpus2Agreement = agreementStats(corpus2Raters, 'corpus2');
const corpus1Raters7 = loadRaters(MODELS.map((m) => ({ name: m.name, file: P(CORPUS1_DIR, `raw_${m.name}.jsonl`) })));
const corpus1Agreement7 = agreementStats(corpus1Raters7, 'corpus1-same7');

// ---------------------------------------------------------------------------
// 4) Retrieval exposure
// ---------------------------------------------------------------------------
const exposure = {
  corpus2_chunks: index.chunks.length, // confirmed 376
  topk: TOPK,
  corpus2_chunks_seen_per_query_pct: +((100 * TOPK) / index.chunks.length).toFixed(2),
  corpus1_chunks: JSON.parse(fs.readFileSync(P(CORPUS1_DIR, '_index/index.json'), 'utf8')).chunks.length,
  corpus1_chunks_seen_per_query_pct: null, // filled below
};
exposure.corpus1_chunks_seen_per_query_pct = +((100 * Math.min(TOPK, exposure.corpus1_chunks)) / exposure.corpus1_chunks).toFixed(1);
if (exposure.corpus2_chunks !== 376) throw new Error(`corpus-2 chunk count ${exposure.corpus2_chunks} != 376`);

// ---------------------------------------------------------------------------
// Assemble + write
// ---------------------------------------------------------------------------
// Corpus-1 reference UQRs (computed previously over the same 7 models on the
// 8-chunk synthetic corpus) for side-by-side comparison.
const CORPUS1_UQR_REFERENCE = {
  'ollama:llama3.1:8b': { uqr_pct: 17.7, quotes: 96 },
  'ollama:gemma2:9b': { uqr_pct: 0.0, quotes: 72 },
  'ollama:qwen2.5:7b': { uqr_pct: 7.7, quotes: 13 },
  'ollama:mistral:7b': { uqr_pct: 5.8, quotes: 52 },
  'openai:gpt-4o-mini': { uqr_pct: 0.0, quotes: 14 },
  'openai:gpt-4o': { uqr_pct: 2.1, quotes: 48 },
  'openai:gpt-5.5': { uqr_pct: 0.0, quotes: 109 },
};

const analysis = {
  generated_by: 'eval/corpus2-analysis.mjs',
  generated_at: new Date().toISOString(),
  corpus: {
    name: 'corpus-2: 12 New York State ITS security policy PDFs (real public documents)',
    index_id: index.index_id,
    chunks: index.chunks.length,
    embedder: index.embedder_id,
    subcategories: TOTAL_ITEMS,
    topk: TOPK,
  },
  definitions: {
    normalization: "NFC; ‘’‛->'; “”->\"; –—->-; whitespace collapse; trim; lowercase (src/engine/verifier.js normalizeForMatch)",
    verbatim: "normalized quote is a substring of ONE normalized hit-chunk text (the item's 6 retrieved chunks)",
    substantive: 'normalized length >= 20 AND >= 3 matches of /[a-z]{3,}/g',
    UQR: 'unverifiable quotes / total quotes (verbatim-vs-hit-chunks definition)',
    forcing_rule_downgrades: 'definition-a: items with coverage > none and ZERO quotes that are verbatim AND substantive (verified identical to the production verifier\'s downgrade count)',
    items_above_none_empty_evidence: 'definition-b: items with coverage > none and an EMPTY evidence array',
    latency_median: 'per-item latencies (items_*.csv), sorted[floor(n/2)] — same convention as the run harness',
  },
  per_model: perModel.map((r) => ({
    ...r,
    corpus1_reference: CORPUS1_UQR_REFERENCE[r.model] ?? null,
  })),
  taxonomy_summary: {
    file: 'eval/results-corpus2/dropped_quote_taxonomy_corpus2.json',
    total_non_verbatim_quotes: taxonomy.total,
    counts_by_category: taxonomy.counts_by_category,
    counts_by_model: taxonomy.counts_by_model,
    forcing_rule_interaction: {
      sole_support_of_above_none_claim: taxonomyEntries.filter((e) => e.raw_coverage !== 'none' && e.quote_count_in_item === 1).length,
      item_had_another_verbatim_substantive_quote: taxonomyEntries.filter((e) => e.quote_count_in_item > 1).length,
    },
    verbatim_elsewhere_in_corpus: taxonomyEntries.filter((e) => e.verbatim_elsewhere_in_corpus).length,
  },
  agreement: {
    metric: "raw_coverage as ordinal none=0 partial=1 substantial=2 full=3; Krippendorff's alpha (coincidence-matrix formulation; implementation validated against the canonical Krippendorff worked example and hand-computed cases)",
    inclusion_rule: '>= 50% valid verdicts (>= 53/106); all 7 models passed with 106/106 on both corpora',
    corpus2_7_models: corpus2Agreement,
    corpus1_same_7_models: corpus1Agreement7,
    corpus1_all_11_models_reference: { unanimity_pct: 11.3, krippendorff_alpha_ordinal: 0.256, note: 'previously reported over 11 models incl. 4 additional small local models; not apples-to-apples with the 7-model corpus-2 panel — see corpus1_same_7_models for the matched comparison' },
  },
  retrieval_exposure: exposure,
};

fs.writeFileSync(P('eval/results-corpus2/dropped_quote_taxonomy_corpus2.json'), JSON.stringify(taxonomy, null, 2) + '\n');
fs.writeFileSync(P('eval/results-corpus2/analysis.json'), JSON.stringify(analysis, null, 2) + '\n');

// ---------------------------------------------------------------------------
// Console report
// ---------------------------------------------------------------------------
const pct = (x) => (x === null ? 'n/a' : x.toFixed ? x.toFixed(1) + '%' : x + '%');
console.log('CORPUS-2 ANALYSIS (12 real NYS ITS policy PDFs, 376 chunks, k=6)');
console.log('='.repeat(100));
console.log('\n[1] PER MODEL');
for (const r of perModel) {
  console.log(`  ${r.model.padEnd(20)} quotes=${String(r.quotes).padStart(3)}  UQR=${pct(r.UQR_pct).padStart(6)} [${pct(r.UQR_wilson95.lo_pct)}..${pct(r.UQR_wilson95.hi_pct)}]  parse_fail=${r.parse_failures}  above_none=${String(r.items_above_none).padStart(3)}  downgrades=${String(r.forcing_rule_downgrades).padStart(2)}  empty_ev_above_none=${r.items_above_none_empty_evidence}  delivered_unverif=${r.delivered_unverifiable}  med_latency=${r.latency_ms_median}ms  cov n/p/s/f=${r.coverage_distribution.none}/${r.coverage_distribution.partial}/${r.coverage_distribution.substantial}/${r.coverage_distribution.full}`);
}
console.log('\n[2] NON-VERBATIM QUOTE TAXONOMY (all models, n=' + taxonomy.total + ')');
console.log('  by category:', JSON.stringify(taxonomy.counts_by_category));
for (const [mdl, c] of Object.entries(taxonomy.counts_by_model)) console.log(`  ${mdl}:`, JSON.stringify(c));
console.log('\n[3] AGREEMENT (7 models, 106 outcomes)');
const a2 = corpus2Agreement, a1 = corpus1Agreement7;
console.log(`  corpus 2 : unanimity ${a2.unanimity_count}/106 = ${a2.unanimity_pct}% | mean pairwise ${a2.mean_pairwise_agreement_pct}% | alpha_ordinal ${a2.krippendorff_alpha_ordinal} (interval ${a2.krippendorff_alpha_interval})`);
console.log(`  corpus 1 (same 7): unanimity ${a1.unanimity_count}/106 = ${a1.unanimity_pct}% | mean pairwise ${a1.mean_pairwise_agreement_pct}% | alpha_ordinal ${a1.krippendorff_alpha_ordinal} (interval ${a1.krippendorff_alpha_interval})`);
console.log('  corpus 1 (all 11, reference): unanimity 11.3% | alpha_ordinal 0.256');
console.log('\n[4] RETRIEVAL EXPOSURE');
console.log(`  corpus 2: k=${TOPK} of ${exposure.corpus2_chunks} chunks = ${exposure.corpus2_chunks_seen_per_query_pct}% per query`);
console.log(`  corpus 1: k=${TOPK} of ${exposure.corpus1_chunks} chunks = ${exposure.corpus1_chunks_seen_per_query_pct}% per query`);
console.log('\nWrote eval/results-corpus2/analysis.json and eval/results-corpus2/dropped_quote_taxonomy_corpus2.json');
