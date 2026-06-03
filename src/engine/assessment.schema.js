/**
 * Schema + validation for the model's per-subcategory response.
 *
 * This enforces the structured-output CONTRACT (brief §5): a single JSON object
 * with coverage/confidence/evidence/rationale/needs_review of the right types.
 *
 * We intentionally do NOT encode the "quote or it doesn't count" rule here as a
 * hard schema constraint. Real models — especially smaller local ones — often
 * return sensible-but-self-contradictory shapes (e.g. coverage "none" together
 * with a quote, or an empty-string quote). Rejecting those just wastes the one
 * retry and discards the model's real rationale. Instead we COERCE the output
 * into a clean shape and let the code-side verifier (verifier.js) — which is the
 * AUTHORITATIVE check — enforce the semantics: it drops unverifiable quotes,
 * downgrades any coverage above "none" that has no verified quote, and clears
 * evidence for "none". Schema validity only proves the shape; it never proves a
 * quote exists in the evidence.
 */

import Ajv from 'ajv';

export const assessmentSchema = {
  title: 'CSF 2.0 Subcategory Coverage Assessment',
  type: 'object',
  additionalProperties: false,
  required: ['subcategory_id', 'coverage', 'confidence', 'evidence', 'rationale', 'needs_review'],
  properties: {
    subcategory_id: { type: 'string', minLength: 1 },
    coverage: { type: 'string', enum: ['none', 'partial', 'substantial', 'full'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['source_file', 'quote'],
        properties: {
          source_file: { type: 'string', minLength: 1 },
          quote: { type: 'string', minLength: 1 },
        },
      },
    },
    rationale: { type: 'string', minLength: 1 },
    needs_review: { type: 'boolean' },
  },
};

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(assessmentSchema);

/**
 * Coerce a model response into the clean contract shape so common, harmless
 * deviations don't force a retry/fallback and lose the model's real reasoning:
 *  - normalize coverage case/whitespace ("Partial" -> "partial");
 *  - coerce confidence from string and clamp to [0,1];
 *  - coerce needs_review from "true"/"false" strings;
 *  - keep only well-formed, non-empty evidence items (drop empty-quote noise);
 *  - strip unknown top-level/evidence keys so a stray field isn't rejected.
 * The verifier then enforces the actual quote/coverage semantics.
 */
function coerce(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;

  let confidence = obj.confidence;
  if (typeof confidence === 'string' && confidence.trim() !== '' && !Number.isNaN(Number(confidence))) {
    confidence = Number(confidence);
  }
  if (typeof confidence === 'number') confidence = Math.max(0, Math.min(1, confidence));

  let needsReview = obj.needs_review;
  if (typeof needsReview === 'string') needsReview = needsReview.trim().toLowerCase() === 'true';

  const evidence = (Array.isArray(obj.evidence) ? obj.evidence : [])
    .filter(
      (e) =>
        e && typeof e === 'object' &&
        typeof e.source_file === 'string' && e.source_file.trim() &&
        typeof e.quote === 'string' && e.quote.trim(),
    )
    .map((e) => ({ source_file: e.source_file, quote: e.quote }));

  return {
    subcategory_id: obj.subcategory_id,
    coverage: typeof obj.coverage === 'string' ? obj.coverage.trim().toLowerCase() : obj.coverage,
    confidence,
    evidence,
    rationale: obj.rationale,
    needs_review: needsReview,
  };
}

/**
 * @returns {{ok: true, value: object} | {ok: false, errors: string[]}}
 */
export function validateAssessment(candidate) {
  const value = coerce(candidate);
  if (validate(value)) return { ok: true, value };
  const errors = (validate.errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message}`);
  return { ok: false, errors };
}
