/**
 * Schema + validation for the model's response to a question (`csf-tool ask`).
 *
 * The contract is a single JSON object: an answer, whether the evidence
 * supports it, and the quotes it stands on.
 *
 * As with assessments (assessment.schema.js), the schema only proves the SHAPE.
 * It deliberately does not encode "a supported answer needs a quote": a model
 * that returns `supported: true` with an empty or fabricated evidence array is
 * not malformed, it is wrong, and the place that decides that is the code-side
 * verifier (verifier.js) followed by the forcing rule in ask.js — the answer is
 * withheld when no quote survives. Rejecting such output here would only spend
 * the single retry without making the result any safer.
 *
 * Harmless deviations are coerced instead of rejected, so the one retry is kept
 * for output that is genuinely unusable.
 */

import Ajv from 'ajv';

export const answerSchema = {
  title: 'Evidence-grounded answer to a question',
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'supported', 'evidence'],
  properties: {
    answer: { type: 'string' },
    supported: { type: 'boolean' },
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
  },
};

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(answerSchema);

/**
 * Coerce a model response into the clean contract shape:
 *  - coerce `supported` from the strings "true"/"false" (any other string is
 *    left alone and rejected — an unclear value must not become a yes or a no);
 *  - trim the answer; an unsupported response may omit it altogether;
 *  - keep only well-formed, non-empty evidence items (drop empty-quote noise);
 *  - strip unknown top-level/evidence keys so a stray field isn't rejected.
 */
function coerce(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;

  let supported = obj.supported;
  if (typeof supported === 'string') {
    const text = supported.trim().toLowerCase();
    if (text === 'true') supported = true;
    else if (text === 'false') supported = false;
  }

  let answer = obj.answer;
  if (typeof answer === 'string') answer = answer.trim();
  else if (answer == null && supported === false) answer = '';

  const evidence = (Array.isArray(obj.evidence) ? obj.evidence : [])
    .filter(
      (e) =>
        e && typeof e === 'object' &&
        typeof e.source_file === 'string' && e.source_file.trim() &&
        typeof e.quote === 'string' && e.quote.trim(),
    )
    .map((e) => ({ source_file: e.source_file, quote: e.quote }));

  return { answer, supported, evidence };
}

/**
 * @returns {{ok: true, value: {answer: string, supported: boolean, evidence: Array<{source_file: string, quote: string}>}}
 *   | {ok: false, errors: string[]}}
 */
export function validateAnswer(candidate) {
  const value = coerce(candidate);
  if (!validate(value)) {
    const errors = (validate.errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message}`);
    return { ok: false, errors };
  }
  // An answer that claims support must actually say something. (An unsupported
  // response may leave it empty: its text is never shown.)
  if (value.supported && value.answer === '') {
    return { ok: false, errors: ['/answer must not be empty when "supported" is true'] };
  }
  return { ok: true, value };
}
