/**
 * The one instruction a report language other than English adds to a prompt.
 *
 * Reports can be rendered in another language (`report.language`), and the only
 * free text in them that the tool does not write itself is what the model
 * writes: the `rationale` of an assessment and the `answer` of `ask`. So that a
 * translated report does not read half in English, the model is asked to write
 * that ONE value in the report's language.
 *
 * It is deliberately a suffix, and deliberately small:
 *  - for English it is the empty string, so an English prompt is byte-for-byte
 *    the prompt the published evaluation (eval/) was measured with;
 *  - everything the safeguards depend on is restated as unchanged: the JSON
 *    shape, the coverage vocabulary, and above all the quotes, which stay
 *    verbatim in the language of the evidence. A translated quote would not
 *    match the documents and the verifier would (rightly) drop it;
 *  - it is its own delimited section, like the sections of the prompt it
 *    follows, so it is easy to find in a logged request.
 *
 * The prompts themselves stay in English in every report language: only the
 * language of one output value is requested. Whether a given model follows the
 * request is up to the model; nothing downstream depends on it.
 */

// Report language -> how the instruction names it. A language without an
// entry adds no instruction (the model answers as it does for English).
const LANGUAGE_NAMES = {
  es: 'Spanish (español)',
};

const HEADING = '\n\n=== RESPONSE LANGUAGE ===\n';

/** How the instruction names a report language, or null when it has no name for it. */
function languageName(language) {
  return Object.hasOwn(LANGUAGE_NAMES, language ?? '') ? LANGUAGE_NAMES[language] : null;
}

/**
 * Suffix for the assessment prompts (first pass and critique): the rationale
 * in the report language; coverage levels and quotes untouched.
 * @param {string|undefined} language report language (`report.language`)
 * @returns {string} the text to append to the user message; '' for English or
 *   a language the tool has no name for
 */
export function rationaleLanguageSuffix(language) {
  const name = languageName(language);
  if (!name) return '';
  return (
    HEADING +
    `Write the "rationale" value in ${name}. This applies to that one value only: the JSON keys and\n` +
    'every other value keep exactly the form specified above, and "coverage" stays one of the four English\n' +
    'words listed. Every quote stays VERBATIM, in the language of the evidence it was copied from — never\n' +
    'translate, summarize, or otherwise alter a quote.'
  );
}

/**
 * Suffix for the `ask` prompt: the answer in the report language; quotes untouched.
 * @param {string|undefined} language report language (`report.language`)
 * @returns {string} the text to append to the user message; '' for English or
 *   a language the tool has no name for
 */
export function answerLanguageSuffix(language) {
  const name = languageName(language);
  if (!name) return '';
  return (
    HEADING +
    `Write the "answer" value in ${name}. This applies to that one value only: the JSON keys and\n` +
    'every other value keep exactly the form specified above. Every quote stays VERBATIM, in the language of\n' +
    'the evidence it was copied from — never translate, summarize, or otherwise alter a quote.'
  );
}
