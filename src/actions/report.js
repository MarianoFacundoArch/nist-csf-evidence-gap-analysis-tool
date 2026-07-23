/**
 * REPORT action: render the deliverables from the reviewed assessments — and,
 * when a target profile exists, the Target Profile + prioritized remediation
 * plan alongside. In strict mode this refuses to emit until every item is
 * resolved (the renderReports call throws a StrictModeError, caught at the CLI
 * boundary).
 */

import { loadCsfCore } from '../csf/loader.js';
import { loadTargetSpec } from '../target/targetProfile.js';
import { readJsonSafe, writeJsonAtomic, fileExists } from '../util/fsx.js';
import { renderReports } from '../report/index.js';
import { buildReportSnapshot } from '../status/reportSnapshot.js';
import { StageError } from '../core/errors.js';

export async function report(ctx) {
  const { logger, config } = ctx;

  if (!(await fileExists(ctx.paths.assessments))) {
    throw new StageError('No assessments found to report on.', { hint: 'Run `csf-tool analyze` (and `review`) first.' });
  }

  const csf = await loadCsfCore(config.csfCorePath, logger);
  const assessments = (await readJsonSafe(ctx.paths.assessments, {})) ?? {};
  const reviews = (await readJsonSafe(ctx.paths.reviews, {})) ?? {};
  const meta = (await readJsonSafe(ctx.paths.meta, {})) ?? {};
  // Optional: absent => current-side deliverables only (loudly invalid if malformed).
  const targetSpec = await loadTargetSpec(ctx.paths.target, { csf, logger });
  // Read the original representation only after friendly validation succeeds;
  // its hash must match the same hand-edited JSON that `status` later reads.
  const rawTarget = await readJsonSafe(ctx.paths.target, null);

  const result = await renderReports(ctx, { csf, assessments, reviews, meta, targetSpec });

  // Save hashes only (never report content) so `status` can detect manual edits
  // and target removal even when an optional timestamp was not updated.
  meta.reported_at = result.profile.generatedAt;
  meta.report_snapshot = buildReportSnapshot({
    assessments,
    reviews,
    target: rawTarget,
    generatedAt: result.profile.generatedAt,
    engineSig: meta.engine_sig,
    indexId: meta.index_id,
  });
  await writeJsonAtomic(ctx.paths.meta, meta);

  const s = result.profile.summary;
  logger.info(`Report written to ${ctx.paths.reportsDir}`);
  logger.info(
    `  gaps: ${s.gaps}/${s.totalSubcategories} | reviewed: ${s.reviewed}, unreviewed: ${s.unreviewed}, stale: ${s.stale}`,
  );
  logger.info(`  dashboard (open in a browser): ${result.dashboardPath}`);
  if (result.targetView) {
    const t = result.targetView.summary;
    logger.info(
      `  target: met ${t.met}/${t.applicable} (${t.pctMet}%) — remediation plan: ${result.remediationPlanPath}`,
    );
  }
  if (s.unreviewed > 0 || s.stale > 0) {
    logger.warn('The profile contains unreviewed/stale items and is marked DRAFT. Run `review` to validate them.');
  }
  return {
    profileJsonPath: result.profileJsonPath,
    gapMdPath: result.gapMdPath,
    evidenceCsvPath: result.evidenceCsvPath,
    targetProfileJsonPath: result.targetProfileJsonPath,
    remediationPlanPath: result.remediationPlanPath,
    summary: s,
    targetSummary: result.targetView?.summary ?? null,
  };
}
