/**
 * STATUS action: inspect persisted pipeline state without changing it.
 *
 * This action intentionally does not initialize providers or write a status
 * cache. The existing stage artifacts remain the source of truth.
 */

import { loadCsfCore } from '../csf/loader.js';
import { validateTargetSpec } from '../target/targetProfile.js';
import { readJsonSafe, fileExists } from '../util/fsx.js';
import { buildAssessmentStatus, renderAssessmentStatus } from '../status/assessmentStatus.js';

export async function status(ctx) {
  const { logger, config } = ctx;
  const csf = await loadCsfCore(config.csfCorePath, logger);
  const [meta, assessments, reviews, profile] = await Promise.all([
    readJsonSafe(ctx.paths.meta, {}),
    readJsonSafe(ctx.paths.assessments, {}),
    readJsonSafe(ctx.paths.reviews, {}),
    readJsonSafe(ctx.paths.currentProfile, null),
  ]);

  let target = null;
  let targetError = null;
  try {
    target = await readJsonSafe(ctx.paths.target, null);
    if (target != null) validateTargetSpec({ ...target }, `target profile (${ctx.paths.target})`);
  } catch (err) {
    targetError = err.userMessage ?? `Target profile is not valid JSON: ${err.message}`;
  }

  const reportArtifacts = await artifactPresence(ctx.paths);
  const indexExists = typeof ctx.paths.index === 'string' ? await fileExists(ctx.paths.index) : null;

  const result = buildAssessmentStatus({
    subcategoryIds: csf.subcategories.map((subcategory) => subcategory.id),
    meta: meta ?? {},
    assessments: assessments ?? {},
    reviews: reviews ?? {},
    target,
    targetError,
    profile,
    reportArtifacts,
    indexExists,
    workDir: ctx.paths.root,
  });
  const body = renderAssessmentStatus(result);

  if (ctx.ui?.note) ctx.ui.note('Assessment status', body);
  else logger.info(`Assessment status\n${body}`);
  return result;
}

async function artifactPresence(paths) {
  const entries = await Promise.all(
    [
      ['gapReport', paths.gapReport],
      ['evidenceMap', paths.evidenceMap],
      ['dashboard', paths.dashboard],
      ['targetProfile', paths.targetProfile],
      ['remediationPlan', paths.remediationPlan],
    ].map(async ([key, path]) => [key, typeof path === 'string' ? await fileExists(path) : null]),
  );
  return Object.fromEntries(entries);
}
