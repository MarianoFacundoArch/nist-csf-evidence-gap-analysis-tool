/**
 * Coverage tier vocabulary and helpers.
 *
 * The four levels are exactly those required by the brief. "Gaps" in the
 * report are coverage that is not yet substantially achieved — i.e. "none" or
 * "partial" — which are listed first because they are the actionable items.
 */

export const COVERAGE_LEVELS = ['none', 'partial', 'substantial', 'full'];

export function isValidCoverage(c) {
  return COVERAGE_LEVELS.includes(c);
}

export function coverageRank(c) {
  const i = COVERAGE_LEVELS.indexOf(c);
  return i < 0 ? 0 : i;
}

/** A gap is anything not at least "substantial". */
export function isGap(c) {
  return c === 'none' || c === 'partial';
}

/** Tally coverage values into a summary object. */
export function summarizeCoverage(values) {
  const counts = { none: 0, partial: 0, substantial: 0, full: 0 };
  for (const v of values) if (counts[v] != null) counts[v]++;
  return counts;
}
