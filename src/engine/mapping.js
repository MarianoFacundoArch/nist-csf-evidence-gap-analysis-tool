/**
 * The mapping engine — the inverted-RAG core, run once per subcategory.
 *
 * Flow (and the WHY at each step):
 *   1. Embed the subcategory OUTCOME and retrieve the top-k closest chunks. We
 *      retrieve per subcategory (not per user question) because the tool asks,
 *      for every CSF outcome, "is this achieved by the evidence?".
 *   2. If nothing is retrieved, the honest answer is "none" — never invent.
 *   3. Prompt the model with ONLY that evidence; parse its JSON; validate
 *      against the schema; retry ONCE with a repair hint on malformed output.
 *   4. If still invalid, fall back to coverage="none" + needs_review (never crash).
 *   5. VERIFY every quote verbatim against the evidence (downgrades fabrications).
 *   6. Apply the confidence threshold (low confidence => human review).
 *   7. Optionally run a skeptical critique pass, re-verified the same way.
 *
 * Provider/transport errors are allowed to propagate so a systemic failure
 * (bad key, daemon down) stops the run with guidance instead of silently
 * marking every subcategory "none". Only MALFORMED MODEL OUTPUT degrades here.
 */

import { SYSTEM_PROMPT, buildTaskPrompt, buildCritiquePrompt } from '../prompts/templates.js';
import { validateAssessment } from './assessment.schema.js';
import { verifyAndDowngrade } from './verifier.js';
import { topK } from '../store/vectorStore.js';

/** Tolerantly extract the first JSON object from a model response. */
export function extractJsonObject(raw) {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  // Strip accidental code fences.
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(text);
  } catch {
    // Fall back to the outermost {...} span.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function fallbackNone(sub, reason) {
  return {
    subcategory_id: sub.id,
    coverage: 'none',
    confidence: 0,
    evidence: [],
    rationale: `Automated fallback: ${reason}.`,
    needs_review: true,
    fallback: true,
    fallback_reason: reason,
    verifier_action: null,
    verification: { quotes_checked: 0, quotes_verified: 0, downgraded: false },
  };
}

/** Attach derived display/provenance fields shared by every assessment. */
function enrich(assessment, sub, hits, { engineSig, now }) {
  assessment.subcategory_id = sub.id;
  assessment.function = sub.functionName;
  assessment.category = sub.category;
  assessment.outcome = sub.outcome;
  assessment.retrieved = hits.map((h) => {
    const c = h.chunk ?? h;
    return { chunk_id: c.id, source_file: c.source_file, page: c.page ?? null, score: Number(h.score?.toFixed?.(4) ?? h.score) };
  });
  assessment.engine_sig = engineSig;
  assessment.assessed_at = now;
  if (assessment.fallback == null) assessment.fallback = false;
  if (assessment.critique === undefined) assessment.critique = null;
  return assessment;
}

/**
 * Assess one subcategory. Returns the enriched, verified assessment object.
 * @param {object} params
 * @param {object} params.sub enriched subcategory (id, outcome, functionName, ...)
 * @param {object} params.index loaded vector index
 * @param {object} params.embedder embeddings provider
 * @param {object} params.llm reasoning LLM provider
 * @param {object} params.config
 * @param {string} params.engineSig signature for staleness/resume
 * @param {string} params.now ISO timestamp
 * @param {number[]} [params.queryVec] precomputed outcome embedding (lets the
 *   caller batch all subcategory embeddings into a single provider call)
 */
export async function assessSubcategory({ sub, index, embedder, llm, config, engineSig, now, queryVec }) {
  // 1) Retrieve. Reuse a precomputed embedding when provided, else embed now.
  const vec = queryVec ?? (await embedder.embed([sub.outcome]))[0];
  const hits = topK(index, vec, config.retrieval.topK);

  // 2) No evidence => honest "none".
  if (hits.length === 0) {
    return enrich(fallbackNone(sub, 'no evidence retrieved from the corpus'), sub, hits, { engineSig, now });
  }

  // 3) Prompt + parse + validate, retry once on malformed output.
  const system = SYSTEM_PROMPT;
  let user = buildTaskPrompt(sub, hits);
  let parsed = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const raw = await llm.judge({ system, user, meta: { subcategory: sub, hits, pass: 'first' } });
    const candidate = extractJsonObject(raw);
    const result = validateAssessment(candidate);
    if (result.ok) {
      parsed = result.value;
    } else if (attempt === 0) {
      // Retry once, telling the model exactly what was wrong.
      user =
        buildTaskPrompt(sub, hits) +
        `\n\nYOUR PREVIOUS RESPONSE WAS REJECTED for these reasons:\n- ${result.errors.join('\n- ')}\n` +
        'Return ONLY the corrected single JSON object, nothing else.';
    }
  }

  // 4) Fallback if still invalid.
  if (!parsed) {
    return enrich(fallbackNone(sub, 'model output failed schema validation after one retry'), sub, hits, { engineSig, now });
  }

  // 5) Verbatim verification (may force coverage -> none).
  verifyAndDowngrade(parsed, hits);

  // 6) Confidence threshold.
  if (parsed.confidence < config.analysis.confidenceThreshold) parsed.needs_review = true;

  // 7) Optional critique pass.
  if (config.analysis.critique) {
    const firstPassJson = JSON.stringify({
      subcategory_id: parsed.subcategory_id,
      coverage: parsed.coverage,
      confidence: parsed.confidence,
      evidence: parsed.evidence.map((e) => ({ source_file: e.source_file, quote: e.quote })),
      rationale: parsed.rationale,
      needs_review: parsed.needs_review,
    });
    const critiqueUser = buildCritiquePrompt(sub, hits, firstPassJson);
    const raw2 = await llm.judge({
      system,
      user: critiqueUser,
      meta: { subcategory: sub, hits, pass: 'critique', firstPass: parsed },
    });
    const result2 = validateAssessment(extractJsonObject(raw2));
    if (result2.ok) {
      const corrected = verifyAndDowngrade(result2.value, hits);
      if (corrected.confidence < config.analysis.confidenceThreshold) corrected.needs_review = true;
      const changed = corrected.coverage !== parsed.coverage || corrected.confidence !== parsed.confidence;
      corrected.critique = { applied: changed, note: corrected.rationale };
      parsed = corrected;
    } else {
      parsed.critique = { applied: false, note: 'Critique output was invalid and was ignored; first-pass result retained.' };
      parsed.needs_review = true;
    }
  }

  return enrich(parsed, sub, hits, { engineSig, now });
}
