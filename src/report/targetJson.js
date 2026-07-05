/**
 * Builds the machine-readable Target Profile deliverable (target-profile.json)
 * — the companion to current-profile.json. Together they form a CSF 2.0
 * Organizational Profile: one entry per Subcategory with the current coverage,
 * the target, the gap, and the human-set priority/scoping, plus the official
 * NIST Implementation Examples so downstream (GRC) consumers get the full
 * remediation context from one file.
 */

const DISCLAIMER =
  'Organizational Target Profile — companion to current-profile.json. Targets, priorities, and not-applicable ' +
  'scoping are human decisions recorded in the target profile file; no AI makes them. implementation_examples ' +
  'are the official NIST CSF 2.0 Implementation Examples (public domain, source: NIST CPRT) — illustrative, ' +
  'not exhaustive.';

export function buildTargetProfile(profile, view) {
  return {
    schemaVersion: '1.0',
    profileType: 'Target',
    framework: profile.framework,
    frameworkVersion: profile.frameworkVersion,
    generatedAt: profile.generatedAt,
    tool: profile.tool,
    disclaimer: DISCLAIMER,
    baseline: view.baseline,
    description: view.description,
    // Maturity of the current-coverage side this comparison was made against.
    review: {
      reviewed: profile.summary.reviewed,
      unreviewed: profile.summary.unreviewed,
      stale: profile.summary.stale,
    },
    summary: view.summary,
    subcategories: view.entries,
  };
}
