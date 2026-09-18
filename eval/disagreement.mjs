#!/usr/bin/env node
// Cross-model coverage DISAGREEMENT analysis from eval/results-spectrum/raw_*.jsonl
// Uses raw_coverage (each model's own pre-verifier judgment).
// All numbers computed from data; nothing invented.

import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(process.argv[2] || "eval/results-spectrum");
const TOTAL = 106; // canonical NIST CSF 2.0 subcategory count (verified against data/csf-core.json)
const LEVELS = ["none", "partial", "substantial", "full"];
const VALID = new Set(LEVELS);

const pct = (n, d) => (d === 0 ? 0 : (100 * n) / d);
const fmt = (x) => x.toFixed(1) + "%";

// --- Load every raw_*.jsonl into model -> Map(id -> raw_coverage) ---------
const files = fs
  .readdirSync(DIR)
  .filter((f) => /^raw_.*\.jsonl$/.test(f))
  .sort();

const models = []; // { name, file, map: Map(id->cov), count }
for (const f of files) {
  const name = f.replace(/^raw_/, "").replace(/\.jsonl$/, "");
  const map = new Map();
  const lines = fs.readFileSync(path.join(DIR, f), "utf8").split(/\n/);
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    let o;
    try {
      o = JSON.parse(s);
    } catch {
      continue;
    }
    if (o && typeof o.id === "string" && VALID.has(o.raw_coverage)) {
      // first valid wins (no dups exist in this data anyway)
      if (!map.has(o.id)) map.set(o.id, o.raw_coverage);
    }
  }
  models.push({ name, file: f, map, count: map.size });
}

// --- Step 2: per-model valid count + inclusion (>=50% of 106) -------------
const threshold = TOTAL * 0.5; // 53
const included = models.filter((m) => m.count >= threshold);
const excluded = models.filter((m) => m.count < threshold);

console.log("=".repeat(70));
console.log("CROSS-MODEL COVERAGE DISAGREEMENT  (metric: raw_coverage, pre-verifier)");
console.log("Denominator = 106 NIST CSF 2.0 subcategories");
console.log("Inclusion threshold = valid verdicts for >= 50% of 106 = >= 53");
console.log("=".repeat(70));

console.log("\n--- PER-MODEL VALID VERDICT COUNTS (of 106) ---");
for (const m of models.sort((a, b) => b.count - a.count)) {
  const tag = m.count >= threshold ? "INCLUDED" : "EXCLUDED";
  console.log(
    `  ${m.name.padEnd(24)} ${String(m.count).padStart(3)}/106  (${fmt(pct(m.count, TOTAL)).padStart(6)})  [${tag}]`
  );
}

console.log(`\nINCLUDED models (${included.length}): ${included.map((m) => m.name).join(", ")}`);
console.log(
  `EXCLUDED models (${excluded.length}, < 53 valid verdicts): ` +
    (excluded.length
      ? excluded.map((m) => `${m.name} (${m.count})`).join(", ")
      : "(none)")
);

// --- Build the per-subcategory verdict table for INCLUDED models ----------
// allIds = canonical 106 (union of valid ids across all files == 106, verified)
const allIds = new Set();
for (const m of models) for (const id of m.map.keys()) allIds.add(id);
const IDS = [...allIds].sort();

// For each id, gather verdicts from included models that assessed it.
function verdictsForId(id, modelList) {
  const out = []; // { name, cov }
  for (const m of modelList) {
    const c = m.map.get(id);
    if (c !== undefined) out.push({ name: m.name, cov: c });
  }
  return out;
}

// --- 3(a) UNANIMITY -------------------------------------------------------
// "ALL included models gave the identical coverage" — evaluated per subcategory.
// We require that every included model produced a verdict for the subcategory
// (so "all" is meaningful) AND those verdicts are identical.
let unanimous = 0;
let anyDisagree = 0;
const perId = []; // cache: { id, verdicts:Map(name->cov), distinct:Set, fullCoverage:bool }
for (const id of IDS) {
  const vs = verdictsForId(id, included);
  const covSet = new Set(vs.map((v) => v.cov));
  const fullCoverage = vs.length === included.length; // all included models assessed it
  perId.push({ id, verdicts: vs, covSet, fullCoverage });
  // Unanimity counted only when all included models weighed in and agreed.
  if (fullCoverage && covSet.size === 1) unanimous++;
  else anyDisagree++;
}

console.log("\n--- (a) UNANIMITY across INCLUDED models (over 106 subcategories) ---");
console.log(`  Subcategories where ALL ${included.length} included models assessed AND gave identical coverage:`);
console.log(`     UNANIMOUS: ${unanimous}/106  = ${fmt(pct(unanimous, TOTAL))}`);
console.log(`     ANY DISAGREEMENT (complement): ${anyDisagree}/106 = ${fmt(pct(anyDisagree, TOTAL))}`);

// --- 3(b) SEVERE disagreement --------------------------------------------
// (i) verdicts span >= 3 distinct levels
// (ii) at least one "none" AND at least one in {substantial, full}
let span3plus = 0;
let noneVsStrong = 0;
for (const r of perId) {
  if (r.covSet.size >= 3) span3plus++;
  const hasNone = r.covSet.has("none");
  const hasStrong = r.covSet.has("substantial") || r.covSet.has("full");
  if (hasNone && hasStrong) noneVsStrong++;
}
console.log("\n--- (b) SEVERE disagreement (over 106 subcategories) ---");
console.log(`  Span >= 3 distinct coverage levels:        ${span3plus}/106 = ${fmt(pct(span3plus, TOTAL))}`);
console.log(`  Direct contradiction ("none" vs "substantial"/"full"): ${noneVsStrong}/106 = ${fmt(pct(noneVsStrong, TOTAL))}`);

// --- 3(c) AVERAGE PAIRWISE AGREEMENT -------------------------------------
// For each unordered pair of included models, over subcategories BOTH assessed,
// fraction where verdicts identical. Mean across all pairs; report min/max pair.
const pairs = [];
for (let i = 0; i < included.length; i++) {
  for (let j = i + 1; j < included.length; j++) {
    const A = included[i];
    const B = included[j];
    let both = 0;
    let same = 0;
    for (const id of IDS) {
      const a = A.map.get(id);
      const b = B.map.get(id);
      if (a !== undefined && b !== undefined) {
        both++;
        if (a === b) same++;
      }
    }
    pairs.push({ a: A.name, b: B.name, both, same, agr: pct(same, both) });
  }
}
const meanPair =
  pairs.reduce((acc, p) => acc + p.agr, 0) / (pairs.length || 1);
const sortedPairs = [...pairs].sort((x, y) => x.agr - y.agr);
const minPair = sortedPairs[0];
const maxPair = sortedPairs[sortedPairs.length - 1];

console.log("\n--- (c) AVERAGE PAIRWISE AGREEMENT (all included pairs) ---");
console.log(`  Number of model pairs: ${pairs.length}`);
console.log(`  MEAN pairwise agreement: ${fmt(meanPair)}`);
console.log(
  `  MIN pair: ${minPair.a} vs ${minPair.b} = ${fmt(minPair.agr)} (${minPair.same} identical of ${minPair.both} both-assessed subcats)`
);
console.log(
  `  MAX pair: ${maxPair.a} vs ${maxPair.b} = ${fmt(maxPair.agr)} (${maxPair.same} identical of ${maxPair.both} both-assessed subcats)`
);

// --- 3(d) CLOUD COHESION (gpt-4o-mini, gpt-4o, gpt-5.5) -------------------
const cloudNames = ["openai_gpt-4o-mini", "openai_gpt-4o", "openai_gpt-5.5"];
const cloud = cloudNames
  .map((n) => models.find((m) => m.name === n))
  .filter(Boolean);
console.log("\n--- (d) CLOUD COHESION (pairwise % identical among cloud models) ---");
console.log(`  Cloud models present: ${cloud.map((c) => c.name).join(", ")}`);
const cloudPairs = [];
for (let i = 0; i < cloud.length; i++) {
  for (let j = i + 1; j < cloud.length; j++) {
    const A = cloud[i];
    const B = cloud[j];
    let both = 0;
    let same = 0;
    for (const id of IDS) {
      const a = A.map.get(id);
      const b = B.map.get(id);
      if (a !== undefined && b !== undefined) {
        both++;
        if (a === b) same++;
      }
    }
    const agr = pct(same, both);
    cloudPairs.push({ a: A.name, b: B.name, both, same, agr });
    console.log(`     ${A.name} vs ${B.name}: ${fmt(agr)} (${same} identical of ${both} both-assessed)`);
  }
}
const cloudMean =
  cloudPairs.reduce((acc, p) => acc + p.agr, 0) / (cloudPairs.length || 1);
console.log(`  MEAN cloud pairwise agreement: ${fmt(cloudMean)}`);

// --- 3(e) gpt-5.5 vs THE FIELD -------------------------------------------
// % of subcategories where gpt-5.5's verdict differs from the plurality verdict
// of the OTHER included models. Fallback to gpt-4o if gpt-5.5 absent.
let focus = models.find((m) => m.name === "openai_gpt-5.5");
let focusLabel = "gpt-5.5";
if (!focus || focus.count < threshold) {
  focus = models.find((m) => m.name === "openai_gpt-4o");
  focusLabel = "gpt-4o (fallback; gpt-5.5 absent/excluded)";
}
const others = included.filter((m) => m.name !== focus.name);

let evalCount = 0; // subcats where focus has a verdict AND others have a plurality
let differ = 0;
const tieNote = [];
for (const id of IDS) {
  const fv = focus.map.get(id);
  if (fv === undefined) continue;
  // plurality among OTHER included models on this id
  const tally = {};
  for (const m of others) {
    const c = m.map.get(id);
    if (c !== undefined) tally[c] = (tally[c] || 0) + 1;
  }
  const entries = Object.entries(tally);
  if (entries.length === 0) continue;
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0][1];
  const winners = entries.filter((e) => e[1] === top).map((e) => e[0]);
  evalCount++;
  // If plurality is a tie, "differ" iff focus's verdict is not among tied winners.
  const matches = winners.includes(fv);
  if (winners.length > 1) tieNote.push({ id, winners, fv, matches });
  if (!matches) differ++;
}
console.log(`\n--- (e) ${focusLabel} vs THE FIELD ---`);
console.log(
  `  ${focusLabel}'s verdict differs from the plurality of the other ${others.length} included models:`
);
console.log(`     DIFFERS on ${differ}/${evalCount} assessed subcats = ${fmt(pct(differ, evalCount))}`);
console.log(`     (Also as share of 106: ${differ}/106 = ${fmt(pct(differ, TOTAL))})`);
console.log(`     Subcats with a tied plurality among the field: ${tieNote.length}`);

// --- Step 4: 4 vivid high-disagreement examples --------------------------
// Rank by: number of distinct levels (desc), then a "spread" score from
// none->full, then presence of a none-vs-strong contradiction.
const ord = { none: 0, partial: 1, substantial: 2, full: 3 };
function spread(vs) {
  const idxs = vs.map((v) => ord[v.cov]);
  return Math.max(...idxs) - Math.min(...idxs);
}
const ranked = perId
  .filter((r) => r.verdicts.length >= 2)
  .map((r) => {
    const hasNone = r.covSet.has("none");
    const hasStrong = r.covSet.has("substantial") || r.covSet.has("full");
    return {
      ...r,
      distinct: r.covSet.size,
      sp: spread(r.verdicts),
      contradiction: hasNone && hasStrong,
    };
  })
  .sort((a, b) => {
    if (b.contradiction - a.contradiction !== 0) return b.contradiction - a.contradiction;
    if (b.distinct - a.distinct !== 0) return b.distinct - a.distinct;
    return b.sp - a.sp;
  });

console.log("\n--- (4) EXAMPLE high-disagreement subcategories (included models) ---");
const examples = ranked.slice(0, 4);
for (const ex of examples) {
  const byCov = {};
  for (const v of ex.verdicts) (byCov[v.cov] ||= []).push(v.name.replace(/^ollama_|^openai_/, ""));
  const parts = LEVELS.filter((l) => byCov[l]).map((l) => `${l}: ${byCov[l].join(", ")}`);
  console.log(
    `\n  ${ex.id}  [distinct levels=${ex.distinct}${ex.contradiction ? ", none-vs-strong CONTRADICTION" : ""}]`
  );
  for (const p of parts) console.log(`     ${p}`);
}

console.log("\n" + "=".repeat(70));
