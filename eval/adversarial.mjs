#!/usr/bin/env node
/**
 * Adversarial robustness benchmark for the verifier (no LLM calls, $0).
 *
 * We take real evidence chunks from a document set, extract genuine verbatim
 * sentences as "gold" quotes, and then generate controlled test cases:
 *   - LEGIT (must SURVIVE): the verbatim sentence, and formatting variants
 *     (case/whitespace/curly-quote/dash) that should still verify. These measure
 *     the FALSE-REJECTION rate (we want 0 — the verifier must not drop valid quotes).
 *   - ADVERSARIAL (must be CAUGHT/dropped): fabricated sentences, paraphrase/
 *     word-substitution, cross-chunk splices, trivial common words, and
 *     number/quantity alterations. These measure the CATCH RATE (we want ~100%).
 *
 * Each case is wrapped in an assessment claiming coverage "substantial" with the
 * test quote as its only evidence, then run through the real verifier. A case is
 * "caught" iff the verifier downgrades it to "none" (the quote did not survive).
 *
 * Usage: node eval/adversarial.mjs --docs examples/sample-docs [--out eval/results-adversarial]
 */

import { parseFile } from '../src/ingest/parsers/index.js';
import { chunkDocument } from '../src/ingest/chunker.js';
import { discoverDocs } from '../src/util/files.js';
import { verifyAndDowngrade, normalizeForMatch } from '../src/engine/verifier.js';
import { writeJsonAtomic, ensureDir } from '../src/util/fsx.js';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const FABRICATED = [
  'All workstations are automatically wiped and re-imaged every 24 hours by the central agent.',
  'A dedicated red team performs continuous live-fire penetration testing against production.',
  'Quantum-resistant encryption is deployed across all internal microservice traffic.',
  'Every employee completes a biometric re-enrollment ceremony each fiscal quarter.',
  'The organization maintains a 0.0-second recovery time objective for all clinical systems.',
];
const TRIVIAL = ['the', 'is', 'and', '.', 'a policy'];
const SUBSTITUTIONS = [
  ['quarterly', 'hourly'], ['annually', 'never'], ['monthly', 'rarely'], ['weekly', 'sporadically'],
  ['encrypted', 'plaintext'], ['maintained', 'ignored'], ['reviewed', 'skipped'], ['approved', 'denied'],
  ['enforced', 'optional'], ['unique', 'shared'],
];

function sentences(text) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 30 && s.split(/\s+/).length >= 6);
}
function words(s) { return s.split(/\s+/); }

async function main() {
  const docsPath = arg('--docs', 'examples/sample-docs');
  const out = arg('--out', 'eval/results-adversarial');
  await ensureDir(out);

  // Build real evidence chunks.
  const files = await discoverDocs(docsPath);
  const chunks = [];
  for (const f of files) {
    try {
      const doc = await parseFile(f);
      chunks.push(...chunkDocument(doc, { size: 1200, overlap: 200 }));
    } catch { /* skip unparseable */ }
  }
  const hits = chunks.map((c) => ({ chunk: c, score: 0.5 }));
  const normChunks = chunks.map((c) => normalizeForMatch(c.text));
  const isPresent = (q) => { const n = normalizeForMatch(q); return normChunks.some((c) => c.includes(n)); };

  // Gold verbatim sentences (each lies within a single chunk).
  const gold = [];
  for (const c of chunks) for (const s of sentences(c.text)) gold.push({ chunk: c, sentence: s });
  // de-dup + cap
  const seen = new Set();
  const goldUnique = gold.filter((g) => (seen.has(g.sentence) ? false : (seen.add(g.sentence), true))).slice(0, 40);

  const cases = []; // { category, expect: 'survive'|'caught', quote, source_file }
  const push = (category, expect, quote, source_file) => cases.push({ category, expect, quote, source_file });

  for (const g of goldUnique) {
    // LEGIT — verbatim
    push('legit_verbatim', 'survive', g.sentence, g.chunk.source_file);
    // LEGIT — formatting variants (case, whitespace, smart quotes/dashes)
    const fmt = g.sentence.toUpperCase().replace(/ /g, '  ').replace(/'/g, '’').replace(/-/g, '—');
    push('legit_formatting', 'survive', fmt, g.chunk.source_file);
    // ADVERSARIAL — word substitution (paraphrase that breaks verbatim)
    let altered = g.sentence;
    for (const [a, b] of SUBSTITUTIONS) if (altered.includes(a)) { altered = altered.replace(a, b); break; }
    if (altered === g.sentence) altered = g.sentence.replace(/\d+/, (n) => String(Number(n) + 7));
    if (altered !== g.sentence) push('adv_substitution', 'caught', altered, g.chunk.source_file);
  }
  // ADVERSARIAL — fabricated
  for (const f of FABRICATED) push('adv_fabricated', 'caught', f, chunks[0]?.source_file ?? 'x');
  // ADVERSARIAL — trivial / common
  for (const t of TRIVIAL) push('adv_trivial', 'caught', t, chunks[0]?.source_file ?? 'x');
  // ADVERSARIAL — cross-chunk splice: tail of A + head of B from DIFFERENT chunks,
  // included only if the splice is genuinely absent from every chunk (a true
  // fabrication-by-splicing, not coincidentally contiguous real text).
  let made = 0;
  for (let i = 0; i < goldUnique.length && made < 12; i++) {
    const a = goldUnique[i];
    let b = null;
    for (let k = 1; k < goldUnique.length; k++) {
      const cand = goldUnique[(i + k) % goldUnique.length];
      if (cand.chunk.id !== a.chunk.id) { b = cand; break; }
    }
    if (!b) continue;
    const splice = words(a.sentence).slice(-8).join(' ') + ' ' + words(b.sentence).slice(0, 8).join(' ');
    if (!isPresent(splice)) { push('adv_crosschunk', 'caught', splice, a.chunk.source_file); made++; }
  }

  // Run each case through the real verifier.
  const byCat = {};
  for (const c of cases) {
    const a = {
      subcategory_id: 'TEST', coverage: 'substantial', confidence: 0.9,
      evidence: [{ source_file: c.source_file, quote: c.quote }], rationale: 'test', needs_review: false,
    };
    verifyAndDowngrade(a, hits);
    const survived = a.coverage !== 'none' && (a.evidence?.length ?? 0) > 0;
    const correct = c.expect === 'survive' ? survived : !survived;
    byCat[c.category] ??= { n: 0, correct: 0, expect: c.expect };
    byCat[c.category].n++;
    if (correct) byCat[c.category].correct++;
  }

  // Aggregate.
  const advCats = Object.entries(byCat).filter(([k]) => k.startsWith('adv_'));
  const legitCats = Object.entries(byCat).filter(([k]) => k.startsWith('legit_'));
  const advN = advCats.reduce((s, [, v]) => s + v.n, 0);
  const advCaught = advCats.reduce((s, [, v]) => s + v.correct, 0);
  const legitN = legitCats.reduce((s, [, v]) => s + v.n, 0);
  const legitSurvived = legitCats.reduce((s, [, v]) => s + v.correct, 0);

  const summary = {
    docs: docsPath, chunks: chunks.length, cases: cases.length,
    catch_rate: advN ? +(advCaught / advN).toFixed(4) : null,
    false_rejection_rate: legitN ? +((legitN - legitSurvived) / legitN).toFixed(4) : null,
    by_category: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, { n: v.n, correct: v.correct, rate: +(v.correct / v.n).toFixed(4) }])),
  };
  await writeJsonAtomic(`${out}/summary.json`, summary);

  console.log(`chunks=${chunks.length}  cases=${cases.length}`);
  console.log(`CATCH RATE (adversarial dropped): ${(summary.catch_rate * 100).toFixed(1)}%  (${advCaught}/${advN})`);
  console.log(`FALSE-REJECTION (legit wrongly dropped): ${(summary.false_rejection_rate * 100).toFixed(1)}%  (${legitN - legitSurvived}/${legitN})`);
  console.log('by category:');
  for (const [k, v] of Object.entries(summary.by_category)) console.log(`  ${k.padEnd(18)} ${(v.rate * 100).toFixed(0)}% correct  (${v.correct}/${v.n})`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
