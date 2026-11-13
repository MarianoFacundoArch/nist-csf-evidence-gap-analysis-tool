/**
 * The translator: message catalogs in, `t(key, params)` out.
 *
 * WHY so small: the deliverables need wording in more than one language, not a
 * localization framework. Each language is one flat catalog (en.js, es.js) of
 * `key -> text`, a value is filled in by naming it in braces (`{count}`), and
 * that is all — no dependency, no ICU MessageFormat, no plural rules. Where a
 * noun must agree in number the catalogs carry two keys, `.one` and `.other`,
 * and the caller picks (see locale.js); wording that needs no agreement is
 * preferred.
 *
 * Two failure modes are kept apart on purpose:
 *  - a key a language has not translated falls back to English, silently. A
 *    report with one English sentence is still a correct report.
 *  - a key that exists in NO catalog, or a placeholder the caller did not
 *    supply, is a programming error and throws. It can only be reached by a
 *    renderer bug, the tests render every sentence, and a deliverable with a
 *    raw key or an unfilled `{count}` in it must never be written.
 *
 * Nothing here formats numbers or dates: generated files carry no
 * locale-dependent formatting, in any language.
 */

import en from './en.js';
import es from './es.js';

import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './languages.js';

export { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES };

// One catalog per language of languages.js.
const CATALOGS = { en, es };

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/**
 * The catalog of one language, or null when the tool ships none for it.
 * @param {string} language
 * @returns {Readonly<Record<string, string>>|null}
 */
export function messageCatalog(language) {
  return Object.hasOwn(CATALOGS, language) ? CATALOGS[language] : null;
}

/** The `{placeholders}` a message text names, in order of appearance. */
export function placeholdersOf(text) {
  return [...String(text).matchAll(PLACEHOLDER)].map((match) => match[1]);
}

/**
 * @param {string} [language] a language code; one without a catalog renders in English
 * @returns {((key: string, params?: Record<string, unknown>) => string) & {
 *   language: string,
 *   template: (key: string) => string,
 * }} `t(key, params)` returns the text of `key` with every `{name}` replaced
 *   by `params.name`; `t.template(key)` returns the text unfilled.
 */
export function createTranslator(language = DEFAULT_LANGUAGE) {
  const own = messageCatalog(language) ?? en;

  const template = (key) => {
    if (Object.hasOwn(own, key)) return own[key];
    if (Object.hasOwn(en, key)) return en[key];
    throw new Error(`Unknown message key "${key}": it is not in src/i18n/en.js.`);
  };

  const t = (key, params = {}) =>
    // A replacer function, so a value containing "$&" or "{x}" is inserted as
    // it is: values are document text and are never interpreted.
    template(key).replace(PLACEHOLDER, (_match, name) => {
      // Only a name the caller did not pass at all is an error. A value that
      // is present but undefined or null is missing DATA, and prints the way a
      // template literal prints it — the renderers behaved so before they had
      // a catalog, and a sparse profile must not start failing now.
      if (!Object.hasOwn(params, name)) throw new Error(`Message "${key}" needs a value for {${name}}.`);
      return String(params[name]);
    });

  t.language = language;
  t.template = template;
  return t;
}
