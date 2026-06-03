/**
 * Resolves the on-disk layout for a working directory.
 *
 * Each pipeline stage writes its own file so the user can stop after any stage
 * and resume later. Human review decisions live in a SEPARATE file from the AI
 * assessments — re-running `analyze` regenerates assessments.json but must
 * never clobber the human's reviews.json.
 */

import { join, resolve } from 'node:path';

export function resolvePaths(workDir) {
  const root = resolve(workDir);
  const reports = join(root, 'reports');
  return {
    root,
    // Run metadata + non-secret config snapshot + engine signature.
    meta: join(root, 'meta.json'),
    // INGEST output: chunks + L2-normalized vectors (the vector store on disk).
    index: join(root, 'index.json'),
    // ANALYZE output: AI assessments keyed by subcategory id (machine-owned).
    assessments: join(root, 'assessments.json'),
    // REVIEW output: human decisions keyed by subcategory id (human-owned).
    reviews: join(root, 'reviews.json'),
    // REPORT output: the three deliverables.
    reportsDir: reports,
    currentProfile: join(reports, 'current-profile.json'),
    gapReport: join(reports, 'gap-analysis.md'),
    evidenceMap: join(reports, 'evidence-map.csv'),
  };
}
