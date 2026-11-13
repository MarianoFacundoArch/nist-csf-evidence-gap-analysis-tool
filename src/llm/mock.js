/**
 * Deterministic, offline MOCK reasoning LLM.
 *
 * WHY: tests and the committed worked example must run with no network and no
 * API key, yet still exercise the full pipeline (retrieval → judgment →
 * verifier → review → report). This mock produces SCHEMA-VALID JSON whose quotes
 * are copied verbatim from the actual retrieved evidence, and it judges coverage
 * by simple lexical overlap between the subcategory outcome and the evidence.
 * It is NOT a real model and must never be used for a genuine assessment.
 *
 * It also intentionally demonstrates the anti-hallucination safeguard: for ONE
 * designated subcategory (FABRICATE_FOR) it returns a plausible quote that is
 * NOT present in the evidence, so the code-side verifier downgrades that item to
 * "none" and flags it — visible in the worked-example artifacts.
 *
 * For `csf-tool ask` it does the same kind of thing for a question: it returns
 * the retrieved sentence with the most words in common with the question, as a
 * verbatim quote, or reports that nothing matches. That keeps the command
 * usable offline and testable end to end; it is a lexical lookup, not an answer.
 */

// Subcategory for which the mock returns a fabricated (non-verbatim) quote to
// demonstrate the verifier downgrade. GV.OC-01 retrieves the "mission" sentence
// from the sample policy, so the downgrade is observable in the worked example.
const FABRICATE_FOR = 'GV.OC-01';
const FABRICATED_QUOTE =
  'The organization conducts an annual, board-approved review that formally links its mission to specific cybersecurity risk decisions.';

// True stopwords only — do NOT include domain words like "managed"/"maintained"
// here; those carry the signal the lexical matcher relies on.
const STOPWORDS = new Set(
  'the a an and or of to in for is are be by on with that this from as at it its their are'.split(/\s+/),
);
const INTENT = /\b(must|shall|will|should|policy|polic|require|required|expected|responsible|intend)\b/i;
const OPERATIONAL = /\b(maintain|maintained|review|reviewed|perform|performed|log|logged|record|records|monitor|monitored|conduct|conducted|execut|test|tested|track|tracked|inventory|inventories|list|scan|scans|approved|completed|quarterly|annually|monthly|weekly)\b/i;

function keywords(text) {
  return [...new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOPWORDS.has(t)))];
}

function sentences(text) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function judgeFirstPass(sub, hits) {
  const kws = keywords(sub.outcome);
  let best = null;
  for (const h of hits) {
    const text = (h.chunk ?? h).text;
    const lower = text.toLowerCase();
    const matched = kws.filter((k) => lower.includes(k));
    if (!best || matched.length > best.matched.length) best = { hit: h.chunk ?? h, matched, text };
  }

  const ratio = best ? best.matched.length / Math.max(1, kws.length) : 0;

  // No usable evidence -> honest "none". The bar is deliberately conservative
  // (a few shared generic words are not evidence that an outcome is achieved),
  // consistent with the tool's "absence of evidence = none" principle.
  if (!best || best.matched.length < 3 || ratio < 0.25) {
    return {
      subcategory_id: sub.id,
      coverage: 'none',
      confidence: 0.3,
      evidence: [],
      rationale:
        'The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.',
      needs_review: true,
    };
  }

  // Pick the verbatim sentence from the best chunk with the most keyword hits.
  const sents = sentences(best.text);
  let quote = sents[0] ?? best.text;
  let bestSentHits = -1;
  for (const s of sents) {
    const low = s.toLowerCase();
    const hitN = best.matched.filter((k) => low.includes(k)).length;
    if (hitN > bestSentHits) {
      bestSentHits = hitN;
      quote = s;
    }
  }

  const intentOnly = INTENT.test(quote) && !OPERATIONAL.test(quote);
  let coverage;
  if (intentOnly) coverage = 'partial';
  else if (ratio >= 0.7 && OPERATIONAL.test(quote)) coverage = 'full';
  else if (ratio >= 0.45 && OPERATIONAL.test(quote)) coverage = 'substantial';
  else coverage = 'partial';

  const confidence = {
    partial: clamp(0.45 + ratio * 0.2, 0.4, 0.62),
    substantial: clamp(0.6 + ratio * 0.2, 0.6, 0.82),
    full: 0.85,
  }[coverage];

  return {
    subcategory_id: sub.id,
    coverage,
    confidence: Number(confidence.toFixed(2)),
    evidence: [{ source_file: best.hit.source_file, quote }],
    rationale: intentOnly
      ? `The evidence addresses this topic as stated intent/policy rather than demonstrated operation, so coverage is capped at partial. It is grounded in "${best.hit.source_file}". Flagged for human confirmation of operational evidence.`
      : `The evidence in "${best.hit.source_file}" shows the outcome is ${coverage === 'full' ? 'achieved' : 'at least partly achieved'} in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.`,
    needs_review: coverage === 'partial' || confidence < 0.6,
  };
}

// Words that shape a question without being its subject. Removed on the `ask`
// path only, so a question's overlap ratio is measured on what it is about.
// (Shorter ones — "who", "how", "do" — never pass keywords()' length filter.)
const QUESTION_WORDS = new Set(
  'what when where which whom whose does done have there they them your ours about into some ever often many much each every such than then also only'.split(/\s+/),
);

/**
 * `ask` pass: pick the sentence of the retrieved evidence that shares the most
 * key terms with the question and return it as a verbatim quote. The bar is
 * deliberately conservative — at least two key terms and 60% of them in ONE
 * sentence — so a question the documents do not cover comes back unsupported
 * instead of being "answered" with a loosely related passage. Ties resolve to
 * the earlier hit, then the earlier sentence, so the output is deterministic.
 */
function answerByOverlap(question, hits) {
  const kws = keywords(String(question ?? '')).filter((k) => !QUESTION_WORDS.has(k));
  let best = null;
  for (const h of hits) {
    const chunk = h.chunk ?? h;
    for (const sentence of sentences(chunk.text)) {
      const low = sentence.toLowerCase();
      const matched = kws.filter((k) => low.includes(k)).length;
      if (!best || matched > best.matched) best = { chunk, sentence, matched };
    }
  }

  if (!best || best.matched < 2 || best.matched / kws.length < 0.6) {
    return { answer: '', supported: false, evidence: [] };
  }

  // The summary makes no claim about what the passage means: this engine
  // matches words, so it only says where the closest passage is.
  const file = best.chunk.source_file;
  return {
    answer:
      `The passage of "${file}" that shares the most key terms with the question is quoted below. ` +
      'This is the offline mock engine: it matches words and does not interpret them, so read the quote to see what it says.',
    supported: true,
    evidence: [{ source_file: file, quote: best.sentence }],
  };
}

export function createLlm() {
  return {
    id: 'mock',
    isLocal: true,
    async judge({ meta }) {
      const sub = meta?.subcategory;
      const hits = meta?.hits ?? [];

      // Question answering (`csf-tool ask`): no subcategory is involved.
      if (meta?.pass === 'ask') {
        return JSON.stringify(answerByOverlap(meta.question, hits));
      }

      // Critique pass: a skeptical confirm — re-emit the first pass unchanged
      // (its quotes are already verbatim) with a note that it was confirmed.
      if (meta?.pass === 'critique' && meta.firstPass) {
        const fp = meta.firstPass;
        return JSON.stringify({
          subcategory_id: fp.subcategory_id ?? sub?.id,
          coverage: fp.coverage,
          confidence: fp.confidence,
          evidence: fp.evidence ?? [],
          rationale: `Critique: confirmed the first-pass assessment against the same evidence. ${fp.rationale ?? ''}`.trim(),
          needs_review: fp.needs_review,
        });
      }

      // Anti-hallucination demonstration: emit a non-verbatim quote so the
      // verifier downgrades this item to "none".
      if (sub?.id === FABRICATE_FOR && hits.length > 0) {
        return JSON.stringify({
          subcategory_id: sub.id,
          coverage: 'substantial',
          confidence: 0.82,
          evidence: [{ source_file: (hits[0].chunk ?? hits[0]).source_file, quote: FABRICATED_QUOTE }],
          rationale:
            'The organization appears to link its mission to cybersecurity risk decisions through a formal annual review.',
          needs_review: false,
        });
      }

      return JSON.stringify(judgeFirstPass(sub, hits));
    },
  };
}
