#!/usr/bin/env node
/**
 * RUN-TO-RUN STABILITY ANALYSIS (corpus 1, identical retrieval, 3 runs).
 *
 * Three runs of the same experiment over the 106 NIST CSF 2.0 subcategories:
 *   Run 1: eval/results-spectrum/        (cloud + local raw files)
 *   Run 2: eval/results-rerun2/  (cloud) + eval/results-rerun2-local/ (local)
 *   Run 3: eval/results-rerun3/  (cloud) + eval/results-rerun3-local/ (local)
 * (results-rerun2/ and results-rerun3/ also contain 1-byte placeholder
 *  raw_ollama_*.jsonl files from a failed local pass; the real local-model
 *  data for runs 2 and 3 lives in the *-local directories.)
 *
 * Per model (7 models = 3 cloud + 4 local) this script computes:
 *  1. UQR per run, recomputed from the raw files: a quote is verbatim iff its
 *     normalized text is a substring of the normalized text of one of the
 *     record's hit chunks (hit_chunk_ids resolved via that run's
 *     _index/index.json). Normalization = normalizeForMatch from
 *     src/engine/verifier.js (NFC; curly quotes/dashes folded; whitespace
 *     collapsed; trimmed; lowercased) — the exact production rule.
 *  2. DETERMINISM (local models): % of the 106 outcomes with the identical
 *     verdict across the 3 runs, and % with the identical full record
 *     (verdict + same set of (source_file, quote) evidence pairs). File-level
 *     SHA-256 of each raw file is also reported.
 *  3. SELF-CONSISTENCY (cloud models): % of outcomes with identical verdict
 *     across the 3 runs, count of self-contradictions, the differing outcomes
 *     (worst first, by ordinal spread), and Krippendorff's alpha (ordinal,
 *     none=0 partial=1 substantial=2 full=3) treating the 3 runs as 3 raters.
 *     The alpha implementation is copied from eval/agreement-alpha.mjs
 *     (validated there against the canonical Krippendorff worked example and
 *     hand-computed cases); the same validation suite is re-run here and the
 *     script aborts if it fails.
 *  4. gpt-4o's unverifiable quote: which runs it appears in, on which outcome,
 *     and whether the quote text is identical each time.
 *
 * Usage: node eval/stability-analysis.mjs
 * Writes: eval/results-stability/stability.json and stability.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeForMatch } from '../src/engine/verifier.js';

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(EVAL_DIR, 'results-stability');

const LEVELS = ['none', 'partial', 'substantial', 'full'];
const CODE = new Map(LEVELS.map((l, i) => [l, i]));
const VALID = new Set(LEVELS);
const TOTAL = 106;

const MODELS = [
  { name: 'openai_gpt-4o-mini', kind: 'cloud' },
  { name: 'openai_gpt-4o', kind: 'cloud' },
  { name: 'openai_gpt-5.5', kind: 'cloud' },
  { name: 'ollama_llama3.1_8b', kind: 'local' },
  { name: 'ollama_gemma2_9b', kind: 'local' },
  { name: 'ollama_qwen2.5_7b', kind: 'local' },
  { name: 'ollama_mistral_7b', kind: 'local' },
];

// Which results directory holds each run's raw file, by model kind.
const RUN_DIRS = {
  cloud: { run1: 'results-spectrum', run2: 'results-rerun2', run3: 'results-rerun3' },
  local: { run1: 'results-spectrum', run2: 'results-rerun2-local', run3: 'results-rerun3-local' },
};
const RUNS = ['run1', 'run2', 'run3'];

// --------------------------------------------------------------------------
// Krippendorff's alpha — copied verbatim from eval/agreement-alpha.mjs
// (coincidence-matrix formulation, Krippendorff 2011). Copied rather than
// imported because that module runs its full spectrum analysis at import time.
// --------------------------------------------------------------------------
function krippendorffAlpha(units, metric, valueDomain) {
  const observed = new Set();
  for (const u of units) for (const v of u) observed.add(v);
  const domain = (valueDomain ?? [...observed]).slice().sort((a, b) => a - b);
  const idx = new Map(domain.map((v, i) => [v, i]));
  const C = domain.length;

  const o = Array.from({ length: C }, () => new Array(C).fill(0));
  for (const u of units) {
    const m = u.length;
    if (m < 2) continue; // unpairable unit
    const w = 1 / (m - 1);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        if (i === j) continue;
        o[idx.get(u[i])][idx.get(u[j])] += w;
      }
    }
  }
  const nC = o.map((row) => row.reduce((a, b) => a + b, 0));
  const n = nC.reduce((a, b) => a + b, 0);
  if (n === 0) return { alpha: NaN, n, note: 'no pairable values' };

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

  let Do = 0;
  let De = 0;
  for (let c = 0; c < C; c++) {
    for (let k = c + 1; k < C; k++) {
      const d = delta(c, k);
      Do += o[c][k] * d;
      De += nC[c] * nC[k] * d;
    }
  }
  if (De === 0) {
    return { alpha: NaN, n, Do, De, note: 'De=0 (single observed category)' };
  }
  return { alpha: 1 - ((n - 1) * Do) / De, n, Do, De };
}

// Validation suite (same cases as eval/agreement-alpha.mjs). Abort on failure.
function validateAlpha() {
  const approxEq = (a, b, eps) => Math.abs(a - b) <= eps;
  const failures = [];
  const check = (label, got, want, eps) => {
    if (!approxEq(got, want, eps)) failures.push(`${label}: got ${got}, expected ${want}`);
  };
  const perfect = [0, 1, 2, 3, 0, 1, 2, 3].map((v) => [v, v, v]);
  for (const m of ['nominal', 'ordinal', 'interval']) {
    check(`perfect agreement (${m})`, krippendorffAlpha(perfect, m).alpha, 1, 0);
  }
  // Canonical 3-coder example (Krippendorff; Wikipedia worked example):
  // alpha_nominal = 0.691, alpha_interval = 0.811.
  const X = null;
  const A = [X, X, X, X, X, 3, 4, 1, 2, 1, 1, 3, 3, X, 3];
  const B = [1, X, 2, 1, 3, 3, 4, 3, X, X, X, X, X, X, X];
  const Cc = [X, X, 2, 1, 3, 4, 4, X, 2, 1, 1, 3, 3, X, 4];
  const canon = A.map((_, i) => [A[i], B[i], Cc[i]].filter((v) => v !== null));
  check('canonical nominal', krippendorffAlpha(canon, 'nominal').alpha, 0.691, 5e-4);
  check('canonical interval', krippendorffAlpha(canon, 'interval').alpha, 0.811, 5e-4);
  // Hand-computed 2-rater ordinal/interval case (arithmetic in agreement-alpha.mjs).
  const hand = [[0, 0], [1, 1], [2, 2], [3, 3], [0, 3]];
  check('hand ordinal (=334/775)', krippendorffAlpha(hand, 'ordinal').alpha, 334 / 775, 1e-12);
  check('hand interval (=64/145)', krippendorffAlpha(hand, 'interval').alpha, 64 / 145, 1e-12);
  check('hand nominal (=4/9)', krippendorffAlpha([[0, 0], [1, 1], [0, 1]], 'nominal').alpha, 4 / 9, 1e-12);
  if (failures.length) {
    console.error('ALPHA VALIDATION FAILED:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log('Alpha implementation validation: PASSED (perfect-agreement, canonical Krippendorff example, hand-computed cases)');
}

// --------------------------------------------------------------------------
// Data loading
// --------------------------------------------------------------------------
function mustExist(p, what) {
  if (!fs.existsSync(p)) {
    console.error(`MISSING FILE: ${what} not found at ${p}`);
    process.exit(1);
  }
  return p;
}

const indexCache = new Map(); // dir -> Map(chunk_id -> normalized text)
function loadIndex(dir) {
  if (indexCache.has(dir)) return indexCache.get(dir);
  const p = mustExist(path.join(EVAL_DIR, dir, '_index', 'index.json'), `${dir} chunk index`);
  const idx = JSON.parse(fs.readFileSync(p, 'utf8'));
  const map = new Map(idx.chunks.map((c) => [c.id, normalizeForMatch(c.text)]));
  indexCache.set(dir, map);
  return map;
}

/** Load one raw_<model>.jsonl: Map(id -> {verdict, quotes:[{source_file,quote,verbatim}]}). */
function loadRun(dir, model) {
  const p = mustExist(path.join(EVAL_DIR, dir, `raw_${model}.jsonl`), `${dir} raw file for ${model}`);
  const chunkNorm = loadIndex(dir);
  const records = new Map();
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    const o = JSON.parse(s);
    if (typeof o.id !== 'string') throw new Error(`${p}: record without id`);
    if (!VALID.has(o.raw_coverage)) throw new Error(`${p}: invalid raw_coverage "${o.raw_coverage}" on ${o.id}`);
    if (records.has(o.id)) throw new Error(`${p}: duplicate id ${o.id}`);
    // Normalized texts of THIS record's hit chunks — the verification scope.
    const hitNorms = (o.hit_chunk_ids ?? []).map((cid) => {
      const t = chunkNorm.get(cid);
      if (t === undefined) throw new Error(`${p}: unknown hit_chunk_id ${cid} on ${o.id}`);
      return t;
    });
    const quotes = (o.raw_evidence ?? []).map((e) => {
      const n = normalizeForMatch(e.quote);
      const verbatim = !!n && hitNorms.some((c) => c.includes(n));
      return { source_file: e.source_file, quote: e.quote, verbatim };
    });
    records.set(o.id, { verdict: o.raw_coverage, quotes });
  }
  if (records.size !== TOTAL) {
    throw new Error(`${p}: expected ${TOTAL} records, got ${records.size}`);
  }
  return { records, sha256: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') };
}

/** Canonical key for the full record: verdict + sorted set of (source_file, quote) pairs. */
function recordKey(rec) {
  const ev = rec.quotes.map((q) => [q.source_file, q.quote]).sort((a, b) =>
    (a[0] + ' ' + a[1]).localeCompare(b[0] + ' ' + b[1]));
  return JSON.stringify([rec.verdict, ev]);
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
validateAlpha();

const results = [];
for (const { name, kind } of MODELS) {
  const dirs = RUN_DIRS[kind];
  const runs = {};
  for (const r of RUNS) runs[r] = loadRun(dirs[r], name);

  // Same 106 ids in every run?
  const ids = [...runs.run1.records.keys()].sort();
  for (const r of RUNS) {
    const other = [...runs[r].records.keys()].sort();
    if (JSON.stringify(other) !== JSON.stringify(ids)) {
      throw new Error(`${name}: id set differs between run1 and ${r}`);
    }
  }

  // 1. UQR + quote count per run
  const uqr = {};
  for (const r of RUNS) {
    let quotes = 0;
    let unverifiable = 0;
    const unverifiableList = [];
    for (const [id, rec] of runs[r].records) {
      for (const q of rec.quotes) {
        quotes++;
        if (!q.verbatim) {
          unverifiable++;
          unverifiableList.push({ outcome: id, source_file: q.source_file, quote: q.quote });
        }
      }
    }
    uqr[r] = {
      dir: dirs[r],
      raw_quotes: quotes,
      raw_unverifiable: unverifiable,
      UQR: quotes ? +(unverifiable / quotes).toFixed(4) : null,
      unverifiable_quotes: unverifiableList,
      raw_file_sha256: runs[r].sha256,
    };
  }

  // 2/3. Verdict & full-record agreement across the 3 runs
  let verdictIdentical = 0;
  let recordIdentical = 0;
  const diffs = [];
  const units = []; // for alpha: one unit per outcome, 3 "raters" = 3 runs
  for (const id of ids) {
    const recs = RUNS.map((r) => runs[r].records.get(id));
    const verdicts = recs.map((x) => x.verdict);
    units.push(verdicts.map((v) => CODE.get(v)));
    const sameVerdict = verdicts.every((v) => v === verdicts[0]);
    if (sameVerdict) verdictIdentical++;
    else {
      const codes = verdicts.map((v) => CODE.get(v));
      diffs.push({
        outcome: id,
        run1: verdicts[0],
        run2: verdicts[1],
        run3: verdicts[2],
        ordinal_spread: Math.max(...codes) - Math.min(...codes),
        distinct_verdicts: new Set(verdicts).size,
      });
    }
    if (sameVerdict && recs.every((x) => recordKey(x) === recordKey(recs[0]))) recordIdentical++;
  }
  diffs.sort((a, b) =>
    b.ordinal_spread - a.ordinal_spread ||
    b.distinct_verdicts - a.distinct_verdicts ||
    a.outcome.localeCompare(b.outcome));

  const alpha = krippendorffAlpha(units, 'ordinal', [0, 1, 2, 3]);
  const filesByteIdentical = runs.run1.sha256 === runs.run2.sha256 && runs.run1.sha256 === runs.run3.sha256;

  results.push({
    model: name,
    kind,
    n_outcomes: TOTAL,
    uqr_per_run: uqr,
    verdict_identical_across_3_runs: { count: verdictIdentical, pct: +((100 * verdictIdentical) / TOTAL).toFixed(2) },
    full_record_identical_across_3_runs: { count: recordIdentical, pct: +((100 * recordIdentical) / TOTAL).toFixed(2) },
    self_contradictions: { count: diffs.length, outcomes: diffs },
    krippendorff_alpha_ordinal_3runs: Number.isNaN(alpha.alpha) ? null : +alpha.alpha.toFixed(4),
    krippendorff_alpha_note: alpha.note ?? null,
    raw_files_byte_identical_across_3_runs: filesByteIdentical,
  });
}

// 4. gpt-4o's unverifiable quote across runs
const gpt4o = results.find((m) => m.model === 'openai_gpt-4o');
const perRunUnverif = RUNS.map((r) => gpt4o.uqr_per_run[r].unverifiable_quotes);
const appearsInRuns = RUNS.filter((_, i) => perRunUnverif[i].length > 0);
const flat = perRunUnverif.flat();
const gpt4oUnverifiable = {
  per_run_counts: Object.fromEntries(RUNS.map((r, i) => [r, perRunUnverif[i].length])),
  appears_in_runs: appearsInRuns,
  same_outcome_every_time: flat.length > 0 && flat.every((q) => q.outcome === flat[0].outcome),
  same_quote_text_every_time: flat.length > 0 && flat.every((q) => q.quote === flat[0].quote),
  outcome: flat[0]?.outcome ?? null,
  source_file: flat[0]?.source_file ?? null,
  quote: flat[0]?.quote ?? null,
  per_run_detail: Object.fromEntries(RUNS.map((r, i) => [r, perRunUnverif[i]])),
};

// Cross-check recomputed quote counts/UQR against each run's summary.json
// (summary.json was produced by run-experiment.mjs, which matches quotes
// against ALL index chunks; we match against the record's hit chunks per the
// analysis spec — any discrepancy is flagged here).
const summaryName = (m) => {
  const i = m.indexOf('_');
  return m.slice(0, i) + ':' + m.slice(i + 1).replace(/_/g, ':');
};
const crossChecks = [];
for (const m of results) {
  for (const r of RUNS) {
    const dir = m.uqr_per_run[r].dir;
    const sj = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, dir, 'summary.json'), 'utf8'));
    const rows = Array.isArray(sj) ? sj : sj.models ?? Object.values(sj);
    const row = rows.find((x) => x && x.model === summaryName(m.model));
    if (!row) { crossChecks.push({ model: m.model, run: r, note: 'model not in summary.json' }); continue; }
    const match = row.raw_quotes === m.uqr_per_run[r].raw_quotes && row.raw_unverifiable === m.uqr_per_run[r].raw_unverifiable;
    crossChecks.push({
      model: m.model, run: r, match,
      summary: { raw_quotes: row.raw_quotes, raw_unverifiable: row.raw_unverifiable, UQR: row.UQR },
      recomputed: { raw_quotes: m.uqr_per_run[r].raw_quotes, raw_unverifiable: m.uqr_per_run[r].raw_unverifiable, UQR: m.uqr_per_run[r].UQR },
    });
  }
}
const crossOK = crossChecks.every((c) => c.match);

// --------------------------------------------------------------------------
// Output
// --------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });

const out = {
  generated_at: new Date().toISOString(),
  script: 'eval/stability-analysis.mjs',
  spec: {
    corpus: 'corpus 1 (Northwind sample docs), identical retrieval across runs',
    n_outcomes: TOTAL,
    runs: RUN_DIRS,
    normalization: 'normalizeForMatch (src/engine/verifier.js): NFC; ‘’‛->\'; “”->"; –—->-; whitespace collapsed; trim; lowercase',
    verbatim_rule: 'quote verbatim iff normalized quote is a substring of a normalized hit-chunk text (record-level hit_chunk_ids, resolved via the run dir\'s _index/index.json)',
    ordinal_coding: { none: 0, partial: 1, substantial: 2, full: 3 },
    alpha: "Krippendorff's alpha, ordinal metric, 3 runs as 3 raters; implementation copied from eval/agreement-alpha.mjs and re-validated in this script",
  },
  summary_cross_check: { all_match: crossOK, detail: crossChecks },
  models: results,
  gpt4o_unverifiable_quote: gpt4oUnverifiable,
};
fs.writeFileSync(path.join(OUT_DIR, 'stability.json'), JSON.stringify(out, null, 2));

const csvEsc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
const csvHeader = [
  'model', 'kind',
  'run1_quotes', 'run1_unverifiable', 'run1_UQR',
  'run2_quotes', 'run2_unverifiable', 'run2_UQR',
  'run3_quotes', 'run3_unverifiable', 'run3_UQR',
  'verdict_identical_n', 'verdict_identical_pct',
  'full_record_identical_n', 'full_record_identical_pct',
  'self_contradictions_n', 'alpha_ordinal_3runs', 'raw_files_byte_identical',
];
const csvRows = results.map((m) => [
  m.model, m.kind,
  m.uqr_per_run.run1.raw_quotes, m.uqr_per_run.run1.raw_unverifiable, m.uqr_per_run.run1.UQR,
  m.uqr_per_run.run2.raw_quotes, m.uqr_per_run.run2.raw_unverifiable, m.uqr_per_run.run2.UQR,
  m.uqr_per_run.run3.raw_quotes, m.uqr_per_run.run3.raw_unverifiable, m.uqr_per_run.run3.UQR,
  m.verdict_identical_across_3_runs.count, m.verdict_identical_across_3_runs.pct,
  m.full_record_identical_across_3_runs.count, m.full_record_identical_across_3_runs.pct,
  m.self_contradictions.count, m.krippendorff_alpha_ordinal_3runs, m.raw_files_byte_identical_across_3_runs,
].map(csvEsc).join(','));
fs.writeFileSync(path.join(OUT_DIR, 'stability.csv'), [csvHeader.join(','), ...csvRows].join('\n') + '\n');

// --------------------------------------------------------------------------
// Console report
// --------------------------------------------------------------------------
const pct = (c) => ((100 * c) / TOTAL).toFixed(1) + '%';
console.log('\n' + '='.repeat(78));
console.log('1. UQR PER RUN (recomputed from raw files; verbatim vs record hit chunks)');
console.log('='.repeat(78));
for (const m of results) {
  const u = m.uqr_per_run;
  console.log(`  ${m.model.padEnd(22)} quotes ${RUNS.map((r) => String(u[r].raw_quotes).padStart(3)).join('/')}  unverif ${RUNS.map((r) => u[r].raw_unverifiable).join('/')}  UQR ${RUNS.map((r) => (100 * u[r].UQR).toFixed(2) + '%').join(' / ')}`);
}
console.log(`  Cross-check vs each run's summary.json: ${crossOK ? 'ALL MATCH' : 'MISMATCHES (see stability.json summary_cross_check)'}`);

console.log('\n' + '='.repeat(78));
console.log('2. DETERMINISM — LOCAL MODELS (3 runs, temperature 0)');
console.log('='.repeat(78));
for (const m of results.filter((x) => x.kind === 'local')) {
  console.log(`  ${m.model.padEnd(22)} identical verdict: ${m.verdict_identical_across_3_runs.count}/${TOTAL} (${pct(m.verdict_identical_across_3_runs.count)})  identical full record: ${m.full_record_identical_across_3_runs.count}/${TOTAL} (${pct(m.full_record_identical_across_3_runs.count)})  raw files byte-identical: ${m.raw_files_byte_identical_across_3_runs}`);
}
const allLocalDet = results.filter((x) => x.kind === 'local').every((m) =>
  m.full_record_identical_across_3_runs.count === TOTAL);
if (allLocalDet) {
  console.log('  => 100% identical records for all 4 local models: deterministic at temperature 0 on this stack.');
}

console.log('\n' + '='.repeat(78));
console.log('3. SELF-CONSISTENCY — CLOUD MODELS (3 runs as 3 raters)');
console.log('='.repeat(78));
for (const m of results.filter((x) => x.kind === 'cloud')) {
  console.log(`  ${m.model.padEnd(22)} identical verdict: ${m.verdict_identical_across_3_runs.count}/${TOTAL} (${pct(m.verdict_identical_across_3_runs.count)})  self-contradictions: ${m.self_contradictions.count}  alpha(ordinal): ${m.krippendorff_alpha_ordinal_3runs ?? 'n/a'}`);
}
for (const target of ['openai_gpt-5.5', 'openai_gpt-4o-mini']) {
  const m = results.find((x) => x.model === target);
  console.log(`\n  Worst disagreements for ${target} (ordinal spread desc):`);
  if (m.self_contradictions.count === 0) console.log('    (none — fully self-consistent)');
  for (const d of m.self_contradictions.outcomes.slice(0, 5)) {
    console.log(`    ${d.outcome.padEnd(10)} run1=${d.run1}  run2=${d.run2}  run3=${d.run3}  (spread ${d.ordinal_spread})`);
  }
}

console.log('\n' + '='.repeat(78));
console.log("4. gpt-4o's UNVERIFIABLE QUOTE");
console.log('='.repeat(78));
console.log(`  Per-run unverifiable counts: ${RUNS.map((r) => `${r}=${gpt4oUnverifiable.per_run_counts[r]}`).join('  ')}`);
console.log(`  Appears in runs: ${gpt4oUnverifiable.appears_in_runs.join(', ') || 'none'}`);
console.log(`  Same outcome every time: ${gpt4oUnverifiable.same_outcome_every_time} (${gpt4oUnverifiable.outcome})`);
console.log(`  Same quote text every time: ${gpt4oUnverifiable.same_quote_text_every_time}`);
console.log(`  source_file: ${gpt4oUnverifiable.source_file}`);
console.log(`  quote: ${JSON.stringify(gpt4oUnverifiable.quote)}`);

console.log(`\nWrote ${path.join(OUT_DIR, 'stability.json')} and stability.csv`);
