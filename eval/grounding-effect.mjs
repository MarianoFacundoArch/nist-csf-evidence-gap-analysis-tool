#!/usr/bin/env node
// =============================================================================
// GROUNDING-EFFECT STUDY
// Hypothesis under test: "judgment agreement across LLMs improves when
// grounding is enforced." Two zero-cost analyses over existing spectrum data.
//
//   ANALYSIS 1 — RAW vs DELIVERED agreement: does the verifier's forcing rule
//     (coverage > none with zero surviving quotes -> forced to 'none') itself
//     homogenize verdicts across models?
//
//   ANALYSIS 2 — Agreement conditioned on grounding success: are verdicts more
//     consistent on outcomes where evidence is verifiably present (many models
//     produced at least one quote that survives verbatim verification)?
//
// Data: eval/results-spectrum/raw_*.jsonl
//         per-model records {id, raw_coverage, raw_evidence:[{source_file,
//         quote}], hit_chunk_ids}
//       eval/results-spectrum/_index/index.json (chunk texts, keyed by id)
//
// Panels: the 11 models with 106/106 valid verdicts (qwen2.5 0.5b/1.5b are
// excluded); a pre-specified 9-model capable subset (>=7B local + 3 cloud);
// and the 3 cloud models alone.
//
// Verifier logic (EXACT replica of src/engine/verifier.js):
//   normalize(s) = s.normalize('NFC').replace(/[‘’‛]/g,"'").replace(/[“”]/g,'"')
//                   .replace(/[–—]/g,'-').replace(/\s+/g,' ').trim().toLowerCase()
//   a quote SURVIVES iff normalized quote is a substring of a normalized
//   hit-chunk text AND normalized length >= 20 AND >= 3 matches of /[a-z]{3,}/g.
//   DELIVERED verdict = raw_coverage, except: raw_coverage != 'none' and zero
//   surviving quotes -> 'none' (the forcing rule).
//
// Krippendorff's alpha is REUSED from eval/agreement-alpha.mjs. Importing that
// module runs its validation suite (canonical Krippendorff examples +
// hand-computed cases) and its baseline analysis; it process.exit(1)s if
// validation fails, so this script cannot report numbers from an unvalidated
// alpha implementation. We additionally assert that our own recomputation of
// the all-11 RAW ordinal alpha reproduces the published 0.256.
//
// Usage:   node eval/grounding-effect.mjs
// Output:  console report + eval/results-grounding-effect/results.json
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(EVAL_DIR, "..");
const DATA_DIR = path.join(EVAL_DIR, "results-spectrum");
const OUT_DIR = path.join(EVAL_DIR, "results-grounding-effect");
const OUT_FILE = path.join(OUT_DIR, "results.json");

// agreement-alpha.mjs resolves its default data dir relative to cwd; pin it.
process.chdir(REPO_ROOT);

const hr = (c = "=") => c.repeat(78);
console.log(hr());
console.log("STEP 0 — IMPORT eval/agreement-alpha.mjs (its self-validation suite and");
console.log("baseline all-11 / capable-9 analysis run now; abort-on-failure applies).");
console.log(hr());
const { krippendorffAlpha } = await import("./agreement-alpha.mjs");
console.log("\n" + hr());
console.log("END of imported agreement-alpha.mjs output — grounding-effect study begins.");
console.log(hr());

// ----------------------------------------------------------------------------
// Verifier logic (exact)
// ----------------------------------------------------------------------------
function normalize(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isSubstantive(normalized) {
  if (normalized.length < 20) return false;
  const contentWords = normalized.match(/[a-z]{3,}/g);
  return (contentWords?.length ?? 0) >= 3;
}

// ----------------------------------------------------------------------------
// Load chunk index
// ----------------------------------------------------------------------------
const index = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "_index", "index.json"), "utf8")
);
const chunkNorm = new Map(index.chunks.map((c) => [c.id, normalize(c.text)]));

// ----------------------------------------------------------------------------
// Load per-model records; apply verifier; derive delivered verdicts
// ----------------------------------------------------------------------------
const LEVELS = ["none", "partial", "substantial", "full"]; // ordinal 0..3
const CODE = new Map(LEVELS.map((l, i) => [l, i]));
const VALID = new Set(LEVELS);
const TOTAL = 106;

function survivingQuotes(record) {
  const evidence = Array.isArray(record.raw_evidence) ? record.raw_evidence : [];
  const hitIds = Array.isArray(record.hit_chunk_ids) ? record.hit_chunk_ids : [];
  const hitTexts = hitIds.map((id) => {
    const t = chunkNorm.get(id);
    if (t === undefined) throw new Error(`hit_chunk_id not in index: ${id}`);
    return t;
  });
  let n = 0;
  for (const e of evidence) {
    const q = normalize(e?.quote);
    if (!isSubstantive(q)) continue;
    if (hitTexts.some((t) => t.includes(q))) n++;
  }
  return n;
}

const rawFiles = fs
  .readdirSync(DATA_DIR)
  .filter((f) => /^raw_.*\.jsonl$/.test(f))
  .sort();

const allModels = [];
for (const f of rawFiles) {
  const name = f.replace(/^raw_/, "").replace(/\.jsonl$/, "");
  const map = new Map(); // id -> { raw, delivered, survivors, claimedQuotes }
  for (const line of fs.readFileSync(path.join(DATA_DIR, f), "utf8").split(/\n/)) {
    const s = line.trim();
    if (!s) continue;
    let o;
    try { o = JSON.parse(s); } catch { continue; }
    if (!o || typeof o.id !== "string" || !VALID.has(o.raw_coverage)) continue;
    if (map.has(o.id)) continue; // first valid record per id (matches agreement-alpha.mjs)
    const survivors = survivingQuotes(o);
    const delivered =
      o.raw_coverage !== "none" && survivors === 0 ? "none" : o.raw_coverage;
    map.set(o.id, {
      raw: o.raw_coverage,
      delivered,
      survivors,
      claimedQuotes: Array.isArray(o.raw_evidence) ? o.raw_evidence.length : 0,
    });
  }
  allModels.push({ name, map });
}

const included = allModels.filter((m) => m.map.size === TOTAL);
const excluded = allModels.filter((m) => m.map.size !== TOTAL).map((m) => m.name);
if (included.length !== 11) {
  throw new Error(`expected 11 models with 106/106 valid verdicts, got ${included.length}`);
}
for (const n of ["ollama_qwen2.5_0.5b", "ollama_qwen2.5_1.5b"]) {
  if (!excluded.includes(n)) throw new Error(`expected ${n} to be excluded (incomplete verdicts)`);
}

const IDS = [...included[0].map.keys()].sort();
for (const m of included) {
  if (m.map.size !== TOTAL) throw new Error(`${m.name}: ${m.map.size}/106`);
  for (const id of IDS) if (!m.map.has(id)) throw new Error(`${m.name} missing ${id}`);
}

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
const CLOUD = ["openai_gpt-4o-mini", "openai_gpt-4o", "openai_gpt-5.5"];
const pick = (names) =>
  names.map((n) => {
    const m = included.find((x) => x.name === n);
    if (!m) throw new Error(`panel rater not found: ${n}`);
    return m;
  });

const PANELS = {
  all11: { label: "ALL-11 MODELS", models: included },
  capable9: { label: "CAPABLE-9 (>=7B local + 3 cloud)", models: pick(CAPABLE) },
  cloud3: { label: "CLOUD-3 (OpenAI only)", models: pick(CLOUD) },
};

// ----------------------------------------------------------------------------
// Stats helpers (complete data: every model rates every id)
// ----------------------------------------------------------------------------
const round = (x, d) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);

function verdictStats(ids, models, field) {
  const R = models.length;
  const N = ids.length;
  // unanimity
  let unanimous = 0;
  const unanimousByLevel = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const id of ids) {
    const vs = models.map((m) => m.map.get(id)[field]);
    if (new Set(vs).size === 1) {
      unanimous++;
      unanimousByLevel[vs[0]]++;
    }
  }
  // mean pairwise % identical
  const pairPcts = [];
  for (let i = 0; i < R; i++) {
    for (let j = i + 1; j < R; j++) {
      let same = 0;
      for (const id of ids) {
        if (models[i].map.get(id)[field] === models[j].map.get(id)[field]) same++;
      }
      pairPcts.push((100 * same) / N);
    }
  }
  const meanPairwise = pairPcts.reduce((a, b) => a + b, 0) / pairPcts.length;
  // marginal distribution over R*N ratings
  const marginal = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const id of ids) for (const m of models) marginal[m.map.get(id)[field]]++;
  const totalRatings = R * N;
  const marginalPct = Object.fromEntries(
    LEVELS.map((l) => [l, round((100 * marginal[l]) / totalRatings, 1)])
  );
  const modalLevel = LEVELS.reduce((a, b) => (marginal[b] > marginal[a] ? b : a));
  // alpha (ordinal, fixed 0..3 domain)
  const units = ids.map((id) => models.map((m) => CODE.get(m.map.get(id)[field])));
  const a = krippendorffAlpha(units, "ordinal", [0, 1, 2, 3]);
  return {
    n_items: N,
    n_raters: R,
    alpha_ordinal: Number.isFinite(a.alpha) ? round(a.alpha, 4) : null,
    alpha_note: a.note ?? null,
    unanimity_count: unanimous,
    unanimity_pct: round((100 * unanimous) / N, 1),
    unanimous_by_level: unanimousByLevel,
    mean_pairwise_pct: round(meanPairwise, 1),
    marginal_counts: marginal,
    marginal_pct: marginalPct,
    modal_level: modalLevel,
    modal_share_pct: marginalPct[modalLevel],
  };
}

const fmtA = (s) =>
  s.alpha_ordinal === null ? `undefined (${s.alpha_note})` : s.alpha_ordinal.toFixed(4);
const fmtMarg = (s) =>
  LEVELS.map((l) => `${l} ${s.marginal_pct[l]}%`).join(", ");

function printStats(title, s) {
  console.log(`  ${title}`);
  console.log(`    Krippendorff alpha (ordinal):  ${fmtA(s)}`);
  console.log(`    Unanimity:                     ${s.unanimity_count}/${s.n_items} = ${s.unanimity_pct}%  (by level: ${LEVELS.map((l) => `${l}=${s.unanimous_by_level[l]}`).join(" ")})`);
  console.log(`    Mean pairwise agreement:       ${s.mean_pairwise_pct}%`);
  console.log(`    Verdict marginals:             ${fmtMarg(s)}  [modal: ${s.modal_level} ${s.modal_share_pct}%]`);
}

// ----------------------------------------------------------------------------
// Per-model verification context (how often the forcing rule fires)
// ----------------------------------------------------------------------------
console.log("\n" + hr());
console.log("DATA & VERIFIER CONTEXT (11 included models, 106 outcomes each)");
console.log(hr());
console.log(`Excluded (incomplete verdicts): ${excluded.join(", ") || "none"}`);
console.log(
  "model".padEnd(24) +
    "grounded outcomes".padStart(19) +
    "forced->none".padStart(14) +
    "  (raw!=none & 0 surviving quotes)"
);
const perModel = {};
let totalForced = 0;
let noneWithEvidence = 0;
let noneTotal = 0;
for (const m of included) {
  let grounded = 0;
  let forced = 0;
  for (const id of IDS) {
    const r = m.map.get(id);
    if (r.survivors >= 1) grounded++;
    if (r.raw !== "none" && r.survivors === 0) forced++;
    if (r.raw === "none") {
      noneTotal++;
      if (r.claimedQuotes > 0) noneWithEvidence++;
    }
  }
  totalForced += forced;
  perModel[m.name] = { outcomes_with_surviving_quote: grounded, forced_downgrades: forced };
  console.log(
    m.name.padEnd(24) + `${grounded}/106`.padStart(19) + String(forced).padStart(14)
  );
}
const maxForced = Object.entries(perModel).reduce((a, b) =>
  b[1].forced_downgrades > a[1].forced_downgrades ? b : a
);
console.log(
  `Forcing rule fired ${totalForced}/${11 * TOTAL} verdicts total; ` +
    `'none' verdicts carrying any claimed evidence: ${noneWithEvidence}/${noneTotal}.`
);

// ----------------------------------------------------------------------------
// ANALYSIS 1 — RAW vs DELIVERED agreement per panel
// ----------------------------------------------------------------------------
console.log("\n" + hr());
console.log("ANALYSIS 1 — RAW vs DELIVERED verdict agreement (does the gate homogenize?)");
console.log(hr());

const analysis1 = {};
for (const [key, panel] of Object.entries(PANELS)) {
  const raw = verdictStats(IDS, panel.models, "raw");
  const delivered = verdictStats(IDS, panel.models, "delivered");
  const delta = {
    alpha_ordinal:
      raw.alpha_ordinal !== null && delivered.alpha_ordinal !== null
        ? round(delivered.alpha_ordinal - raw.alpha_ordinal, 4)
        : null,
    unanimity_pct: round(delivered.unanimity_pct - raw.unanimity_pct, 1),
    mean_pairwise_pct: round(delivered.mean_pairwise_pct - raw.mean_pairwise_pct, 1),
  };
  analysis1[key] = { label: panel.label, raters: panel.models.map((m) => m.name), raw, delivered, delta };
  console.log(`\n${panel.label}  (${panel.models.length} raters x 106 outcomes)`);
  printStats("RAW verdicts:", raw);
  printStats("DELIVERED verdicts (post forcing rule):", delivered);
  console.log(
    `  DELTA (delivered - raw):  alpha ${delta.alpha_ordinal >= 0 ? "+" : ""}${delta.alpha_ordinal}` +
      `  unanimity ${delta.unanimity_pct >= 0 ? "+" : ""}${delta.unanimity_pct}pp` +
      `  pairwise ${delta.mean_pairwise_pct >= 0 ? "+" : ""}${delta.mean_pairwise_pct}pp`
  );
}

// Reproduction check: all-11 RAW ordinal alpha must reproduce the published 0.256.
const repro = analysis1.all11.raw.alpha_ordinal;
if (Math.abs(repro - 0.256) > 0.0005) {
  throw new Error(`all-11 RAW ordinal alpha ${repro} does not reproduce 0.256 — aborting`);
}
console.log(`\n[REPRODUCTION CHECK PASSED] all-11 RAW ordinal alpha = ${repro.toFixed(4)} (published 0.256).`);

// ----------------------------------------------------------------------------
// ANALYSIS 2 — agreement conditioned on grounding success (11-model panel)
// ----------------------------------------------------------------------------
console.log("\n" + hr());
console.log("ANALYSIS 2 — Agreement conditioned on grounding success (11-model panel)");
console.log(hr());

const groundedCount = new Map(
  IDS.map((id) => [
    id,
    included.reduce((acc, m) => acc + (m.map.get(id).survivors >= 1 ? 1 : 0), 0),
  ])
);
const histogram = Object.fromEntries(
  Array.from({ length: 12 }, (_, k) => [k, IDS.filter((id) => groundedCount.get(id) === k).length])
);
console.log("Grounded-model count per outcome (how many of 11 models had >=1 surviving quote):");
console.log(
  "  " +
    Object.entries(histogram)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} models: ${v} outcomes`)
      .join(" | ")
);

const STRATA = [
  { key: "well_grounded", label: "WELL-GROUNDED (>=6 of 11 models with a verified quote)", test: (c) => c >= 6 },
  { key: "sparse", label: "SPARSE (1-5 models with a verified quote)", test: (c) => c >= 1 && c <= 5 },
  { key: "ungrounded", label: "UNGROUNDED (0 models with a verified quote)", test: (c) => c === 0 },
];

const analysis2 = { grounded_count_histogram: histogram, strata: {} };
let strataTotal = 0;
for (const stratum of STRATA) {
  const ids = IDS.filter((id) => stratum.test(groundedCount.get(id)));
  strataTotal += ids.length;
  const small = ids.length < 15;
  console.log(`\n${stratum.label}`);
  console.log(`  n = ${ids.length} outcomes${small ? "   ** SMALL STRATUM (n<15): alpha unstable, interpret with caution **" : ""}`);
  if (ids.length === 0) {
    analysis2.strata[stratum.key] = { label: stratum.label, n_items: 0, ids: [], small_stratum_flag: small };
    continue;
  }
  const raw = verdictStats(ids, included, "raw");
  const delivered = verdictStats(ids, included, "delivered");
  printStats("RAW verdicts:", raw);
  printStats("DELIVERED verdicts (post forcing rule):", delivered);
  analysis2.strata[stratum.key] = {
    label: stratum.label,
    n_items: ids.length,
    small_stratum_flag: small,
    ids,
    raw,
    delivered,
  };
}
if (strataTotal !== TOTAL) throw new Error(`strata sizes sum to ${strataTotal}, expected ${TOTAL}`);

// ----------------------------------------------------------------------------
// INTERPRETATION GUARD + 5-LINE SUMMARY (derived from the numbers above)
// ----------------------------------------------------------------------------
const a1 = analysis1.all11;
const wg = analysis2.strata.well_grounded;
const sp = analysis2.strata.sparse;
const ug = analysis2.strata.ungrounded;

const guard = [
  `Alpha is sensitive to marginal homogeneity: the forcing rule moves mass to 'none' ` +
    `(all-11 'none' share: raw ${a1.raw.marginal_pct.none}% -> delivered ${a1.delivered.marginal_pct.none}%), ` +
    `so % agreement can rise while chance-corrected alpha falls — both are reported throughout.`,
  `The forcing rule fired on only ${totalForced} of ${11 * TOTAL} verdicts and asymmetrically across models ` +
    `(max: ${maxForced[0]} with ${maxForced[1].forced_downgrades}; several models 0) — it moves a few raters ` +
    `away from the panel consensus rather than pulling the panel together, which is why delivered alpha is lower than raw.`,
  `CIRCULARITY: the grounded-count stratifier is not independent of the verdicts — 'none' verdicts carry no claimed ` +
    `evidence essentially by design (${noneWithEvidence}/${noneTotal} 'none' verdicts have any quote), so the UNGROUNDED ` +
    `stratum mechanically selects outcomes where models answered 'none'. Its 100%-style agreement reflects a shared ` +
    `'none' default, not grounding-induced consistency of judgment.`,
  `RANGE RESTRICTION: stratifying removes between-stratum variance, which alpha rewards; within-stratum alpha is ` +
    `therefore expected to drop even for good judges. The fair within-stratum comparison is pairwise % at similar ` +
    `marginals — and well-grounded (${wg.raw?.mean_pairwise_pct}%) does not beat sparse (${sp.raw?.mean_pairwise_pct}%) on it.`,
  ug && ug.n_items > 0
    ? `UNGROUNDED stratum delivered verdicts are 'none' by construction wherever no quote survives — ` +
      `its ${analysis2.strata.ungrounded.delivered?.mean_pairwise_pct ?? "n/a"}% delivered pairwise agreement is forced, not judged ` +
      `(and alpha is formally undefined there: a single observed category).`
    : `UNGROUNDED stratum is empty.`,
];
console.log("\n" + hr());
console.log("INTERPRETATION GUARD");
console.log(hr());
for (const g of guard) console.log("  - " + g);

const dir = (d) => (d > 0 ? "UP" : d < 0 ? "DOWN" : "FLAT");
const line1 =
  `A1 (gate effect, all-11): alpha ${a1.raw.alpha_ordinal.toFixed(3)} raw -> ${a1.delivered.alpha_ordinal.toFixed(3)} delivered ` +
  `(${dir(a1.delta.alpha_ordinal)} ${Math.abs(a1.delta.alpha_ordinal).toFixed(3)}); unanimity ${a1.raw.unanimity_pct}% -> ${a1.delivered.unanimity_pct}%; ` +
  `pairwise ${a1.raw.mean_pairwise_pct}% -> ${a1.delivered.mean_pairwise_pct}%.`;
const line2 =
  `A1 caveat: the gate fired on only ${totalForced}/${11 * TOTAL} verdicts, concentrated in few models ` +
  `(${maxForced[0]}: ${maxForced[1].forced_downgrades}) — ` +
  `${a1.delta.mean_pairwise_pct > 0 && a1.delta.alpha_ordinal <= 0
    ? "its % gains come from collapsing verdicts onto 'none', not from better discrimination"
    : a1.delta.alpha_ordinal > 0
      ? "and its agreement gains survive chance correction, i.e. not purely marginal collapse"
      : "it nudges individual raters off the panel consensus, so it homogenizes marginals (more 'none') without homogenizing judgments"}.`;
const line3 =
  `A2 (conditioning on grounding): RAW alpha by stratum — well-grounded ${wg.raw ? fmtA(wg.raw) : "n/a"} (n=${wg.n_items}), ` +
  `sparse ${sp.raw ? fmtA(sp.raw) : "n/a"} (n=${sp.n_items}), ungrounded ${ug.raw ? fmtA(ug.raw) : "n/a"} (n=${ug.n_items}); ` +
  `pairwise ${wg.raw?.mean_pairwise_pct}% / ${sp.raw?.mean_pairwise_pct}% / ${ug.raw?.mean_pairwise_pct}%.`;
const ugModal = ug.raw ? `${ug.raw.modal_level} ${ug.raw.modal_share_pct}%` : "n/a";
const wgModal = wg.raw ? `${wg.raw.modal_level} ${wg.raw.modal_share_pct}%` : "n/a";
const line4 =
  `A2 caveat: per-stratum agreement is marginal-driven, not discrimination (well-grounded modal: ${wgModal}; ` +
  `ungrounded modal: ${ugModal}, 100% agreement there is a shared 'none' default and circular with the stratifier); ` +
  `within-stratum alpha ~0 everywhere means the panel's overall alpha comes from the coarse none-vs-partial split between strata.`;

// Overall verdict logic (explicit, so the conclusion is reproducible):
//  - "gate" support requires delivered alpha > raw alpha (not just % agreement).
//  - "conditioning" support requires grounded strata to beat ungrounded on raw
//    alpha AND on pairwise %.
const gateSupport = a1.delta.alpha_ordinal > 0.01;
const gatePctOnly = !gateSupport && a1.delta.mean_pairwise_pct > 1;
const condSupport =
  wg.raw && sp.raw &&
  (ug.raw?.alpha_ordinal === null || wg.raw.alpha_ordinal > (ug.raw?.alpha_ordinal ?? -Infinity)) &&
  wg.raw.mean_pairwise_pct > (ug.raw?.mean_pairwise_pct ?? -Infinity);
let verdict;
if (gateSupport && condSupport) verdict = "YES on both measures";
else if (gateSupport) verdict = "PARTIALLY: yes on the gate (A1, chance-corrected), not on conditioning (A2)";
else if (condSupport && gatePctOnly)
  verdict = "PARTIALLY: yes on raw % agreement (A1) and on grounding-conditioned agreement (A2), but the gate does NOT raise chance-corrected alpha";
else if (condSupport) verdict = "PARTIALLY: only via conditioning on grounding success (A2), not via the gate itself (A1)";
else verdict = "NO on both measures";
const line5 = `Verdict — "grounding enforcement improves cross-model judgment agreement": ${verdict}.`;

const summaryLines = [line1, line2, line3, line4, line5];
console.log("\n" + hr());
console.log("5-LINE HONEST SUMMARY");
console.log(hr());
summaryLines.forEach((l, i) => console.log(`${i + 1}. ${l}`));

// ----------------------------------------------------------------------------
// Write machine-readable results
// ----------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
const results = {
  meta: {
    generated_at: new Date().toISOString(),
    script: "eval/grounding-effect.mjs",
    data_dir: "eval/results-spectrum",
    alpha_implementation: "eval/agreement-alpha.mjs (self-validates on import; canonical Krippendorff examples)",
    reproduction_check: { all11_raw_alpha_ordinal: repro, published: 0.256, passed: true },
    verifier:
      "quote survives iff normalize(quote) is substring of a normalize(hit-chunk text) AND length>=20 AND >=3 matches of /[a-z]{3,}/g; " +
      "normalize = NFC, curly quotes->straight, en/em dash->'-', whitespace collapse, trim, lowercase; " +
      "delivered = raw_coverage except raw!='none' with 0 surviving quotes -> 'none'",
    levels: LEVELS,
    n_outcomes: TOTAL,
    included_models: included.map((m) => m.name),
    excluded_models: excluded,
    panels: Object.fromEntries(
      Object.entries(PANELS).map(([k, p]) => [k, p.models.map((m) => m.name)])
    ),
    strata_definition: {
      well_grounded: ">=6 of 11 models with >=1 surviving quote",
      sparse: "1-5 models",
      ungrounded: "0 models",
    },
  },
  per_model_verification: perModel,
  verification_totals: {
    forced_downgrades_total: totalForced,
    total_verdicts: 11 * TOTAL,
    none_verdicts_with_claimed_evidence: noneWithEvidence,
    none_verdicts_total: noneTotal,
  },
  analysis1_raw_vs_delivered: analysis1,
  analysis2_conditioned_on_grounding: analysis2,
  interpretation_guard: guard,
  summary_lines: summaryLines,
  verdict,
};
fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
console.log(`\nWrote ${path.relative(REPO_ROOT, OUT_FILE)}`);
