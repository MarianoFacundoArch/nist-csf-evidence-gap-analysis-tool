#!/usr/bin/env node
/**
 * Builds the committed worked example under examples/worked-example/.
 *
 * It runs the REAL pipeline (ingest -> analyze) against the bundled sample
 * documents using the deterministic MOCK providers, then writes a curated set
 * of human review decisions (accept all, plus two illustrative overrides and a
 * note on the verifier-downgraded item), and finally renders the three
 * deliverables. Because the mock providers are deterministic and timestamps are
 * pinned, re-running this reproduces byte-identical output — so anyone can
 * regenerate the example offline with no API key (`npm run example`).
 *
 * This is also where the fabricated-quote safeguard is visible end-to-end: the
 * mock fabricates a quote for GV.OC-01, the verifier downgrades it to "none",
 * and the human review records that on the committed artifact.
 */

import { buildContext } from '../src/core/context.js';
import { createNonInteractiveUi } from '../src/cli/ui.cli.js';
import { ingest } from '../src/actions/ingest.js';
import { analyze } from '../src/actions/analyze.js';
import { report } from '../src/actions/report.js';
import { loadCsfCore } from '../src/csf/loader.js';
import { readJsonSafe, writeJsonAtomic } from '../src/util/fsx.js';
import { hashAssessment } from '../src/util/hash.js';

const FIXED_NOW = '2026-01-01T00:00:00.000Z';
const REVIEWER = 'reviewer@example.org';

const CONFIG = {
  docsPath: 'examples/sample-docs',
  workDir: 'examples/worked-example/output',
  csfCorePath: 'data/csf-core.json',
  chunk: { size: 1200, overlap: 200 },
  embeddings: { provider: 'mock', model: 'mock' },
  llm: { provider: 'mock', model: 'mock' },
  retrieval: { topK: 6 },
  analysis: { confidenceThreshold: 0.6, critique: false, strict: false },
  review: { showAll: true },
  report: { evidenceQuoteMaxChars: 300 },
  identity: REVIEWER,
  fixedNow: FIXED_NOW,
  logLevel: 'warn',
};

async function main() {
  // Persist the example config alongside the artifacts for transparency.
  await writeJsonAtomic('examples/worked-example/config.json', CONFIG);

  const ctx = await buildContext(CONFIG);
  ctx.ui = createNonInteractiveUi(ctx.logger);

  await ingest(ctx);
  await analyze(ctx);

  // Curate human review decisions deterministically.
  const csf = await loadCsfCore(ctx.config.csfCorePath, ctx.logger);
  const assessments = await readJsonSafe(ctx.paths.assessments, {});
  const reviews = {};

  // Pick two illustrative overrides: the first AI "partial" that has verified
  // evidence is raised (human has out-of-band proof), and the first AI
  // "substantial" is lowered (human is stricter about sustained operation).
  let raiseId = null;
  let lowerId = null;
  for (const sub of csf.subcategories) {
    const a = assessments[sub.id];
    if (!a) continue;
    if (!raiseId && a.coverage === 'partial' && (a.evidence?.length ?? 0) > 0) raiseId = sub.id;
    if (!lowerId && a.coverage === 'substantial') lowerId = sub.id;
  }

  for (const sub of csf.subcategories) {
    const a = assessments[sub.id];
    if (!a) continue;
    const base = {
      subcategory_id: sub.id,
      decision: 'accept',
      final_coverage: a.coverage,
      note: null,
      reviewed_by: REVIEWER,
      reviewed_at: FIXED_NOW,
      reviewed_against: hashAssessment(a),
    };
    if (sub.id === raiseId) {
      base.decision = 'override';
      base.final_coverage = 'substantial';
      base.note = 'Reviewer override: out-of-band records (ticketing system) confirm this is operating; raising from partial.';
    } else if (sub.id === lowerId) {
      base.decision = 'override';
      base.final_coverage = 'partial';
      base.note = 'Reviewer override: evidence reads as intent more than sustained operation; lowering pending dated records.';
    } else if (a.verifier_action === 'downgraded_to_none_no_valid_quote') {
      base.note = 'Accepted: the AI quote could not be verified verbatim and was removed by the tool; manual evidence check pending.';
    }
    reviews[sub.id] = base;
  }
  await writeJsonAtomic(ctx.paths.reviews, reviews);

  const result = await report(ctx);
  // eslint-disable-next-line no-console
  console.error(
    `Worked example generated. Gaps ${result.summary.gaps}/${result.summary.totalSubcategories}, ` +
      `reviewed ${result.summary.reviewed}, overrides ${result.summary.overridden}, ` +
      `verifier downgrades ${result.summary.downgradedByVerifier}.`,
  );
  console.error(`Overrides: raised ${raiseId} -> substantial, lowered ${lowerId} -> partial.`);
}

main().catch((err) => {
  console.error('build-example failed:', err.stack ?? err.message);
  process.exitCode = 1;
});
