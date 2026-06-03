/**
 * Review-state helpers, shared by the review loop and the report renderers so
 * "what counts as reviewed" is defined in exactly one place.
 *
 * A subcategory is:
 *   - "reviewed"   : a human decision exists AND it was made against the CURRENT
 *                    assessment (its recorded hash still matches).
 *   - "stale"      : a human decision exists but the assessment changed since
 *                    (re-analysis produced different content). The human
 *                    approved something that no longer exists; re-confirm.
 *   - "unreviewed" : no human decision yet.
 *
 * The EFFECTIVE coverage shown in deliverables is the human's value when a
 * non-stale review exists, otherwise the AI's value (clearly marked unreviewed).
 */

import { hashAssessment } from '../util/hash.js';

export function reviewStatus(assessment, review) {
  if (!review) return 'unreviewed';
  return review.reviewed_against === hashAssessment(assessment) ? 'reviewed' : 'stale';
}

export function effectiveCoverage(assessment, review) {
  const status = reviewStatus(assessment, review);
  if (status === 'reviewed' && review.decision === 'override' && review.final_coverage) {
    return review.final_coverage;
  }
  return assessment.coverage;
}

export function isResolved(assessment, review) {
  return reviewStatus(assessment, review) === 'reviewed';
}
