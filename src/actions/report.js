/**
 * REPORT action: render the three deliverables from the reviewed assessments.
 * In strict mode this refuses to emit until every item is resolved (the
 * renderReports call throws a StrictModeError, caught at the CLI boundary).
 */

import { loadCsfCore } from '../csf/loader.js';
import { readJsonSafe, fileExists } from '../util/fsx.js';
import { renderReports } from '../report/index.js';
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

  const result = await renderReports(ctx, { csf, assessments, reviews, meta });

  const s = result.profile.summary;
  logger.info(`Report written to ${ctx.paths.reportsDir}`);
  logger.info(
    `  gaps: ${s.gaps}/${s.totalSubcategories} | reviewed: ${s.reviewed}, unreviewed: ${s.unreviewed}, stale: ${s.stale}`,
  );
  if (s.unreviewed > 0 || s.stale > 0) {
    logger.warn('The profile contains unreviewed/stale items and is marked DRAFT. Run `review` to validate them.');
  }
  return {
    profileJsonPath: result.profileJsonPath,
    gapMdPath: result.gapMdPath,
    evidenceCsvPath: result.evidenceCsvPath,
    summary: s,
  };
}
