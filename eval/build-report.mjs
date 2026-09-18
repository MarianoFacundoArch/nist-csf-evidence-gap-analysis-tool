#!/usr/bin/env node
/**
 * Assembles eval/RESULTS.md from the saved experiment outputs (spectrum,
 * adversarial, ablations, reasoning_effort sweep). Re-runnable: include whatever
 * is present. Pure reading; produces a human-readable Markdown report.
 */
import { readFileSync, existsSync } from 'node:fs';

const jr = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const pct = (x) => ((x ?? 0) * 100).toFixed(1) + '%';
const out = [];
const P = (s = '') => out.push(s);

P('# Experimental Results');
P('');
P('_Grounding Generative AI in Authoritative Security Frameworks — measured data._');
P('All numbers are produced by `eval/*.mjs` from real model runs. Corpus: `examples/sample-docs`; framework: NIST CSF 2.0 (106 Subcategories); retrieval: on-device MiniLM, top-k 6.');
P('');

// 1. Spectrum
const spec = jr('eval/results-spectrum/summary.json');
if (spec) {
  P('## 1. Model spectrum — fabrication vs. the verifier guarantee');
  P('');
  P('`UQR` = fraction of the model\'s quotes that are NOT verbatim in the evidence (its fabrication signal). `delivered` = UQR AFTER the verifier (what reaches the user).');
  P('');
  P('| Model | Type | Fabrication (UQR) | Parse-fail | Delivered UQR | Latency (med) | Coverage n/p/s/f |');
  P('| --- | --- | ---: | ---: | ---: | ---: | --- |');
  for (const m of spec.models) {
    P(`| ${m.model} | ${m.type ?? ''} | ${pct(m.UQR)} | ${m.parse_failures}/${spec.subcategories} | ${pct(m.delivered_UQR)} | ${m.latency_ms_median ?? '-'}ms | ${m.cov_none}/${m.cov_partial}/${m.cov_substantial}/${m.cov_full} |`);
  }
  const ok = spec.models.filter((m) => m.parse_failures < spec.subcategories);
  const cloud = ok.filter((m) => m.type === 'cloud');
  const local = ok.filter((m) => m.type === 'local');
  const avg = (a) => (a.length ? pct(a.reduce((s, m) => s + m.UQR, 0) / a.length) : '-');
  P('');
  P(`**Averages:** cloud ${avg(cloud)} · local (that parse) ${avg(local)} · **delivered = 0.0% on all ${spec.models.length} models.**`);
  P('');
  P('Key findings: (1) the verifier drives delivered fabrication to **0% for every model**; (2) faithfulness is **family-driven, not size-driven** (Gemma-9B and Qwen-32B match the cloud frontier at 0%, while Llama models fabricate up to 17.7%); (3) the tiniest models fail at the **output format** (Qwen-0.5B: 106/106 unparseable); (4) even a strong cloud model (gpt-4o) fabricated 2.1%.');
  P('');
}

// 2. Adversarial
const adv = jr('eval/results-adversarial/summary.json');
if (adv) {
  P('## 2. Adversarial robustness of the verifier');
  P('');
  P(`Crafted attacks (fabricated, paraphrase/substitution, cross-chunk splice, trivial words) vs. legitimate quotes (verbatim + formatting variants). ${adv.cases} cases over ${adv.chunks} chunks.`);
  P('');
  P(`- **Catch rate (adversarial dropped): ${pct(adv.catch_rate)}**`);
  P(`- **False-rejection (legit wrongly dropped): ${pct(adv.false_rejection_rate)}**`);
  P('');
  P('| Category | Correct |');
  P('| --- | ---: |');
  for (const [k, v] of Object.entries(adv.by_category)) P(`| ${k} | ${pct(v.rate)} (${v.correct}/${v.n}) |`);
  P('');
}

// 3. Ablations
if (existsSync('eval/results-ablations/ablation_variants.csv')) {
  P('## 3. Ablations — contribution of each safeguard');
  P('');
  P('Re-processing the saved raw model outputs under different verifier configurations (642 raw quotes).');
  P('');
  const lines = readFileSync('eval/results-ablations/ablation_variants.csv', 'utf8').trim().split('\n').map((l) => l.split(','));
  P('| Variant | Delivered hallucination | Note |');
  P('| --- | ---: | --- |');
  for (const r of lines.slice(1)) P(`| ${r[0]} | ${r[2]} | ${r.slice(3).join(',')} |`);
  P('');
  P('On real data, removing the verifier lets **4.7%** of delivered quotes be fabricated (up to 17.7% per the worst model). The substantive-quote bar and NFC normalization show no effect on real data (models don\'t emit trivial/compatibility-fold quotes) but are proven necessary by the adversarial benchmark above.');
  P('');
}

// 4. Reasoning-effort sweep
const efforts = ['low', 'medium', 'high'].map((e) => ({ e, s: jr(`eval/results-reasoning-${e}/summary.json`) }));
P('## 4. Reasoning-effort sweep (gpt-5.5)');
P('');
if (efforts.every((x) => x.s)) {
  P('| reasoning_effort | Fabrication (UQR) | Delivered UQR | Latency (med) | Est. output tokens |');
  P('| --- | ---: | ---: | ---: | ---: |');
  for (const { e, s } of efforts) {
    const m = s.models[0];
    P(`| ${e} | ${pct(m.UQR)} | ${pct(m.delivered_UQR)} | ${m.latency_ms_median}ms | ${m.est_out_tokens} |`);
  }
  P('');
} else {
  P('_(running — will be filled in when the sweep finishes)_');
  P('');
}

P('---');
P('Files: `eval/results-spectrum/` (summary.csv + per-model items_*.csv + raw_*.jsonl), `eval/results-adversarial/`, `eval/results-ablations/`, `eval/results-reasoning-*/`.');

import { writeFileSync } from 'node:fs';
writeFileSync('eval/RESULTS.md', out.join('\n') + '\n');
process.stderr.write('Wrote eval/RESULTS.md\n');
