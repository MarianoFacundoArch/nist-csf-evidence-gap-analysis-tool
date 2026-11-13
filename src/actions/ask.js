/**
 * ASK action: answer one question from the ingested documents.
 *
 * The assessment pipeline is run once per assessment; this makes the same
 * ingested evidence useful day to day ("do we have an incident response plan?",
 * "is MFA required for remote access?") under the same rule as everything else
 * the tool produces: an answer is shown only when it stands on quotes verified
 * verbatim in the documents, and otherwise the tool says it found no evidence.
 * The work happens in engine/ask.js, which reuses the assessment retrieval and
 * the assessment verifier.
 *
 * It is strictly read-only. It loads the index and nothing else: no assessment,
 * review, target or report file is read or written, so a question can never
 * alter an assessment or make a report stale.
 *
 * The answer is this command's product, so it is handed to the UI port's
 * `result()` — stdout in command mode, a note in the interactive menu — while
 * diagnostics go through the logger (stderr), like every other action.
 */

import { loadIndex, assertSameEmbedder } from '../store/vectorStore.js';
import { answerQuestion, UNSUPPORTED_REASONS } from '../engine/ask.js';
import { ConfigError } from '../core/errors.js';

const USAGE_HINT = 'Usage: csf-tool ask "is MFA required for remote access?"';

// Characters that act on a terminal instead of being displayed: C0/C1 control
// codes (escape sequences, backspace, carriage return, ...) and the Unicode
// bidirectional embeddings, overrides and isolates.
const TERMINAL_UNSAFE = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

/** Whitespace-normalize a question; a non-string counts as no question. */
function cleanQuestion(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Put a piece of untrusted text on ONE safe line of the block. Quotes and file
 * names come from the documents and the summary from the model, so none of it
 * may start a new line (and so imitate the tool's own "Verified quotes" lines)
 * or move the cursor, recolor, or reorder what is shown next to "verified".
 * Whitespace runs become a single space and each remaining control character
 * is shown as U+FFFD. Display only: the structured result keeps the original.
 */
function oneLine(text) {
  return String(text).replace(/\s+/g, ' ').trim().replace(TERMINAL_UNSAFE, '\uFFFD');
}

export async function ask(ctx) {
  const { logger, config } = ctx;

  let question = cleanQuestion(config.question);
  // Without a question and without a terminal to ask in, this is a usage error.
  // Checked before anything is loaded so the message is about the real problem.
  if (!question && !ctx.ui?.isInteractive) {
    throw new ConfigError('No question was given.', { hint: USAGE_HINT });
  }

  // Load the index before prompting: with nothing ingested there is nothing to
  // ask about, and the user should hear that before typing a question.
  const index = await loadIndex(ctx.paths.index);

  if (!question) {
    question = cleanQuestion(
      await ctx.ui.text('Question about the ingested documents', {
        placeholder: 'e.g. Is MFA required for remote access?',
      }),
    );
    if (!question) throw new ConfigError('The question is empty.', { hint: USAGE_HINT });
  }

  const embedder = await ctx.getEmbedder();
  const llm = await ctx.getLlm();

  // Same correctness guard as `analyze`: a question embedded with a different
  // model than the index cannot be compared with its vectors.
  assertSameEmbedder(index, embedder);

  logger.info(`Searching ${index.chunks.length} indexed passage(s) and asking ${llm.id}…`);
  const answer = await answerQuestion({ question, index, embedder, llm, config });

  const result = {
    ...answer,
    passages_searched: answer.retrieved.length,
    passages_indexed: index.chunks.length,
    top_k: config.retrieval.topK,
    providers: { embeddings: embedder.id, llm: llm.id },
  };

  const body = renderAnswer(result);
  if (ctx.ui?.result) ctx.ui.result('Answer', body);
  else logger.info(body);
  return result;
}

/**
 * Render the result as the plain-text block shown to the user. The wording is
 * part of the contract: it says which part is verified (the quotes) and which
 * is not (the summary sentence), and that only the retrieved passages were
 * searched — so "no evidence" is never read as "the documents contain none".
 * @param {object} result the action's structured result
 * @returns {string}
 */
export function renderAnswer(result) {
  const lines = [`Question: ${oneLine(result.question)}`, ''];
  const searched = describeSearch(result);

  if (!result.supported) {
    lines.push(result.answer); // always the tool's own fixed sentence
    const why = describeUnsupported(result);
    if (why) lines.push(why);
    lines.push(searched);
    if (result.passages_searched > 0 && result.passages_searched < result.passages_indexed) {
      lines.push('Only those passages were read, so this means "not found there", not "the documents contain nothing on this".');
    }
    return lines.join('\n');
  }

  lines.push('Answer (AI-generated summary — check it against the quotes below):');
  lines.push(oneLine(result.answer));
  lines.push('');
  lines.push(`Verified quotes (${result.evidence.length}):`);
  result.evidence.forEach((e, i) => {
    const where = `${e.source_file}${e.page ? `, p.${e.page}` : ''}`;
    // One line per quote: line breaks inside a quote are shown as spaces.
    lines.push(`  ${i + 1}. ${oneLine(where)}: "${oneLine(e.quote)}"`);
  });
  lines.push('');

  const { quotes_checked: checked, quotes_verified: verified, quotes_dropped: dropped } = result.verification;
  if (dropped > 0) {
    lines.push(`${verified} of ${checked} quotes returned by the model were verified verbatim against the ingested documents; the rest were removed.`);
  } else if (checked === 1) {
    lines.push('The quote returned by the model was verified verbatim against the ingested documents.');
  } else {
    lines.push(`All ${checked} quotes returned by the model were verified verbatim against the ingested documents.`);
  }
  lines.push('Only the quotes are verified. The summary is the model\'s wording and is not itself verified.');
  lines.push(searched);
  return lines.join('\n');
}

function describeSearch(result) {
  const n = result.passages_searched;
  if (n === 0) return 'The index returned no passages to search.';
  if (n >= result.passages_indexed) return `Searched all ${n} passage${n === 1 ? '' : 's'} of the index.`;
  return `Searched the ${n} most relevant of ${result.passages_indexed} passages of the index (retrieval.topK = ${result.top_k}).`;
}

/** The one extra line that says why there is no answer, when there is more to say. */
function describeUnsupported(result) {
  const checked = result.verification.quotes_checked;
  switch (result.unsupported_reason) {
    case UNSUPPORTED_REASONS.NO_VALID_QUOTE:
      return checked === 0
        ? 'The model proposed an answer without any quote, so the answer was withheld.'
        : `The model proposed an answer, but ${checked === 1 ? 'its quote could not' : `none of its ${checked} quotes could`} be verified verbatim, so the answer was withheld.`;
    case UNSUPPORTED_REASONS.INVALID_OUTPUT:
      return 'The model did not return a usable response, even after one retry, so there was no answer to verify.';
    default:
      return null;
  }
}
