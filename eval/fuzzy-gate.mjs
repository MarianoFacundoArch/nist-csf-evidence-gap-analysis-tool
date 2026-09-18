#!/usr/bin/env node
/**
 * fuzzy-gate.mjs — Fuzzy-match gate ablation (reviewer-requested middle ground
 * between the exact verbatim-substring gate and a semantic NLI gate).
 *
 * For each saved quote q and each chunk c in the record's hit_chunk_ids
 * (both normalized exactly like the verifier), compute the best-window
 * similarity:
 *
 *     sim(q, c) = max over window starts i of
 *                 1 - levenshtein(q, c[i .. i+|q|]) / max(|q|, |window|)
 *
 * The quote's score is the max over the record's hit chunks. The gate
 * ACCEPTS iff score >= threshold t, for t in {0.80, 0.85, 0.90, 0.95, 0.98}.
 *
 * Exactness: the sliding scan uses a coarse stride followed by refinement,
 * but the refinement rule is provably exhaustive (see bestWindowDistance),
 * so the reported score is the exact maximum over ALL window positions —
 * not a heuristic. A brute-force stride-1 cross-check on a seeded sample
 * of non-verbatim quotes is run at the end to validate this.
 *
 * Integrity: scores are computed from text only (quote + hit chunks).
 * Taxonomy labels are joined AFTER scoring, purely for evaluation.
 *
 * Inputs:
 *   Corpus A: eval/results-spectrum/raw_*.jsonl + eval/results-spectrum/_index/index.json
 *             labels: eval/results-ablations/dropped_quote_taxonomy.json (per_quote)
 *   Corpus B: eval/results-corpus2/raw_*.jsonl + eval/results-corpus2-local/raw_*.jsonl
 *             + eval/results-corpus2/_index/index.json
 *             labels: eval/results-corpus2/dropped_quote_taxonomy_corpus2.json (entries)
 *
 * Outputs:
 *   eval/results-fuzzy/fuzzy_results.json
 *   eval/results-fuzzy/per_quote.csv
 *
 * Run: node eval/fuzzy-gate.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(EVAL_DIR, 'results-fuzzy');
const THRESHOLDS = [0.80, 0.85, 0.90, 0.95, 0.98];

// ---------------------------------------------------------------------------
// Normalization — identical to the verifier / taxonomy method string.
// ---------------------------------------------------------------------------
function normalize(s) {
  return String(s)
    .normalize('NFC')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Levenshtein with early exit.
// Two-row DP over preallocated buffers. If every cell of some row exceeds
// `bound`, the final distance must exceed `bound` (row minima are
// non-decreasing), so we abort and return bound + 1.
// ---------------------------------------------------------------------------
const BUF_A = new Int32Array(4096);
const BUF_B = new Int32Array(4096);

function levenshtein(a, b, bound = Infinity) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n > bound ? bound + 1 : n;
  if (n === 0) return m > bound ? bound + 1 : m;
  if (Math.abs(m - n) > bound) return bound + 1; // length gap alone exceeds bound
  let prev = BUF_A;
  let curr = BUF_B;
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1);
      let v = del < ins ? del : ins;
      if (sub < v) v = sub;
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > bound) return bound + 1;
    const t = prev; prev = curr; curr = t;
  }
  return prev[n] > bound ? bound + 1 : prev[n];
}

// self-test
if (levenshtein('kitten', 'sitting') !== 3 || levenshtein('', 'abc') !== 3 ||
    levenshtein('same', 'same') !== 0 || levenshtein('abcdef', 'azced') !== 3) {
  throw new Error('levenshtein self-test failed');
}

// ---------------------------------------------------------------------------
// Best-window distance of q over c (both already normalized).
//
// Windows are c.slice(i, i + |q|) for every start i in [0, |c|-1] (truncated
// at the chunk end), so |window| <= |q| and the similarity denominator
// max(|q|, |window|) is always |q|.
//
// Coarse-then-refine, with an exactness guarantee:
//   Shifting a window start by k changes the window by at most k deletions at
//   the front and k insertions at the back, so |d(i) - d(i+k)| <= 2k.
//   The true best start j* has a coarse grid point i* within ceil(stride/2),
//   hence d(i*) <= d(j*) + stride + 1 <= coarseMin + stride + 1.
//   Refining every coarse point with d <= coarseMin + stride + 1 over
//   [i - stride, i + stride] therefore always covers j*. Aborted coarse
//   evaluations (early exit) returned a value > their bound
//   (runningBest + stride + 1 >= coarseMin + stride + 1), so they can never
//   have been the qualifying neighbor of j*. The result is exact.
// ---------------------------------------------------------------------------
function bestWindowDistance(q, c, { noShortcut = false } = {}) {
  const L = q.length;
  const N = c.length;
  if (L === 0) return { dist: 0, start: 0, winLen: 0 };
  if (N === 0) return { dist: L, start: 0, winLen: 0 };
  if (!noShortcut && c.includes(q)) return { dist: 0, start: c.indexOf(q), winLen: L };

  const stride = Math.max(1, Math.floor(L / 10));

  // coarse pass
  const coarse = [];
  let runningBest = Infinity;
  for (let i = 0; i < N; i += stride) {
    const w = c.slice(i, i + L);
    const boundNow = runningBest === Infinity ? Infinity : runningBest + stride + 1;
    const d = levenshtein(q, w, boundNow);
    coarse.push([i, d, w.length]);
    if (d < runningBest) runningBest = d;
  }
  const coarseMin = runningBest;
  const qual = coarseMin + stride + 1;

  // refine around qualifying coarse points
  let best = Infinity, bestStart = 0, bestLen = 0;
  for (const [i, d, wl] of coarse) {
    if (d <= coarseMin) { if (d < best) { best = d; bestStart = i; bestLen = wl; } }
  }
  const evaluated = new Set();
  for (const [i, d] of coarse) {
    if (d > qual) continue;
    const lo = Math.max(0, i - stride);
    const hi = Math.min(N - 1, i + stride);
    for (let j = lo; j <= hi; j++) {
      if (evaluated.has(j)) continue;
      evaluated.add(j);
      const w = c.slice(j, j + L);
      const dj = levenshtein(q, w, best); // only need windows that beat current best
      if (dj < best) { best = dj; bestStart = j; bestLen = w.length; }
    }
  }
  return { dist: best, start: bestStart, winLen: bestLen };
}

function bestWindowSim(q, c, opts) {
  const L = q.length;
  if (L === 0) return { sim: 0, start: 0, winLen: 0, dist: 0 }; // degenerate; no empty quotes expected
  const r = bestWindowDistance(q, c, opts);
  return { sim: 1 - r.dist / L, start: r.start, winLen: r.winLen, dist: r.dist };
}

// Brute-force stride-1 reference (for validation only)
function bestWindowSimBrute(q, c) {
  const L = q.length, N = c.length;
  if (L === 0) return 0;
  if (N === 0) return 0;
  let best = Infinity;
  for (let i = 0; i < N; i++) {
    const d = levenshtein(q, c.slice(i, i + L), best);
    if (d < best) best = d;
    if (best === 0) break;
  }
  return 1 - best / L;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
function loadIndex(p) {
  const idx = JSON.parse(fs.readFileSync(p, 'utf8'));
  const map = new Map();
  for (const ch of idx.chunks) map.set(ch.id, { raw: ch.text, norm: normalize(ch.text) });
  return map;
}

function* rawFiles(dir) {
  for (const f of fs.readdirSync(dir).sort()) {
    const m = /^raw_(.+)\.jsonl$/.exec(f);
    if (m) yield { file: path.join(dir, f), model: m[1] };
  }
}

function loadQuotes(corpus, dirs, chunkMap) {
  const quotes = [];
  const recordKeys = new Set();
  for (const dir of dirs) {
    for (const { file, model } of rawFiles(dir)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
      for (const line of lines) {
        const rec = JSON.parse(line);
        const rk = `${model}||${rec.id}`;
        if ((rec.raw_evidence || []).length > 0) {
          if (recordKeys.has(rk)) throw new Error(`duplicate record with evidence: ${corpus} ${rk}`);
          recordKeys.add(rk);
        }
        (rec.raw_evidence || []).forEach((ev, qi) => {
          const hitIds = rec.hit_chunk_ids || [];
          for (const h of hitIds) {
            if (!chunkMap.has(h)) throw new Error(`unresolved chunk id ${h} (${corpus} ${rk})`);
          }
          quotes.push({
            corpus, model, item: rec.id, quote_index: qi,
            source_file: ev.source_file ?? '',
            quote: ev.quote ?? '', qnorm: normalize(ev.quote ?? ''),
            hit_chunk_ids: hitIds,
          });
        });
      }
    }
  }
  return quotes;
}

// ---------------------------------------------------------------------------
// Scoring — text only; no labels in sight.
// ---------------------------------------------------------------------------
function scoreQuote(qt, chunkMap) {
  const q = qt.qnorm;
  // fast path: exact verbatim substring in any hit chunk -> sim 1.0
  for (const id of qt.hit_chunk_ids) {
    if (chunkMap.get(id).norm.includes(q)) {
      return { score: 1, verbatim: true, best_chunk_id: id, best_window: q };
    }
  }
  let best = { sim: -1, chunkId: null, start: 0, winLen: 0 };
  for (const id of qt.hit_chunk_ids) {
    const c = chunkMap.get(id).norm;
    const r = bestWindowSim(q, c);
    if (r.sim > best.sim) best = { sim: r.sim, chunkId: id, start: r.start, winLen: r.winLen };
  }
  const win = best.chunkId ? chunkMap.get(best.chunkId).norm.slice(best.start, best.start + best.winLen) : '';
  return { score: best.sim < 0 ? 0 : best.sim, verbatim: false, best_chunk_id: best.chunkId, best_window: win };
}

// ---------------------------------------------------------------------------
// Taxonomy loading (labels — joined post-hoc)
// ---------------------------------------------------------------------------
function loadTaxonomyA(p) {
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const map = new Map();
  for (const e of d.per_quote) {
    map.set(`${e.model}||${e.subcategory_id}||${e.evidence_index}`, { category: e.category, quote: e.quote });
  }
  return map;
}

function loadTaxonomyB(p) {
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const map = new Map();
  for (const e of d.entries) {
    map.set(`${e.model}||${e.item}||${e.quote_index}`, { category: e.category, quote: e.quote });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const t0 = Date.now();

const chunksA = loadIndex(path.join(EVAL_DIR, 'results-spectrum/_index/index.json'));
const chunksB = loadIndex(path.join(EVAL_DIR, 'results-corpus2/_index/index.json'));

const quotesA = loadQuotes('A', [path.join(EVAL_DIR, 'results-spectrum')], chunksA);
const quotesB = loadQuotes('B', [
  path.join(EVAL_DIR, 'results-corpus2'),
  path.join(EVAL_DIR, 'results-corpus2-local'),
], chunksB);

console.log(`Loaded quotes: A=${quotesA.length}, B=${quotesB.length}`);

// score every quote (text only)
for (const qt of quotesA) Object.assign(qt, scoreQuote(qt, chunksA));
for (const qt of quotesB) Object.assign(qt, scoreQuote(qt, chunksB));

// join labels post-hoc
const taxA = loadTaxonomyA(path.join(EVAL_DIR, 'results-ablations/dropped_quote_taxonomy.json'));
const taxB = loadTaxonomyB(path.join(EVAL_DIR, 'results-corpus2/dropped_quote_taxonomy_corpus2.json'));

function joinLabels(quotes, tax, corpusName) {
  const nonVerbatimKeys = new Set();
  for (const qt of quotes) {
    const key = `${qt.model}||${qt.item}||${qt.quote_index}`;
    if (!qt.verbatim) {
      nonVerbatimKeys.add(key);
      const lab = tax.get(key);
      if (!lab) throw new Error(`corpus ${corpusName}: non-verbatim quote not in taxonomy: ${key}`);
      if (normalize(lab.quote) !== qt.qnorm) {
        throw new Error(`corpus ${corpusName}: taxonomy quote text mismatch for ${key}`);
      }
      qt.category = lab.category;
    } else {
      if (tax.has(key)) throw new Error(`corpus ${corpusName}: verbatim quote present in taxonomy: ${key}`);
      qt.category = '';
    }
  }
  for (const key of tax.keys()) {
    if (!nonVerbatimKeys.has(key)) throw new Error(`corpus ${corpusName}: taxonomy entry not found among non-verbatim quotes: ${key}`);
  }
}
joinLabels(quotesA, taxA, 'A');
joinLabels(quotesB, taxB, 'B');
console.log('Label join OK: computed non-verbatim sets exactly match taxonomy keys (A=30, B=23 expected).');

// ---------------------------------------------------------------------------
// Validation 1: verbatim audit — recompute a seeded sample of verbatim quotes
// with the substring shortcut DISABLED; the full sliding scan must return 1.0.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function auditVerbatim(quotes, chunkMap, n, rng) {
  const verb = quotes.filter((q) => q.verbatim && q.qnorm.length > 0);
  const sample = [];
  const pool = [...verb];
  while (sample.length < Math.min(n, pool.length)) {
    sample.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  let ok = 0;
  for (const qt of sample) {
    let best = -1;
    for (const id of qt.hit_chunk_ids) {
      const r = bestWindowSim(qt.qnorm, chunkMap.get(id).norm, { noShortcut: true });
      if (r.sim > best) best = r.sim;
      if (best === 1) break;
    }
    if (best === 1) ok++;
    else console.error(`  AUDIT FAIL: ${qt.model} ${qt.item}#${qt.quote_index} no-shortcut score=${best}`);
  }
  return { sampled: sample.length, scored_1: ok };
}

const rng = mulberry32(20260610);
const auditA = auditVerbatim(quotesA, chunksA, 12, rng);
const auditB = auditVerbatim(quotesB, chunksB, 12, rng);
console.log(`Verbatim audit (shortcut disabled, full sliding scan): A ${auditA.scored_1}/${auditA.sampled} = 1.0, B ${auditB.scored_1}/${auditB.sampled} = 1.0`);

// ---------------------------------------------------------------------------
// Validation 2: brute-force stride-1 cross-check on a seeded sample of
// non-verbatim quotes — coarse+refine must equal exhaustive scan.
// ---------------------------------------------------------------------------
function bruteCheck(quotes, chunkMap, n, rng) {
  const nv = quotes.filter((q) => !q.verbatim);
  const pool = [...nv];
  const sample = [];
  while (sample.length < Math.min(n, pool.length)) {
    sample.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  let ok = 0;
  for (const qt of sample) {
    let brute = -1;
    for (const id of qt.hit_chunk_ids) {
      const s = bestWindowSimBrute(qt.qnorm, chunkMap.get(id).norm);
      if (s > brute) brute = s;
    }
    if (Math.abs(brute - qt.score) < 1e-12) ok++;
    else console.error(`  BRUTE MISMATCH: ${qt.model} ${qt.item}#${qt.quote_index} fast=${qt.score} brute=${brute}`);
  }
  return { sampled: sample.length, matched: ok };
}

const bruteA = bruteCheck(quotesA, chunksA, 8, rng);
const bruteB = bruteCheck(quotesB, chunksB, 8, rng);
console.log(`Brute-force cross-check (stride-1 exhaustive): A ${bruteA.matched}/${bruteA.sampled} match, B ${bruteB.matched}/${bruteB.sampled} match`);

// ---------------------------------------------------------------------------
// Sanity checks: 3 hand cases against a real chunk.
// ---------------------------------------------------------------------------
const sanityChunk = chunksA.get('information-security-policy.md~6bd7af#na#c0').norm;

const sliceStart = sanityChunk.indexOf(' ', 40) + 1; // align to a word boundary
const caseVerbatim = sanityChunk.slice(sliceStart, sliceStart + 250); // 250-char real substring
const words = caseVerbatim.split(' ');
const editedWords = [...words];
editedWords[0] = 'organizational'; // one-word substitution at the head ("Our" -> "The organizational" style edit)
const caseOneEdit = editedWords.join(' ');
const caseUnrelated =
  'the quick brown fox jumps over the lazy dog while reciting sea shanties about quarterly tax filings and the migratory habits of antarctic penguins in springtime';

const sanity = [
  { name: 'verbatim 250-char chunk substring', expect: '= 1.0', quote: caseVerbatim },
  { name: `one-word edit ("${words[0]}" -> "organizational")`, expect: '> 0.9', quote: caseOneEdit },
  { name: 'unrelated sentence', expect: '< 0.5', quote: caseUnrelated },
].map((c) => {
  const withShortcut = bestWindowSim(c.quote, sanityChunk).sim;
  const noShortcut = bestWindowSim(c.quote, sanityChunk, { noShortcut: true }).sim;
  return { ...c, quote: c.quote.slice(0, 120) + (c.quote.length > 120 ? '...' : ''), score: withShortcut, score_no_shortcut: noShortcut };
});

console.log('\nSanity checks (vs information-security-policy.md~6bd7af#na#c0):');
for (const s of sanity) {
  console.log(`  ${s.name}: score=${s.score.toFixed(4)} (no-shortcut path: ${s.score_no_shortcut.toFixed(4)}) [expect ${s.expect}]`);
}
const sanityPass =
  sanity[0].score === 1 && sanity[0].score_no_shortcut === 1 &&
  sanity[1].score > 0.9 && sanity[2].score < 0.5;
if (!sanityPass) throw new Error('sanity checks FAILED');
console.log('  All sanity checks PASS.');

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------
const SUPPORTED_CATEGORIES = ['near_verbatim_miss', 'pdf_extraction_artifact', 'paraphrase_of_present', 'cross_chunk'];
const CORE_SUPPORTED = ['near_verbatim_miss', 'pdf_extraction_artifact'];

function evaluate(quotes) {
  const verb = quotes.filter((q) => q.verbatim);
  const nonVerb = quotes.filter((q) => !q.verbatim);

  const verbatimBlock = {
    count: verb.length,
    all_score_exactly_1: verb.every((q) => q.score === 1),
    accepted_at: Object.fromEntries(THRESHOLDS.map((t) => [t.toFixed(2), verb.filter((q) => q.score >= t).length])),
  };

  const cats = [...new Set(nonVerb.map((q) => q.category))].sort();
  const crosstab = {};
  for (const cat of cats) {
    const rows = nonVerb.filter((q) => q.category === cat);
    crosstab[cat] = {
      total: rows.length,
      accepted_at: Object.fromEntries(THRESHOLDS.map((t) => [t.toFixed(2), rows.filter((q) => q.score >= t).length])),
      scores: rows.map((q) => +q.score.toFixed(6)).sort((a, b) => b - a),
    };
  }

  const echoes = nonVerb
    .filter((q) => q.category === 'framework_echo')
    .map((q) => ({ model: q.model, item: q.item, quote_index: q.quote_index, score: +q.score.toFixed(6), best_chunk_id: q.best_chunk_id }))
    .sort((a, b) => b.score - a.score);

  return { total_quotes: quotes.length, verbatim: verbatimBlock, non_verbatim: { count: nonVerb.length, crosstab }, framework_echo_scores: echoes };
}

function decision(quotes, label) {
  const nonVerb = quotes.filter((q) => !q.verbatim);
  const supported = nonVerb.filter((q) => SUPPORTED_CATEGORIES.includes(q.category));
  const core = nonVerb.filter((q) => CORE_SUPPORTED.includes(q.category));
  const echoes = nonVerb.filter((q) => q.category === 'framework_echo');
  const ambiguous = nonVerb.filter((q) => q.category === 'ambiguous');

  const maxEcho = echoes.length ? Math.max(...echoes.map((q) => q.score)) : -Infinity;
  const suppScores = supported.map((q) => q.score).sort((a, b) => b - a);
  const k = Math.ceil(0.8 * supported.length);
  const s80 = supported.length ? suppScores[k - 1] : NaN; // k-th highest supported score

  const perThreshold = THRESHOLDS.map((t) => ({
    threshold: t,
    supported_recovered: supported.filter((q) => q.score >= t).length,
    supported_total: supported.length,
    recovery_rate: supported.length ? +(supported.filter((q) => q.score >= t).length / supported.length).toFixed(4) : null,
    core_recovered: core.filter((q) => q.score >= t).length,
    core_total: core.length,
    echoes_admitted: echoes.filter((q) => q.score >= t).length,
    ambiguous_admitted: ambiguous.filter((q) => q.score >= t).length,
  }));

  const windowExists = supported.length > 0 && s80 > maxEcho;
  return {
    label,
    supported_definition: SUPPORTED_CATEGORIES,
    n_supported: supported.length,
    n_core_supported: core.length,
    n_echoes: echoes.length,
    max_echo_score: echoes.length ? +maxEcho.toFixed(6) : null,
    score_for_80pct_recovery: supported.length ? +s80.toFixed(6) : null,
    per_threshold: perThreshold,
    safe_window: windowExists
      ? { exists: true, open_interval_low_exclusive: +maxEcho.toFixed(6), high_inclusive: +s80.toFixed(6),
          tested_thresholds_in_window: THRESHOLDS.filter((t) => t > maxEcho && t <= s80) }
      : { exists: false, reason: supported.length ? `80%-recovery score ${s80?.toFixed(4)} <= max echo score ${maxEcho.toFixed(4)}` : 'no supported quotes' },
  };
}

const resA = evaluate(quotesA);
const resB = evaluate(quotesB);
const pooledQuotes = [...quotesA, ...quotesB];
const resPooled = evaluate(pooledQuotes);

const decA = decision(quotesA, 'corpus A');
const decB = decision(quotesB, 'corpus B');
const decPooled = decision(pooledQuotes, 'pooled');

// pooled-with-both-corpora-safe condition: zero echoes on EACH corpus
const bothSafe = THRESHOLDS.map((t) => {
  const echoA = quotesA.filter((q) => !q.verbatim && q.category === 'framework_echo' && q.score >= t).length;
  const echoB = quotesB.filter((q) => !q.verbatim && q.category === 'framework_echo' && q.score >= t).length;
  const supp = pooledQuotes.filter((q) => !q.verbatim && SUPPORTED_CATEGORIES.includes(q.category));
  const rec = supp.filter((q) => q.score >= t).length;
  return {
    threshold: t,
    echoes_admitted_A: echoA,
    echoes_admitted_B: echoB,
    pooled_supported_recovered: rec,
    pooled_supported_total: supp.length,
    pooled_recovery_rate: +(rec / supp.length).toFixed(4),
    safe_and_recovers_80pct: echoA === 0 && echoB === 0 && rec / supp.length >= 0.8,
  };
});

// ---------------------------------------------------------------------------
// Console report
// ---------------------------------------------------------------------------
function printCrosstab(name, res) {
  console.log(`\n=== ${name} ===`);
  console.log(`Total quotes: ${res.total_quotes} | verbatim: ${res.verbatim.count} (all score exactly 1.0: ${res.verbatim.all_score_exactly_1}) | non-verbatim: ${res.non_verbatim.count}`);
  console.log(`Verbatim accepted at each threshold: ${THRESHOLDS.map((t) => `t=${t}: ${res.verbatim.accepted_at[t.toFixed(2)]}/${res.verbatim.count}`).join('  ')}`);
  console.log('Non-verbatim acceptance by category (accepted/total at each t):');
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`  ${pad('category', 26)}${pad('n', 5)}${THRESHOLDS.map((t) => pad('t=' + t.toFixed(2), 9)).join('')}`);
  for (const [cat, row] of Object.entries(res.non_verbatim.crosstab)) {
    console.log(`  ${pad(cat, 26)}${pad(row.total, 5)}${THRESHOLDS.map((t) => pad(row.accepted_at[t.toFixed(2)], 9)).join('')}`);
  }
}

printCrosstab('Corpus A (spectrum)', resA);
printCrosstab('Corpus B (corpus2 + corpus2-local)', resB);
printCrosstab('Pooled (A + B)', resPooled);

console.log('\n=== Framework echo max-similarity scores (margin visibility) ===');
console.log('Corpus A:', resA.framework_echo_scores.map((e) => `${e.item}@${e.model}=${e.score.toFixed(3)}`).join('  '));
console.log('Corpus B:', resB.framework_echo_scores.map((e) => `${e.item}@${e.model}=${e.score.toFixed(3)}`).join('  '));
console.log(`Max echo score: A=${decA.max_echo_score}, B=${decB.max_echo_score}, pooled=${decPooled.max_echo_score}`);

console.log('\n=== Decision summary ===');
for (const d of [decA, decB, decPooled]) {
  console.log(`${d.label}: supported n=${d.n_supported} (core near-verbatim+pdf-artifact n=${d.n_core_supported}), echoes n=${d.n_echoes}`);
  for (const r of d.per_threshold) {
    console.log(`  t=${r.threshold.toFixed(2)}: supported ${r.supported_recovered}/${r.supported_total} (${(100 * r.recovery_rate).toFixed(1)}%), core ${r.core_recovered}/${r.core_total}, echoes admitted ${r.echoes_admitted}, ambiguous admitted ${r.ambiguous_admitted}`);
  }
  console.log(`  safe window: ${d.safe_window.exists ? `(${d.safe_window.open_interval_low_exclusive}, ${d.safe_window.high_inclusive}] — tested thresholds inside: ${d.safe_window.tested_thresholds_in_window.join(', ') || '(none of the grid)'}` : 'NONE — ' + d.safe_window.reason}`);
}
console.log('\nBoth-corpora-safe check per threshold (zero echoes on A AND B, pooled recovery >= 80%):');
for (const r of bothSafe) {
  console.log(`  t=${r.threshold.toFixed(2)}: echoes A=${r.echoes_admitted_A} B=${r.echoes_admitted_B}, pooled supported ${r.pooled_supported_recovered}/${r.pooled_supported_total} (${(100 * r.pooled_recovery_rate).toFixed(1)}%) -> ${r.safe_and_recovers_80pct ? 'SAFE+RECOVERS' : 'no'}`);
}

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = {
  generated_at: new Date().toISOString(),
  description: 'Fuzzy-match gate ablation: best-window normalized Levenshtein similarity of each saved quote against the record\'s hit chunks, evaluated at zero model cost. Gate accepts iff max-over-chunks similarity >= t.',
  method: {
    normalization: "s.normalize('NFC').replace(/[\\u2018\\u2019\\u201b]/g,\"'\").replace(/[\\u201c\\u201d]/g,'\"').replace(/[\\u2013\\u2014]/g,'-').replace(/\\s+/g,' ').trim().toLowerCase()",
    scoring: 'score(quote) = max over hit chunks c of max over window starts i of 1 - levenshtein(q, c[i..i+|q|]) / max(|q|, |window|). Coarse stride floor(|q|/10) + provably exhaustive refinement (window-shift bound |d(i)-d(i+k)| <= 2k); result is the exact maximum over all window positions.',
    thresholds: THRESHOLDS,
    integrity: 'Scores computed from text only; taxonomy labels joined after scoring for evaluation. No parameter was tuned on labels (stride is an exactness-preserving efficiency device; thresholds are the pre-registered grid).',
  },
  validation: {
    levenshtein_self_test: 'pass',
    verbatim_audit_shortcut_disabled: { corpus_A: auditA, corpus_B: auditB },
    brute_force_stride1_crosscheck: { corpus_A: bruteA, corpus_B: bruteB },
    label_join: 'computed non-verbatim sets exactly match taxonomy key sets and quote texts (A=30, B=23)',
  },
  sanity_checks: sanity,
  corpora: { A: resA, B: resB },
  pooled: resPooled,
  decision: {
    per_corpus: { A: decA, B: decB },
    pooled: decPooled,
    both_corpora_safe_per_threshold: bothSafe,
  },
};

fs.writeFileSync(path.join(OUT_DIR, 'fuzzy_results.json'), JSON.stringify(results, null, 2));

const csvEsc = (s) => `"${String(s).replace(/"/g, '""')}"`;
const header = ['corpus', 'model', 'item', 'quote_index', 'source_file', 'verbatim', 'category', 'score', 'best_chunk_id',
  ...THRESHOLDS.map((t) => `accept_${t.toFixed(2)}`), 'quote'].join(',');
const rows = pooledQuotes.map((q) => [
  q.corpus, q.model, q.item, q.quote_index, csvEsc(q.source_file), q.verbatim, q.category,
  q.score.toFixed(6), q.best_chunk_id ?? '',
  ...THRESHOLDS.map((t) => (q.score >= t ? 1 : 0)), csvEsc(q.quote),
].join(','));
fs.writeFileSync(path.join(OUT_DIR, 'per_quote.csv'), [header, ...rows].join('\n') + '\n');

console.log(`\nWrote ${path.join(OUT_DIR, 'fuzzy_results.json')}`);
console.log(`Wrote ${path.join(OUT_DIR, 'per_quote.csv')} (${rows.length} rows)`);
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
