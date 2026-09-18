#!/usr/bin/env node
// Krippendorff's alpha (chance-corrected inter-rater agreement) over LLM
// raw_coverage verdicts from eval/results-spectrum/raw_*.jsonl.
//
// Coverage is ORDINAL: none=0, partial=1, substantial=2, full=3.
//
// Implements the general coincidence-matrix formulation (Krippendorff 2011,
// "Computing Krippendorff's Alpha-Reliability"):
//
//   alpha = 1 - (n - 1) * sum_{c<k} o_ck * delta_ck
//                 -----------------------------------
//                     sum_{c<k} n_c * n_k * delta_ck
//
// where o_ck is the coincidence matrix (each unit u with m_u >= 2 pairable
// values contributes 1/(m_u - 1) per ordered value pair), n_c are its
// marginals, n = sum_c n_c, and delta is the metric difference function:
//   nominal : delta_ck = 0 if c==k else 1
//   interval: delta_ck = (v_c - v_k)^2                       (numeric codes)
//   ordinal : delta_ck = ( sum_{g=c}^{k} n_g - (n_c + n_k)/2 )^2
//             (standard Krippendorff ordinal distance based on cumulative
//              marginal frequencies of the coincidence matrix)
//
// Usage: node eval/agreement-alpha.mjs [results-dir]
// Optional: --dump-matrices <file>  writes the rating matrices as JSON so an
//           independent implementation (e.g. the Python `krippendorff`
//           package) can be run on identical input for cross-validation.

import fs from "node:fs";
import path from "node:path";

// --------------------------------------------------------------------------
// Generic Krippendorff alpha
// --------------------------------------------------------------------------
// units: array of units; each unit is an array of numeric category values
//        (missing ratings simply omitted). Units with < 2 values are skipped
//        (unpairable), per the standard procedure.
// metric: "nominal" | "interval" | "ordinal"
// valueDomain (optional): ordered array of admissible category values; by
//        default the sorted distinct values observed in the data.
export function krippendorffAlpha(units, metric, valueDomain) {
  const observed = new Set();
  for (const u of units) for (const v of u) observed.add(v);
  const domain = (valueDomain ?? [...observed]).slice().sort((a, b) => a - b);
  const idx = new Map(domain.map((v, i) => [v, i]));
  const C = domain.length;

  // Coincidence matrix
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
  const nC = o.map((row) => row.reduce((a, b) => a + b, 0)); // marginals
  const n = nC.reduce((a, b) => a + b, 0); // total pairable values
  if (n === 0) return { alpha: NaN, n, note: "no pairable values" };

  // Metric difference function over category indices c <= k
  function delta(c, k) {
    if (c === k) return 0;
    if (metric === "nominal") return 1;
    if (metric === "interval") return (domain[c] - domain[k]) ** 2;
    if (metric === "ordinal") {
      let cum = 0;
      for (let g = c; g <= k; g++) cum += nC[g];
      return (cum - (nC[c] + nC[k]) / 2) ** 2;
    }
    throw new Error(`unknown metric ${metric}`);
  }

  let Do = 0; // sum_{c<k} o_ck * delta_ck   (observed disagreement, unnormalized)
  let De = 0; // sum_{c<k} n_c n_k * delta_ck (expected disagreement, unnormalized)
  for (let c = 0; c < C; c++) {
    for (let k = c + 1; k < C; k++) {
      const d = delta(c, k);
      Do += o[c][k] * d;
      De += nC[c] * nC[k] * d;
    }
  }
  if (De === 0) {
    // All pairable values fall in a single category: agreement is perfect but
    // alpha is formally undefined (no variation to correct for chance).
    return { alpha: NaN, n, Do, De, note: "De=0 (single observed category)" };
  }
  return { alpha: 1 - ((n - 1) * Do) / De, n, Do, De };
}

// --------------------------------------------------------------------------
// Descriptive agreement stats (mirrors eval/disagreement.mjs definitions)
// --------------------------------------------------------------------------
function descriptiveStats(ids, raters) {
  // raters: [{ name, map: Map(id -> level-string) }]
  const R = raters.length;
  let unanimous = 0;
  let span3plus = 0;
  let noneVsStrong = 0;
  for (const id of ids) {
    const vs = raters.map((r) => r.map.get(id)).filter((v) => v !== undefined);
    const set = new Set(vs);
    if (vs.length === R && set.size === 1) unanimous++;
    if (set.size >= 3) span3plus++;
    if (set.has("none") && (set.has("substantial") || set.has("full"))) noneVsStrong++;
  }
  // mean pairwise % identical (over units both rated)
  const pairAgr = [];
  for (let i = 0; i < R; i++) {
    for (let j = i + 1; j < R; j++) {
      let both = 0, same = 0;
      for (const id of ids) {
        const a = raters[i].map.get(id);
        const b = raters[j].map.get(id);
        if (a !== undefined && b !== undefined) {
          both++;
          if (a === b) same++;
        }
      }
      pairAgr.push((100 * same) / both);
    }
  }
  const meanPairwise = pairAgr.reduce((a, b) => a + b, 0) / pairAgr.length;
  return { unanimous, span3plus, noneVsStrong, meanPairwise, nPairs: pairAgr.length };
}

// --------------------------------------------------------------------------
// VALIDATION SUITE
// --------------------------------------------------------------------------
function approxEq(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

function runValidation() {
  console.log("=".repeat(74));
  console.log("VALIDATION OF THE ALPHA IMPLEMENTATION");
  console.log("=".repeat(74));
  let allPass = true;
  const check = (label, got, want, eps) => {
    const pass = approxEq(got, want, eps);
    allPass = allPass && pass;
    console.log(`  [${pass ? "PASS" : "FAIL"}] ${label}: got ${got.toFixed(6)}, expected ${want.toFixed(6)} (tol ${eps})`);
    return pass;
  };

  // (a) Perfect agreement -> alpha = 1 exactly, for every metric.
  console.log("\n(a) Perfect agreement (3 raters x 8 units, all 4 categories used):");
  const perfect = [0, 1, 2, 3, 0, 1, 2, 3].map((v) => [v, v, v]);
  for (const m of ["nominal", "ordinal", "interval"]) {
    check(`perfect agreement, ${m}`, krippendorffAlpha(perfect, m).alpha, 1, 0);
  }

  // (b1) Canonical literature example (Krippendorff; reproduced in the
  // Wikipedia article "Krippendorff's alpha" and as the worked example of the
  // reference Python `krippendorff` package). 3 coders, 15 units, missing
  // data ('*'); published results: alpha_nominal = 0.691, alpha_interval = 0.811.
  console.log("\n(b1) Canonical 3-coder example (Krippendorff; Wikipedia worked example):");
  const X = null;
  const A = [X, X, X, X, X, 3, 4, 1, 2, 1, 1, 3, 3, X, 3];
  const B = [1, X, 2, 1, 3, 3, 4, 3, X, X, X, X, X, X, X];
  const Cc = [X, X, 2, 1, 3, 4, 4, X, 2, 1, 1, 3, 3, X, 4];
  const canonUnits = A.map((_, i) =>
    [A[i], B[i], Cc[i]].filter((v) => v !== null)
  );
  check("canonical example, nominal", krippendorffAlpha(canonUnits, "nominal").alpha, 0.691, 5e-4);
  check("canonical example, interval", krippendorffAlpha(canonUnits, "interval").alpha, 0.811, 5e-4);

  // (b2) Hand-computed 2-rater ordinal/interval case (full arithmetic below).
  // Units (rater1, rater2): (0,0) (1,1) (2,2) (3,3) (0,3); categories 0..3.
  // Coincidence: o(0,0)=2 o(1,1)=2 o(2,2)=2 o(3,3)=2 o(0,3)=o(3,0)=1
  // Marginals:   n0=3 n1=2 n2=2 n3=3, n=10
  // ORDINAL deltas: d03=(10-(3+3)/2)^2=49; d01=((3+2)-(3+2)/2)^2=6.25;
  //   d12=((2+2)-(2+2)/2)^2=4; d23=6.25; d02=(3+2+2-(3+2)/2)^2=20.25; d13=20.25
  //   Do* = o(0,3)*d03 = 1*49 = 49
  //   De* = (3*2)*6.25 + (3*2)*20.25 + (3*3)*49 + (2*2)*4 + (2*3)*20.25 + (2*3)*6.25
  //       = 37.5 + 121.5 + 441 + 16 + 121.5 + 37.5 = 775
  //   alpha_ordinal = 1 - (n-1)*Do*/De* = 1 - 9*49/775 = 334/775 = 0.4309677419...
  // INTERVAL deltas: (c-k)^2 -> Do* = 1*9 = 9
  //   De* = 6*1 + 6*4 + 9*9 + 4*1 + 6*4 + 6*1 = 6+24+81+4+24+6 = 145
  //   alpha_interval = 1 - 9*9/145 = 64/145 = 0.4413793103...
  console.log("\n(b2) Hand-computed 2-rater case (arithmetic in source comments):");
  const hand = [[0, 0], [1, 1], [2, 2], [3, 3], [0, 3]];
  check("hand case, ordinal  (= 334/775)", krippendorffAlpha(hand, "ordinal").alpha, 334 / 775, 1e-12);
  check("hand case, interval (= 64/145)", krippendorffAlpha(hand, "interval").alpha, 64 / 145, 1e-12);

  // (b3) Hand-computed nominal sanity: 2 raters, units (0,0),(1,1),(0,1)
  // o(0,1)=o(1,0)=1; n0=3 n1=3 n=6; Do*=1; De*=9
  // alpha = 1 - 5*1/9 = 4/9 = 0.4444...
  console.log("\n(b3) Hand-computed nominal case:");
  check("hand nominal (= 4/9)", krippendorffAlpha([[0, 0], [1, 1], [0, 1]], "nominal").alpha, 4 / 9, 1e-12);

  console.log(`\nVALIDATION ${allPass ? "PASSED" : "FAILED -- DO NOT TRUST THE NUMBERS BELOW"}`);
  return allPass;
}

// --------------------------------------------------------------------------
// MAIN ANALYSIS
// --------------------------------------------------------------------------
const LEVELS = ["none", "partial", "substantial", "full"]; // ordinal 0..3
const CODE = new Map(LEVELS.map((l, i) => [l, i]));
const VALID = new Set(LEVELS);
const TOTAL = 106;

const DIR = path.resolve(
  process.argv[2] && !process.argv[2].startsWith("--")
    ? process.argv[2]
    : "eval/results-spectrum"
);

function loadModels() {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => /^raw_.*\.jsonl$/.test(f))
    .sort();
  const models = [];
  for (const f of files) {
    const name = f.replace(/^raw_/, "").replace(/\.jsonl$/, "");
    const map = new Map();
    for (const line of fs.readFileSync(path.join(DIR, f), "utf8").split(/\n/)) {
      const s = line.trim();
      if (!s) continue;
      let o;
      try { o = JSON.parse(s); } catch { continue; }
      if (o && typeof o.id === "string" && VALID.has(o.raw_coverage)) {
        if (!map.has(o.id)) map.set(o.id, o.raw_coverage);
      }
    }
    models.push({ name, map, count: map.size });
  }
  return models;
}

function unitsFor(ids, raters) {
  return ids.map((id) =>
    raters.map((r) => r.map.get(id)).filter((v) => v !== undefined).map((v) => CODE.get(v))
  );
}

function analyse(label, ids, raters) {
  console.log("\n" + "=".repeat(74));
  console.log(label);
  console.log(`Raters (${raters.length}): ${raters.map((r) => r.name).join(", ")}`);
  console.log("=".repeat(74));
  const units = unitsFor(ids, raters);
  const aOrd = krippendorffAlpha(units, "ordinal", [0, 1, 2, 3]);
  const aInt = krippendorffAlpha(units, "interval", [0, 1, 2, 3]);
  const d = descriptiveStats(ids, raters);
  const pct = (x) => ((100 * x) / TOTAL).toFixed(1) + "%";
  console.log(`  Krippendorff alpha (ORDINAL):   ${aOrd.alpha.toFixed(4)}   (n pairable values = ${Math.round(aOrd.n)})`);
  console.log(`  Krippendorff alpha (INTERVAL):  ${aInt.alpha.toFixed(4)}   (robustness check, 0-3 coding)`);
  console.log(`  Unanimity:                      ${d.unanimous}/${TOTAL} = ${pct(d.unanimous)}`);
  console.log(`  Mean pairwise agreement:        ${d.meanPairwise.toFixed(1)}%   (${d.nPairs} rater pairs)`);
  console.log(`  Outcomes spanning >=3 levels:   ${d.span3plus}/${TOTAL} = ${pct(d.span3plus)}`);
  console.log(`  none vs substantial/full:       ${d.noneVsStrong}/${TOTAL} = ${pct(d.noneVsStrong)}`);
  return { alphaOrdinal: aOrd.alpha, alphaInterval: aInt.alpha, ...d, units };
}

const validationOK = runValidation();
if (!validationOK) {
  console.error("\n*** VALIDATION FAILED -- aborting before reporting study numbers. ***");
  process.exit(1);
}

const models = loadModels();
console.log("\n" + "=".repeat(74));
console.log("DATA LOADING & INCLUSION (>= 50% of 106 = >= 53 valid verdicts)");
console.log("=".repeat(74));
for (const m of models) {
  console.log(`  ${m.name.padEnd(24)} ${String(m.count).padStart(3)}/106  [${m.count >= TOTAL * 0.5 ? "INCLUDED" : "EXCLUDED"}]`);
}
const included = models.filter((m) => m.count >= TOTAL * 0.5);

// Canonical 106 ids = union of valid ids across all files
const allIds = new Set();
for (const m of models) for (const id of m.map.keys()) allIds.add(id);
const IDS = [...allIds].sort();
console.log(`  Distinct subcategory ids: ${IDS.length} (expected ${TOTAL})`);
if (IDS.length !== TOTAL) throw new Error("unexpected id count");
if (included.length !== 11) throw new Error(`expected 11 included models, got ${included.length}`);
for (const m of included) {
  if (m.count !== TOTAL) throw new Error(`${m.name} has ${m.count}/106 valid (expected complete data)`);
}

const all11 = analyse("(1) ALL-11 MODELS (every model with 106/106 valid verdicts)", IDS, included);

// Pre-specified capable subset: all >=7B models + the three cloud models.
const CAPABLE = [
  "ollama_mistral_7b",
  "ollama_qwen2.5_7b",
  "ollama_llama3.1_8b",
  "ollama_gemma2_9b",
  "ollama_qwen2.5_14b",
  "ollama_qwen2.5_32b",
  "openai_gpt-4o-mini",
  "openai_gpt-4o",
  "openai_gpt-5.5",
];
const capable = CAPABLE.map((n) => {
  const m = included.find((x) => x.name === n);
  if (!m) throw new Error(`capable-subset rater not found among included models: ${n}`);
  return m;
});
const cap = analyse("(2) CAPABLE SUBSET (>=7B local models + 3 cloud models; pre-specified)", IDS, capable);

// Machine-readable summary
const summary = {
  all11: {
    raters: included.map((m) => m.name),
    alpha_ordinal: all11.alphaOrdinal,
    alpha_interval: all11.alphaInterval,
    unanimity_count: all11.unanimous,
    unanimity_pct: (100 * all11.unanimous) / TOTAL,
    mean_pairwise_pct: all11.meanPairwise,
  },
  capable9: {
    raters: capable.map((m) => m.name),
    alpha_ordinal: cap.alphaOrdinal,
    alpha_interval: cap.alphaInterval,
    unanimity_count: cap.unanimous,
    unanimity_pct: (100 * cap.unanimous) / TOTAL,
    mean_pairwise_pct: cap.meanPairwise,
    span3plus_count: cap.span3plus,
    none_vs_substantial_or_full_count: cap.noneVsStrong,
  },
};
console.log("\nJSON_SUMMARY " + JSON.stringify(summary));

// Optional: dump rating matrices for independent cross-validation
const dumpIdx = process.argv.indexOf("--dump-matrices");
if (dumpIdx !== -1) {
  const out = process.argv[dumpIdx + 1];
  const dump = {
    ids: IDS,
    all11: { raters: included.map((m) => m.name), units: all11.units },
    capable9: { raters: capable.map((m) => m.name), units: cap.units },
  };
  fs.writeFileSync(out, JSON.stringify(dump));
  console.log(`Wrote matrices for cross-validation to ${out}`);
}
