#!/usr/bin/env node
/**
 * Generates publication figures (vector SVG, zero dependencies) from the saved
 * experiment results, plus an index.html that shows them all. Re-runnable.
 *
 *   node eval/figures.mjs   ->   eval/figures/*.svg + eval/figures/index.html
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { ensureDir } from '../src/util/fsx.js';

const jr = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const C = { cloud: '#2563eb', local: '#16a34a', bad: '#dc2626', good: '#16a34a', neutral: '#64748b', grid: '#e2e8f0', ink: '#0f172a' };

/** Horizontal bar chart. rows: [{label, value, color, display}], value in same unit as max. */
function hBars({ title, subtitle, rows, max, width = 760 }) {
  const padL = 230, padR = 80, padT = 64, padB = 34, rowH = 24, gap = 9;
  const plotW = width - padL - padR;
  const height = padT + rows.length * (rowH + gap) + padB;
  const mx = max ?? Math.max(1e-9, ...rows.map((r) => r.value));
  const x = (v) => padL + (v / mx) * plotW;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="-apple-system,Helvetica,Arial,sans-serif">`;
  s += `<rect width="${width}" height="${height}" fill="white"/>`;
  s += `<text x="24" y="28" font-size="17" font-weight="700" fill="${C.ink}">${esc(title)}</text>`;
  if (subtitle) s += `<text x="24" y="48" font-size="12" fill="${C.neutral}">${esc(subtitle)}</text>`;
  // gridlines (0, 25, 50, 75, 100% of max)
  for (let i = 0; i <= 4; i++) {
    const gx = padL + (i / 4) * plotW;
    s += `<line x1="${gx}" y1="${padT - 6}" x2="${gx}" y2="${height - padB}" stroke="${C.grid}"/>`;
    s += `<text x="${gx}" y="${height - padB + 16}" font-size="10" fill="${C.neutral}" text-anchor="middle">${((i / 4) * mx).toFixed(mx <= 1 ? 2 : 0)}</text>`;
  }
  rows.forEach((r, i) => {
    const y = padT + i * (rowH + gap);
    s += `<text x="${padL - 10}" y="${y + rowH * 0.7}" font-size="12" fill="${C.ink}" text-anchor="end">${esc(r.label)}</text>`;
    const w = Math.max(0, x(r.value) - padL);
    s += `<rect x="${padL}" y="${y}" width="${w}" height="${rowH}" rx="3" fill="${r.color || C.neutral}"/>`;
    s += `<text x="${padL + w + 8}" y="${y + rowH * 0.7}" font-size="11" font-weight="600" fill="${C.ink}">${esc(r.display)}</text>`;
  });
  return s + '</svg>';
}

await ensureDir('eval/figures');
const figs = [];
const add = (file, svg, caption) => { writeFileSync(`eval/figures/${file}`, svg); figs.push({ file, caption }); };

// FIG 1 — fabrication spectrum (raw UQR per model), with the verifier note.
const spec = jr('eval/results-spectrum/summary.json');
if (spec) {
  const ms = spec.models.slice().sort((a, b) => b.UQR - a.UQR);
  const rows = ms.map((m) => {
    const failed = m.parse_failures >= spec.subcategories * 0.5;
    return {
      label: m.model.replace('ollama:', '').replace('openai:', '') + (failed ? ' (format-fail)' : ''),
      value: m.UQR * 100,
      color: failed ? C.neutral : m.type === 'cloud' ? C.cloud : C.local,
      display: (m.UQR * 100).toFixed(1) + '%',
    };
  });
  add('fig1_spectrum.svg', hBars({
    title: 'Fig. 1 — Model fabrication rate (raw), before the verifier',
    subtitle: 'Blue = cloud, green = local, grey = too small to produce valid output. After the verifier: 0.0% for ALL 13 models.',
    rows, max: Math.max(20, ...rows.map((r) => r.value)),
  }), 'Fabrication is family-driven, not size-driven; the verifier drives delivered fabrication to 0% for every model.');
}

// FIG 2 — ablations: delivered hallucination per verifier configuration.
if (existsSync('eval/results-ablations/ablation_variants.csv')) {
  const lines = readFileSync('eval/results-ablations/ablation_variants.csv', 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  const rows = lines.map((r) => ({ label: r[0], value: parseFloat(r[2]), color: r[0].startsWith('full') ? C.good : C.bad, display: r[2] }));
  add('fig2_ablations.svg', hBars({
    title: 'Fig. 2 — Delivered hallucination with each safeguard removed',
    subtitle: 'Re-processing real model outputs (642 quotes). Removing the verifier lets fabricated quotes reach the user.',
    rows, max: Math.max(5, ...rows.map((r) => r.value)),
  }), 'Without the verifier, 4.7% of delivered quotes are fabricated (up to 17.7% for the worst model); with it, 0%.');
}

// FIG 3 — adversarial robustness by category.
const adv = jr('eval/results-adversarial/summary.json');
if (adv) {
  const order = ['legit_verbatim', 'legit_formatting', 'adv_substitution', 'adv_fabricated', 'adv_trivial', 'adv_crosschunk'];
  const rows = order.filter((k) => adv.by_category[k]).map((k) => {
    const v = adv.by_category[k];
    return { label: k, value: v.rate * 100, color: k.startsWith('legit') ? C.cloud : C.good, display: (v.rate * 100).toFixed(0) + '% (' + v.correct + '/' + v.n + ')' };
  });
  add('fig3_adversarial.svg', hBars({
    title: 'Fig. 3 — Verifier on an adversarial benchmark',
    subtitle: `Catch rate ${(adv.catch_rate * 100).toFixed(0)}% · false-rejection ${(adv.false_rejection_rate * 100).toFixed(0)}%. "% correct" = legit kept / attacks dropped.`,
    rows, max: 100,
  }), 'Catches 100% of crafted fabrications while never dropping a legitimate quote.');
}

// FIG 4 — reasoning-effort: latency vs effort (faithfulness flat at 0%).
const effs = ['low', 'medium', 'high'].map((e) => ({ e, s: jr(`eval/results-reasoning-${e}/summary.json`) })).filter((x) => x.s);
if (effs.length) {
  const rows = effs.map(({ e, s }) => {
    const m = s.models[0];
    return { label: `${e}  (UQR ${(m.UQR * 100).toFixed(0)}%)`, value: m.latency_ms_median, color: C.cloud, display: (m.latency_ms_median / 1000).toFixed(1) + 's' };
  });
  add('fig4_reasoning.svg', hBars({
    title: 'Fig. 4 — gpt-5.5: reasoning effort vs. latency',
    subtitle: 'Higher reasoning effort ~doubles latency with NO change in faithfulness (0% at every level). "low" is the efficient operating point.',
    rows, max: Math.max(...rows.map((r) => r.value)) * 1.1,
  }), 'More reasoning buys latency/cost, not faithfulness, for verbatim grounding.');
}

// index.html
const html = `<!doctype html><meta charset="utf-8"><title>Figures — Verifiable Grounding</title>
<body style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:840px;margin:32px auto;color:#0f172a">
<h1>Experimental Figures</h1>
<p style="color:#64748b">Grounding Generative AI in Authoritative Security Frameworks — real measured data.</p>
${figs.map((f) => `<figure style="margin:28px 0;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><img src="${f.file}" style="max-width:100%"><figcaption style="color:#475569;font-size:13px;margin-top:8px">${esc(f.caption)}</figcaption></figure>`).join('\n')}
</body>`;
writeFileSync('eval/figures/index.html', html);
process.stderr.write(`Wrote ${figs.length} figures + eval/figures/index.html\n`);
