#!/usr/bin/env node
// UNGROUNDED-PROMPT BASELINE analysis.
//
// Compares cross-model judgment agreement of the 3 cloud models
// (openai gpt-4o-mini, gpt-4o, gpt-5.5) over the same 106 CSF subcategories
// and the IDENTICAL retrieval, under two prompt conditions:
//   (a) UNGROUNDED — minimal prompt (eval/results-ungrounded/raw_*.jsonl)
//   (b) GROUNDED   — full grounding-discipline prompt
//                    (eval/results-spectrum/raw_openai_*.jsonl, raw verdicts)
// plus (c) the marginal verdict distribution per model in both conditions, to
// detect agreement inflated by everyone defaulting to one level.
//
// Reuses the VALIDATED Krippendorff implementation exported by
// eval/agreement-alpha.mjs. NOTE: importing that module also executes its own
// validation suite + spectrum analysis (it prints and would exit(1) on a
// validation failure) — that is intentional: the alpha code is re-validated in
// the same process before any number below is produced.
//
// Usage: node eval/ungrounded-analysis.mjs
//        (writes eval/results-ungrounded/analysis.json)

import fs from "node:fs";
import path from "node:path";
import { krippendorffAlpha } from "./agreement-alpha.mjs";

const LEVELS = ["none", "partial", "substantial", "full"]; // ordinal 0..3
const CODE = new Map(LEVELS.map((l, i) => [l, i]));
const VALID = new Set(LEVELS);
const TOTAL = 106;

const UNGROUNDED_DIR = path.resolve("eval/results-ungrounded");
const GROUNDED_DIR = path.resolve("eval/results-spectrum");
const MODELS = ["openai_gpt-4o-mini", "openai_gpt-4o", "openai_gpt-5.5"];

function loadRater(dir, name) {
  const file = path.join(dir, `raw_${name}.jsonl`);
  const map = new Map();
  for (const line of fs.readFileSync(file, "utf8").split(/\n/)) {
    const s = line.trim();
    if (!s) continue;
    let o;
    try { o = JSON.parse(s); } catch { continue; }
    if (o && typeof o.id === "string" && VALID.has(o.raw_coverage)) {
      if (!map.has(o.id)) map.set(o.id, o.raw_coverage);
    }
  }
  return { name, map, count: map.size };
}

function descriptiveStats(ids, raters) {
  const R = raters.length;
  let unanimous = 0;
  for (const id of ids) {
    const vs = raters.map((r) => r.map.get(id)).filter((v) => v !== undefined);
    if (vs.length === R && new Set(vs).size === 1) unanimous++;
  }
  const pairwise = [];
  for (let i = 0; i < R; i++) {
    for (let j = i + 1; j < R; j++) {
      let both = 0, same = 0;
      for (const id of ids) {
        const a = raters[i].map.get(id);
        const b = raters[j].map.get(id);
        if (a !== undefined && b !== undefined) { both++; if (a === b) same++; }
      }
      pairwise.push({ pair: `${raters[i].name} vs ${raters[j].name}`, n: both, agree_pct: +(100 * same / both).toFixed(2) });
    }
  }
  const meanPairwise = pairwise.reduce((a, p) => a + p.agree_pct, 0) / pairwise.length;
  return { unanimous, meanPairwise, pairwise };
}

function marginals(rater) {
  const counts = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const v of rater.map.values()) counts[v]++;
  return counts;
}

function analyseCondition(label, dir) {
  const raters = MODELS.map((n) => loadRater(dir, n));
  console.log("\n" + "=".repeat(74));
  console.log(`CONDITION: ${label}  (${dir})`);
  console.log("=".repeat(74));
  for (const r of raters) console.log(`  ${r.name.padEnd(22)} ${r.count}/${TOTAL} valid verdicts`);

  const allIds = new Set();
  for (const r of raters) for (const id of r.map.keys()) allIds.add(id);
  const ids = [...allIds].sort();

  const units = ids.map((id) =>
    raters.map((r) => r.map.get(id)).filter((v) => v !== undefined).map((v) => CODE.get(v))
  );
  const aOrd = krippendorffAlpha(units, "ordinal", [0, 1, 2, 3]);
  const aInt = krippendorffAlpha(units, "interval", [0, 1, 2, 3]);
  const d = descriptiveStats(ids, raters);

  console.log(`  Krippendorff alpha (ORDINAL):  ${aOrd.alpha.toFixed(4)}  (n pairable values = ${Math.round(aOrd.n)})`);
  console.log(`  Krippendorff alpha (INTERVAL): ${aInt.alpha.toFixed(4)}  (robustness check)`);
  console.log(`  Unanimity (all 3 identical):   ${d.unanimous}/${TOTAL} = ${(100 * d.unanimous / TOTAL).toFixed(1)}%`);
  console.log(`  Mean pairwise agreement:       ${d.meanPairwise.toFixed(1)}%`);
  for (const p of d.pairwise) console.log(`    ${p.pair}: ${p.agree_pct}% (n=${p.n})`);
  console.log("  Marginal verdict distribution (none/partial/substantial/full):");
  const marg = {};
  for (const r of raters) {
    const c = marginals(r);
    marg[r.name] = c;
    console.log(`    ${r.name.padEnd(22)} ${LEVELS.map((l) => `${l}=${c[l]}`).join("  ")}`);
  }

  return {
    dir: path.relative(process.cwd(), dir),
    raters: raters.map((r) => ({ name: r.name, valid: r.count })),
    n_outcomes: ids.length,
    alpha_ordinal: +aOrd.alpha.toFixed(6),
    alpha_interval: +aInt.alpha.toFixed(6),
    unanimity_count: d.unanimous,
    unanimity_pct: +(100 * d.unanimous / TOTAL).toFixed(2),
    mean_pairwise_pct: +d.meanPairwise.toFixed(2),
    pairwise: d.pairwise,
    marginal_distribution: marg,
  };
}

const ungrounded = analyseCondition("UNGROUNDED (minimal prompt, no grounding rules)", UNGROUNDED_DIR);
const grounded = analyseCondition("GROUNDED (full grounding-discipline prompt; raw verdicts)", GROUNDED_DIR);

const delta = {
  alpha_ordinal: +(ungrounded.alpha_ordinal - grounded.alpha_ordinal).toFixed(6),
  unanimity_count: ungrounded.unanimity_count - grounded.unanimity_count,
  mean_pairwise_pct: +(ungrounded.mean_pairwise_pct - grounded.mean_pairwise_pct).toFixed(2),
};
console.log("\n" + "=".repeat(74));
console.log("DELTA (ungrounded - grounded):");
console.log(`  alpha_ordinal:     ${delta.alpha_ordinal >= 0 ? "+" : ""}${delta.alpha_ordinal}`);
console.log(`  unanimity:         ${delta.unanimity_count >= 0 ? "+" : ""}${delta.unanimity_count} outcomes`);
console.log(`  mean pairwise:     ${delta.mean_pairwise_pct >= 0 ? "+" : ""}${delta.mean_pairwise_pct} pp`);

const out = {
  question:
    "Does grounding discipline in the prompt (evidence-bound, absence=none, quote-or-none, conservatism, verifier warning) change cross-model judgment agreement vs a plain assessment prompt?",
  design:
    "Same 106 CSF 2.0 subcategories, identical retrieval (Corpus A index copied from eval/results-spectrum/_index, topk 6, same MiniLM embedder, verified identical chunk ids), same 3 cloud models at temperature 0 (omitted for gpt-5.5 per provider logic), reasoning_effort low. Only the system+task prompts differ. Agreement = Krippendorff alpha (ordinal, validated implementation from eval/agreement-alpha.mjs).",
  models: MODELS,
  conditions: { ungrounded, grounded },
  delta_ungrounded_minus_grounded: delta,
  limitations: [
    "Cloud-only: 3 OpenAI models (gpt-4o-mini, gpt-4o, gpt-5.5); local models were not available for this baseline, so the grounded comparison is restricted to the same 3 cloud raters.",
    "One corpus (Corpus A, examples/sample-docs) and one retrieval configuration; results may not generalize.",
    "Same-vendor raters: 3 models from one provider share training lineage, which can inflate agreement in BOTH conditions.",
    "Grounded verdicts are the RAW model verdicts from the spectrum run (pre-verifier), so the comparison isolates the prompt, not the code-side verifier.",
  ],
};
fs.writeFileSync(path.join(UNGROUNDED_DIR, "analysis.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`\nWrote ${path.join(UNGROUNDED_DIR, "analysis.json")}`);
