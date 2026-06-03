/**
 * VERIFIER — verbatim quote verification (the core anti-hallucination safeguard).
 *
 * WHY this lives in code, not just the prompt: a model can and occasionally will
 * fabricate, paraphrase, or "helpfully correct" a quote. The brief requires we
 * PROVE each quote exists. This module is what makes the guarantee real — a
 * coverage claim is only allowed to stand if it is anchored to text that
 * demonstrably exists in the retrieved evidence.
 *
 * Normalization is deliberately limited to TRIVIAL formatting differences
 * (unicode form, curly quotes/dashes, whitespace, case). We do NOT strip
 * punctuation or stem words — doing so would let a paraphrase slip through. The
 * only things normalized are artifacts that legitimately differ between a PDF's
 * extracted text and how a model echoes it.
 */

/** Normalize for substring matching. Applied IDENTICALLY to evidence and quotes. */
export function normalizeForMatch(s) {
  return String(s ?? '')
    // NFC (canonical composition) recombines split accents from PDF extraction
    // (e.g. "e"+combining-acute -> "é") WITHOUT the compatibility folding NFKC
    // does — NFKC would wrongly equate "m²"≡"m2", a ligature "ﬁ"≡"fi", or a
    // fullwidth digit with ASCII, letting a non-verbatim quote pass.
    .normalize('NFC')
    .replace(/[‘’‛]/g, "'") // curly single quotes -> '
    .replace(/[“”]/g, '"') // curly double quotes -> "
    .replace(/[–—]/g, '-') // en/em dash -> hyphen
    .replace(/\s+/g, ' ') // collapse all whitespace
    .trim()
    .toLowerCase();
}

/**
 * Is a (normalized) quote substantive enough to actually anchor a coverage
 * claim? A single ubiquitous word ("the", "is") or a stray "." is a substring
 * of almost any document, so without this bar a model could prop up high
 * coverage with a meaningless "quote". We require a minimum length AND a few
 * real content words; quotes that fail are treated like fabrications (dropped),
 * so the forcing rule downgrades coverage to "none" when nothing real survives.
 */
function isSubstantiveQuote(normalized) {
  if (normalized.length < 20) return false;
  const contentWords = normalized.match(/[a-z]{3,}/g);
  return (contentWords?.length ?? 0) >= 3;
}

/**
 * Verify each claimed quote against the retrieved evidence and, if a coverage
 * claim above "none" has no surviving verbatim quote, downgrade it to "none".
 *
 * @param {object} assessment validated model output (mutated and returned)
 * @param {Array<{chunk:{source_file:string,page:number|null,id:string,text:string}, score:number}>} hits
 * @returns {object} the assessment with verified+enriched evidence and a
 *   `verification` summary; coverage/needs_review possibly downgraded.
 */
export function verifyAndDowngrade(assessment, hits) {
  const chunks = hits.map((h) => h.chunk ?? h);
  // Pre-normalize each chunk once; remember source/page/id for attribution.
  const normChunks = chunks.map((c, i) => ({
    norm: normalizeForMatch(c.text),
    source_file: c.source_file,
    page: c.page ?? null,
    id: c.id,
    score: hits[i]?.score ?? null,
  }));

  const claimed = Array.isArray(assessment.evidence) ? assessment.evidence : [];
  const verified = [];

  for (const item of claimed) {
    const needle = normalizeForMatch(item.quote);
    // Drop empty or non-substantive quotes: a lone common word/char anchors
    // nothing and must not be allowed to satisfy the >=1-quote requirement.
    if (!isSubstantiveQuote(needle)) continue;

    // A quote must lie within a SINGLE chunk (the prompt forbids spanning two).
    const containing = normChunks.find((c) => c.norm.includes(needle));
    if (!containing) continue; // fabricated / paraphrased / cross-chunk -> drop

    // Real quote. If it was attributed to the wrong file, correct the
    // attribution to the chunk that actually contains it rather than discarding
    // genuine evidence over a labeling slip (this only ever lowers risk).
    const attributionCorrected = containing.source_file !== item.source_file;
    verified.push({
      source_file: containing.source_file,
      quote: item.quote, // keep the model's original (verbatim) text for display
      page: containing.page,
      chunk_id: containing.id,
      score: containing.score,
      verified: true,
      attribution_corrected: attributionCorrected,
    });
  }

  const droppedCount = claimed.length - verified.length;
  assessment.evidence = verified;

  // THE FORCING RULE (brief §6): coverage above "none" with zero verified
  // quotes is downgraded to "none" and flagged. Unit-tested.
  if (assessment.coverage !== 'none' && verified.length === 0) {
    assessment.coverage = 'none';
    assessment.confidence = 0;
    assessment.needs_review = true;
    assessment.verifier_action = 'downgraded_to_none_no_valid_quote';
    assessment.rationale =
      '[Auto-downgraded: the claimed coverage had no verifiable verbatim quote in the retrieved evidence.] ' +
      (assessment.rationale ?? '');
  } else if (droppedCount > 0) {
    // Some quotes survived, some were fabricated -> keep coverage, force review.
    assessment.needs_review = true;
    assessment.verifier_action = `dropped_${droppedCount}_unverifiable_quote${droppedCount === 1 ? '' : 's'}`;
  } else {
    assessment.verifier_action = null;
  }

  assessment.verification = {
    quotes_checked: claimed.length,
    quotes_verified: verified.length,
    downgraded: assessment.verifier_action === 'downgraded_to_none_no_valid_quote',
  };

  // Contract: "none" means the outcome is not demonstrated — it carries no
  // supporting evidence. A model may (reasonably) attach a related quote to a
  // "none" judgment; we drop it from the deliverable to keep "none" unambiguous.
  if (assessment.coverage === 'none') assessment.evidence = [];
  return assessment;
}
