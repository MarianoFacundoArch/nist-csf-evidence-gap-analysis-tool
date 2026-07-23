/**
 * Compact fingerprints of the inputs used to generate a report.
 *
 * Timestamps catch normal pipeline activity, but the tool deliberately allows
 * users to edit reviews and target.json by hand. Hashes let `status` detect
 * those edits (and removals) without copying any assessment content into
 * meta.json. Older work directories lack this snapshot, so their existing
 * report is treated as stale once after upgrade; the next `report` command
 * seeds the snapshot and restores exact freshness checks.
 */

import { shortHash } from '../util/hash.js';

export function buildReportSnapshot({
  assessments = {},
  reviews = {},
  target = null,
  generatedAt = null,
  engineSig = null,
  indexId = null,
} = {}) {
  return {
    generated_at: stringOrNull(generatedAt),
    assessments_hash: shortHash(assessments ?? {}),
    reviews_hash: shortHash(reviews ?? {}),
    target_hash: shortHash(target ?? null),
    engine_sig: stringOrNull(engineSig),
    index_id: stringOrNull(indexId),
  };
}

export function reportSnapshotMismatches(snapshot, currentInputs) {
  if (!snapshot || typeof snapshot !== 'object') return ['report freshness snapshot unavailable'];
  const current = buildReportSnapshot(currentInputs);
  const checks = [
    ['generated_at', 'report generation'],
    ['assessments_hash', 'assessment content'],
    ['reviews_hash', 'review content'],
    ['target_hash', 'target profile'],
    ['engine_sig', 'analysis engine'],
    ['index_id', 'evidence index'],
  ];
  return checks
    .filter(([key]) => Object.hasOwn(snapshot, key) && snapshot[key] !== current[key])
    .map(([, label]) => label);
}

function stringOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
