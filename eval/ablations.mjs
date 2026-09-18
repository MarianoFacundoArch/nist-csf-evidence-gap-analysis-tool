#!/usr/bin/env node
/**
 * Ablation study (no LLM calls, $0): reprocess the saved RAW model outputs from
 * the spectrum run under different verifier configurations to isolate the
 * contribution of each safeguard component.
 *
 * Variants (what reaches the DELIVERED output, measured against NFC verbatim truth):
 *   - full            : verbatim (NFC) + substantive-quote bar  -> the deployed verifier.
 *   - no_verifier     : deliver the model's raw quotes as-is     -> the hallucination
 *                       that would reach the user with NO safeguard (= raw UQR).
 *   - no_bar          : verbatim only, drop the substantive bar  -> trivial one-word
 *                       quotes survive as "fake anchors".
 *   - nfkc            : use NFKC instead of NFC normalization     -> compatibility
 *                       folding lets non-verbatim quotes (m² vs m2) slip through.
 *
 * Reads eval/results-spectrum/raw_*.jsonl + the index. Outputs a CSV + prints a table.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { writeFileAtomic, ensureDir } from '../src/util/fsx.js';
import { toCsv } from '../src/util/csv.js';

const SPEC = 'eval/results-spectrum';
const OUT = 'eval/results-ablations';

function normForm(s, form) {
  return String(s ?? '').normalize(form)
    .replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
const substantive = (n) => n.length >= 20 && (n.match(/[a-z]{3,}/g)?.length ?? 0) >= 3;

async function main() {
  await ensureDir(OUT);
  const index = JSON.parse(readFileSync(`${SPEC}/_index/index.json`, 'utf8'));
  const text = new Map(index.chunks.map((c) => [c.id, c.text]));

  const rawFiles = readdirSync(SPEC).filter((f) => f.startsWith('raw_') && f.endsWith('.jsonl'));
  const rows = [];
  const overall = { quotes: 0, nonverbatim: 0, trivialVerbatim: 0, nfkcOnly: 0 };

  for (const f of rawFiles) {
    const model = f.replace(/^raw_/, '').replace(/\.jsonl$/, '');
    const lines = readFileSync(`${SPEC}/${f}`, 'utf8').trim().split('\n').filter(Boolean);
    let quotes = 0, nonverbatim = 0, trivialVerbatim = 0, nfkcOnly = 0;

    for (const line of lines) {
      const rec = JSON.parse(line);
      const chunkTexts = (rec.hit_chunk_ids ?? []).map((id) => text.get(id) ?? '');
      const nfc = chunkTexts.map((t) => normForm(t, 'NFC'));
      const nfkc = chunkTexts.map((t) => normForm(t, 'NFKC'));
      for (const e of rec.raw_evidence ?? []) {
        const qn = normForm(e.quote, 'NFC');
        const qk = normForm(e.quote, 'NFKC');
        if (!qn) continue;
        quotes++;
        const vbNFC = nfc.some((c) => c.includes(qn));
        const vbNFKC = qk ? nfkc.some((c) => c.includes(qk)) : false;
        if (!vbNFC) nonverbatim++; // would reach output if NO verifier
        if (vbNFC && !substantive(qn)) trivialVerbatim++; // would survive if NO substantive bar
        if (vbNFKC && substantive(qk) && !vbNFC) nfkcOnly++; // would slip through under NFKC
      }
    }
    rows.push({ model, quotes, nonverbatim, trivialVerbatim, nfkcOnly });
    overall.quotes += quotes; overall.nonverbatim += nonverbatim;
    overall.trivialVerbatim += trivialVerbatim; overall.nfkcOnly += nfkcOnly;
  }

  // Build the variant comparison (delivered hallucination per variant, overall).
  const Q = overall.quotes || 1;
  const variants = [
    { variant: 'full (deployed)', delivered_unverifiable_quotes: 0, delivered_UQR: '0.0%', note: 'verbatim(NFC) + substantive bar' },
    { variant: 'no_verifier', delivered_unverifiable_quotes: overall.nonverbatim, delivered_UQR: (overall.nonverbatim / Q * 100).toFixed(1) + '%', note: 'model raw quotes reach the user' },
    { variant: 'no_substantive_bar', delivered_unverifiable_quotes: 0, delivered_UQR: '0.0%', note: `${overall.trivialVerbatim} trivial "fake-anchor" quotes would survive` },
    { variant: 'nfkc_normalization', delivered_unverifiable_quotes: overall.nfkcOnly, delivered_UQR: (overall.nfkcOnly / Q * 100).toFixed(1) + '%', note: `${overall.nfkcOnly} compatibility-fold escapes on real data` },
  ];

  await writeFileAtomic(`${OUT}/ablation_variants.csv`, toCsv(
    ['variant', 'delivered_unverifiable_quotes', 'delivered_UQR', 'note'],
    variants.map((v) => [v.variant, v.delivered_unverifiable_quotes, v.delivered_UQR, v.note]), { bom: false },
  ));
  await writeFileAtomic(`${OUT}/per_model_raw_quotes.csv`, toCsv(
    ['model', 'raw_quotes', 'nonverbatim_quotes', 'trivial_verbatim_quotes', 'nfkc_only_quotes'],
    rows.map((r) => [r.model, r.quotes, r.nonverbatim, r.trivialVerbatim, r.nfkcOnly]), { bom: false },
  ));

  console.log('=== ABLATIONS (overall, across all spectrum models) ===');
  console.log(`total raw quotes analyzed: ${overall.quotes}`);
  for (const v of variants) console.log(`  ${v.variant.padEnd(20)} delivered hallucination: ${v.delivered_UQR.padStart(6)}  | ${v.note}`);
  console.log(`\nWrote ${OUT}/ablation_variants.csv + per_model_raw_quotes.csv`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
