/**
 * The question engine — one free-text question answered from the ingested
 * documents, with the same guarantee as an assessment: an answer stands only on
 * quotes proven verbatim in the retrieved evidence.
 *
 * It deliberately reuses the assessment machinery instead of building a
 * lighter, weaker path next to it: the same index and top-k retrieval, the same
 * tolerant JSON extraction, and the same verifier (verifyQuotes — identical
 * matching rules, identical substantive-quote bar).
 *
 * Flow (and the WHY at each step):
 *   1. Embed the question and retrieve the top-k closest chunks.
 *   2. If nothing is retrieved there is nothing to answer from — report that
 *      without calling the model at all.
 *   3. Prompt the model with ONLY that evidence; parse its JSON; validate the
 *      shape; retry ONCE with the rejection reasons on malformed output.
 *   4. If it is still invalid, fall back to "no answer" with a reason (never
 *      crash, never show unparsed model text).
 *   5. VERIFY every quote verbatim against the evidence.
 *   6. THE FORCING RULE: an answer the model calls supported, but whose quotes
 *      all fail verification, is WITHHELD — its text is neither shown nor
 *      returned. This is the analogue of downgrading an unanchored coverage
 *      claim to "none": a claim with no surviving quote does not stand.
 *
 * What is NOT verified is the answer sentence itself: it is the model's summary
 * of the quotes. The result keeps the two apart (answer vs. verified evidence)
 * so a caller can always show which part is proven and which is not.
 *
 * Nothing here reads or writes assessment state; the function is pure with
 * respect to disk. Provider/transport errors propagate (as in mapping.js) so a
 * bad key or a stopped daemon is reported as such, not as "no evidence".
 */

import { ASK_SYSTEM_PROMPT, buildAskPrompt } from '../prompts/askTemplates.js';
import { validateAnswer } from './ask.schema.js';
import { verifyQuotes } from './verifier.js';
import { extractJsonObject } from './mapping.js';
import { topK } from '../store/vectorStore.js';

/**
 * The tool's own sentence for every unsupported outcome. It is what the result
 * carries as `answer` whenever `supported` is false, so no path can surface
 * model prose that is not anchored to a verified quote.
 */
export const NO_EVIDENCE_ANSWER = 'No verifiable evidence in the ingested documents answers this question.';

/** Why a question got no answer (`unsupported_reason` in the result). */
export const UNSUPPORTED_REASONS = Object.freeze({
  NO_PASSAGES: 'no_passages_retrieved',
  MODEL_FOUND_NONE: 'model_found_no_answer',
  NO_VALID_QUOTE: 'answer_withheld_no_valid_quote',
  INVALID_OUTPUT: 'model_output_invalid',
});

/** What was searched: ids and provenance of the retrieved chunks, never their text. */
function describeHits(hits) {
  return hits.map((h) => {
    const c = h.chunk ?? h;
    return { chunk_id: c.id, source_file: c.source_file, page: c.page ?? null, score: Number(h.score?.toFixed?.(4) ?? h.score) };
  });
}

function unsupported(question, hits, reason, { verifierAction = null, checked = 0 } = {}) {
  return {
    question,
    supported: false,
    answer: NO_EVIDENCE_ANSWER,
    evidence: [],
    unsupported_reason: reason,
    verifier_action: verifierAction,
    verification: { quotes_checked: checked, quotes_verified: 0, quotes_dropped: checked },
    retrieved: describeHits(hits),
  };
}

/**
 * Answer one question from the index.
 * @param {object} params
 * @param {string} params.question the question (already trimmed, non-empty)
 * @param {object} params.index loaded vector index
 * @param {object} params.embedder embeddings provider
 * @param {object} params.llm reasoning LLM provider
 * @param {object} params.config
 * @returns {Promise<{question: string, supported: boolean, answer: string,
 *   evidence: object[], unsupported_reason: string|null, verifier_action: string|null,
 *   verification: {quotes_checked: number, quotes_verified: number, quotes_dropped: number},
 *   retrieved: object[]}>} `evidence` holds only verified quotes, each with its
 *   real source file, page, chunk id and retrieval score.
 */
export async function answerQuestion({ question, index, embedder, llm, config }) {
  // 1) Retrieve.
  const [vec] = await embedder.embed([question]);
  const hits = topK(index, vec, config.retrieval.topK);

  // 2) Nothing retrieved => nothing to answer from. The model is not asked.
  if (hits.length === 0) return unsupported(question, hits, UNSUPPORTED_REASONS.NO_PASSAGES);

  // 3) Prompt + parse + validate, retry once on malformed output.
  const system = ASK_SYSTEM_PROMPT;
  let user = buildAskPrompt(question, hits);
  let parsed = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    // `meta` is structured context for the offline mock provider only.
    const raw = await llm.judge({ system, user, meta: { pass: 'ask', question, hits } });
    const result = validateAnswer(extractJsonObject(raw));
    if (result.ok) {
      parsed = result.value;
    } else if (attempt === 0) {
      // Retry once, telling the model exactly what was wrong.
      user =
        buildAskPrompt(question, hits) +
        `\n\nYOUR PREVIOUS RESPONSE WAS REJECTED for these reasons:\n- ${result.errors.join('\n- ')}\n` +
        'Return ONLY the corrected single JSON object, nothing else.';
    }
  }

  // 4) Fallback if still invalid.
  if (!parsed) return unsupported(question, hits, UNSUPPORTED_REASONS.INVALID_OUTPUT);

  // The model itself found no answer. Its prose (if any) and any quote it
  // attached anyway are dropped: "unsupported" carries no evidence.
  if (!parsed.supported) return unsupported(question, hits, UNSUPPORTED_REASONS.MODEL_FOUND_NONE);

  // 5) Verbatim verification — the same rules as for assessments.
  const { verified, checked, dropped } = verifyQuotes(parsed.evidence, hits);

  // 6) THE FORCING RULE: "supported" with zero verified quotes does not stand.
  if (verified.length === 0) {
    return unsupported(question, hits, UNSUPPORTED_REASONS.NO_VALID_QUOTE, {
      verifierAction: 'answer_withheld_no_valid_quote',
      checked,
    });
  }

  return {
    question,
    supported: true,
    answer: parsed.answer,
    evidence: verified,
    unsupported_reason: null,
    // Some quotes survived, some did not: keep the answer, say how many went.
    verifier_action: dropped > 0 ? `dropped_${dropped}_unverifiable_quote${dropped === 1 ? '' : 's'}` : null,
    verification: { quotes_checked: checked, quotes_verified: verified.length, quotes_dropped: dropped },
    retrieved: describeHits(hits),
  };
}
