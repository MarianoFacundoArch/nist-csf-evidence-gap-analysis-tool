/**
 * Deterministic hashing helpers.
 *
 * Used for two distinct purposes:
 *  - engineSignature(): a fingerprint of the inputs that produced an assessment
 *    (models, retrieval params, index version). If any input changes, the
 *    signature changes and `analyze` knows the stored assessment is stale and
 *    must be recomputed — this is how resume stays correct.
 *  - hashAssessment(): a content hash of an AI assessment, recorded on a human
 *    review as `reviewed_against`. If the assessment later changes, the recorded
 *    hash no longer matches and the review is flagged STALE (the human approved
 *    something that no longer exists).
 */

import { createHash } from 'node:crypto';

/** Stable SHA-256 (hex) of any JSON-serializable value, with sorted keys. */
export function stableHash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/** Short 12-char hash — enough to detect change, compact in stored files. */
export function shortHash(value) {
  return stableHash(value).slice(0, 12);
}

/**
 * JSON.stringify with deterministic key ordering so logically-equal objects
 * always produce the same string (and therefore the same hash) regardless of
 * key insertion order.
 */
export function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

/**
 * Fingerprint of everything that affects an assessment's content. Two analyze
 * runs with the same signature may reuse cached assessments.
 */
export function engineSignature({ embeddingModel, llmModel, topK, chunkSize, chunkOverlap, critique, indexId }) {
  return shortHash({ embeddingModel, llmModel, topK, chunkSize, chunkOverlap, critique, indexId });
}

/**
 * Content hash of an assessment for staleness detection. It hashes ONLY the
 * substance a human actually endorses — the coverage level and the exact
 * supporting quotes — and deliberately ignores volatile fields. In particular
 * it excludes retrieval scores (which drift on re-embedding due to float
 * nondeterminism), chunk ids/pages, the (re-worded each run) rationale, and
 * confidence. Otherwise a harmless re-embed or re-analyze would spuriously flip
 * a reviewed item to STALE and force needless re-review. A review goes stale
 * only when the AI's coverage or its supporting quotes change.
 */
export function hashAssessment(assessment) {
  if (!assessment) return null;
  const evidence = Array.isArray(assessment.evidence)
    ? assessment.evidence.map((e) => ({ source_file: e.source_file, quote: e.quote }))
    : [];
  return shortHash({ coverage: assessment.coverage, evidence });
}
