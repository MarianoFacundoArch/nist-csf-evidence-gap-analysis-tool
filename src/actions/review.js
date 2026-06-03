/**
 * REVIEW action: the mandatory human-in-the-loop step. Loads the AI assessments
 * and the (separate) human reviews, runs the interactive loop, and persists
 * each decision immediately. Human decisions are never overwritten by re-analysis.
 */

import { loadCsfCore } from '../csf/loader.js';
import { readJsonSafe, writeJsonAtomic, fileExists } from '../util/fsx.js';
import { runReview } from '../review/review.js';
import { StageError } from '../core/errors.js';

export async function review(ctx) {
  const { logger, config } = ctx;

  if (!(await fileExists(ctx.paths.assessments))) {
    throw new StageError('No assessments found to review.', { hint: 'Run `csf-tool analyze` first.' });
  }

  const csf = await loadCsfCore(config.csfCorePath, logger);
  const assessments = (await readJsonSafe(ctx.paths.assessments, {})) ?? {};
  const reviews = (await readJsonSafe(ctx.paths.reviews, {})) ?? {};

  const persist = () => writeJsonAtomic(ctx.paths.reviews, reviews);
  const stats = await runReview(ctx, {
    csf,
    assessments,
    reviews,
    persist,
    acceptAll: config.acceptAll,
  });

  logger.info(
    `Review: ${stats.reviewed} accepted, ${stats.overridden} overridden, ${stats.skipped} skipped, ${stats.remaining} still need review.`,
  );
  return { reviewsPath: ctx.paths.reviews, ...stats };
}
