/**
 * The report locale: everything a renderer needs to print a deliverable in one
 * language, in one object — the translator, the display forms of the tool's
 * own vocabulary, and the framework's text in that language.
 *
 * WHY one object: a report mixes three kinds of text, each with its own rule,
 * and a renderer should not have to remember which is which.
 *  - The tool's sentences come from the message catalog (`t`).
 *  - The tool's VALUES (coverage levels, review states, priorities, plan
 *    statuses) are translated for display only. The data keeps the English
 *    values — they are what the machine-readable files and the CLI use — so
 *    every lookup here maps a value to a label and returns an unknown value
 *    unchanged.
 *  - The framework's text (Function names, Category names, outcomes) is never
 *    translated here. It is read from the published translation of the Core
 *    (src/csf/localized.js), and each identifier that translation lacks keeps
 *    its English text. Implementation Examples are published in English only
 *    and are passed through untouched everywhere.
 *
 * A fourth kind is text other modules put into the assessment DATA as English
 * sentences: the profile disclaimer, the reasons an analysis is out of date,
 * the rationale of an outcome that was never assessed, the note the verifier
 * puts in front of a rationale it downgraded. `fixed()` recognizes those
 * sentences, character for character, and shows the catalog's wording for
 * them; anything it does not recognize — a model's own words, a person's
 * note — is shown as it is.
 *
 * A translation is shown only for the text it translates. The published
 * translation is keyed by identifier, but a CSF core file is the user's to
 * tailor: an outcome may keep the identifier "GV.OC-01" and say something
 * else. Showing NIST's Spanish sentence for it would put words in the report
 * that were never assessed. So when the locale knows the official English text
 * (`reference`, the Core the translation was made from), an element is shown
 * in translation only if its own English text is exactly that text; otherwise
 * it keeps the text it was assessed with, and the report's note counts it.
 *
 * ENGLISH — the locale a renderer uses when it is given none — is the identity
 * for every data-driven method: values, names and sentences come back exactly
 * as they went in. That is what keeps English output byte-identical to what
 * the renderers printed before they had a catalog.
 */

import { createTranslator, DEFAULT_LANGUAGE } from './index.js';
import en from './en.js';
import { loadCsfText } from '../csf/localized.js';
import { loadCsfCore } from '../csf/loader.js';
import { bundledPath } from '../core/bundled.js';
import { DEFAULT_CSF_CORE_PATH } from '../core/defaults.js';

// Data value -> catalog key of its display form. Literal on purpose: every
// key the code uses appears in the source, where a test can find it.
const COVERAGE = {
  none: 'coverage.none',
  partial: 'coverage.partial',
  substantial: 'coverage.substantial',
  full: 'coverage.full',
};
const REVIEW_STATUS = {
  reviewed: 'review.reviewed',
  unreviewed: 'review.unreviewed',
  stale: 'review.stale',
};
const PRIORITY = {
  high: 'priority.high',
  medium: 'priority.medium',
  low: 'priority.low',
};
const PLAN_STATUS = {
  open: 'planStatus.open',
  'in-progress': 'planStatus.inProgress',
  done: 'planStatus.done',
  'risk-accepted': 'planStatus.riskAccepted',
};
const PRIORITY_HEADING = {
  high: 'common.priorityHeading.high',
  medium: 'common.priorityHeading.medium',
  low: 'common.priorityHeading.low',
};
const TIER_NAME = {
  1: 'tier.name.1',
  2: 'tier.name.2',
  3: 'tier.name.3',
  4: 'tier.name.4',
};

// Kind of framework text, as the translation names it -> as the official
// English text (`reference`) names it.
const OFFICIAL = { functionName: 'functionName', categoryName: 'categoryLabel', outcome: 'outcome' };

// English sentence, as another module writes it into the data -> its key.
const FIXED_KEYS = new Map(
  Object.keys(en)
    .filter((key) => key.startsWith('fixed.'))
    .map((key) => [en[key], key]),
);
// The same for a sentence that is put in front of other text: [English, key].
const FIXED_PREFIXES = Object.keys(en)
  .filter((key) => key.startsWith('fixedPrefix.'))
  .map((key) => [en[key], key]);

/**
 * @param {object} [options]
 * @param {string} [options.language] report language; one without a catalog
 *   renders the tool's sentences in English
 * @param {Awaited<ReturnType<typeof loadCsfText>>} [options.csfText] the
 *   published translation of the Core for that language, when there is one
 * @param {{functionName: (id: string) => string|null, categoryLabel: (id: string) => string|null,
 *   outcome: (id: string) => string|null} | null} [options.reference] the
 *   official English text the translation was made from, by identifier. When
 *   given, an element is shown in translation only if its own English text is
 *   exactly that text; when omitted, the translation is applied by identifier.
 * @returns the locale (see the module comment); every method is pure
 */
export function createReportLocale({ language = DEFAULT_LANGUAGE, csfText = null, reference = null } = {}) {
  const t = createTranslator(language);
  const isEnglish = language === DEFAULT_LANGUAGE;

  // Value -> label; a value the tool does not know is shown as it is.
  const display = (keys) => (value) => (Object.hasOwn(keys, value) ? t(keys[value]) : value);
  const fixed = (text) => {
    if (isEnglish || typeof text !== 'string') return text;
    if (FIXED_KEYS.has(text)) return t(FIXED_KEYS.get(text));
    // A known leading sentence is reworded; what follows it is left as written.
    const lead = FIXED_PREFIXES.find(([prefix]) => text.startsWith(prefix));
    return lead ? `${t(lead[1])}${text.slice(lead[0].length)}` : text;
  };

  const functionIdOf = (entry) => entry?.function_id ?? String(entry?.subcategory_id ?? '').split('.')[0];
  const categoryIdOf = (entry) => String(entry?.subcategory_id ?? '').split('-')[0];
  // The shipped Core labels a Category "Name (ID)"; a translated name gets the
  // same form, so an identifier is always there to look up.
  const named = (name, id, fallback) => (name ? `${name} (${id})` : fallback);

  // The translation of one element — or null, which every caller turns into
  // the element's own text: no translation loaded, an identifier it lacks, or
  // an element whose English text is not the text that was translated.
  const translated = (kind, id, english) => {
    if (!csfText) return null;
    if (reference && reference[OFFICIAL[kind]](id) !== english) return null;
    return csfText[kind](id);
  };
  const outcomeOf = (entry) => translated('outcome', entry?.subcategory_id, entry?.outcome);

  // Strictly a Tier NUMBER, as src/target/tiers.js requires: "2" is not one.
  const isTier = (tier) => typeof tier === 'number' && Object.hasOwn(TIER_NAME, tier);
  const tierLabel = (tier) => (isTier(tier) ? t('tier.label', { tier, name: t(TIER_NAME[tier]) }) : t('tier.notRecorded'));

  return Object.freeze({
    language,
    isEnglish,
    t,
    csfText,

    /* ------------------------- the tool's vocabulary ------------------------ */
    coverage: display(COVERAGE),
    reviewStatus: display(REVIEW_STATUS),
    priority: display(PRIORITY),
    planStatus: display(PLAN_STATUS),
    /** "High priority (3)" — the section heading of a priority level. */
    priorityHeading: (level, count) => t(PRIORITY_HEADING[level], { count }),
    /** A message with `.one` / `.other` forms, chosen by `count` (also passed as {count}). */
    plural: (key, count, params = {}) => t(`${key}.${count === 1 ? 'one' : 'other'}`, { count, ...params }),
    fixed,
    /** "policy.pdf, p.3" — a quote's source file and, when known, its page. */
    where: (file, page) => (page ? `${file}, ${t('common.page', { page })}` : `${file}`),

    /* --------------------------- the framework's text ----------------------- */
    /**
     * Function names of a set of profile or target entries, as a lookup from
     * the English name the entries are grouped and ordered by.
     * @param {Array<{function: string, function_id?: string, subcategory_id?: string}>} entries
     * @returns {(name: string) => string}
     */
    functionNames(entries) {
      if (!csfText) return (name) => name;
      // A name stands for one Function only when every entry under it carries
      // the same identifier; a name shared by two identifiers is left as it is.
      const ids = new Map();
      for (const entry of Array.isArray(entries) ? entries : []) {
        const id = functionIdOf(entry);
        ids.set(entry?.function, ids.has(entry?.function) && ids.get(entry?.function) !== id ? null : id);
      }
      return (name) => (ids.get(name) ? (translated('functionName', ids.get(name), name) ?? name) : name);
    },
    /** The Category label of an entry: "Name (GV.OC)". */
    categoryLabel: (entry) =>
      named(translated('categoryName', categoryIdOf(entry), entry.category), categoryIdOf(entry), entry.category),
    /** The outcome statement of an entry. */
    outcome: (entry) => outcomeOf(entry) ?? entry.outcome,
    /** The name of a crosswalk view group — a whole Category or Function: "Name (ID)". */
    groupName(group) {
      const name =
        group.level === 'category'
          ? translated('categoryName', group.id, group.category)
          : translated('functionName', group.id, group.function);
      return named(name, group.id, group.name);
    },

    /* --------------------------------- CSF Tiers ---------------------------- */
    /** "Tier 2 (Risk Informed)", or "not recorded" — in English, exactly tierLabel() of src/target/tiers.js. */
    tierLabel,
    /**
     * One sentence for a recorded Tier selection (a resolveTiers() result) —
     * in English, exactly tierSentence() of src/target/tiers.js.
     */
    tierSentence: (resolved) =>
      t('tier.sentence', {
        current: tierLabel(resolved.current?.tier),
        target: tierLabel(resolved.target?.tier),
        basis: fixed(resolved.basis),
        definitions: fixed(resolved.definitions),
      }),

    /* ----------------------- notes of a translated report ------------------- */
    /**
     * Where the framework text of a translated report comes from, or null for
     * an English report (which shows the framework's own text and needs no
     * note). It says what is true of THIS report: which translation was used,
     * how many outcomes it was not used for, or that none was available.
     * @param {Array<{subcategory_id: string, outcome: string}>} entries the profile's entries
     * @returns {{label: string, text: string} | null}
     */
    frameworkNote(entries) {
      if (isEnglish) return null;
      const label = t('note.frameworkText.label');
      if (!csfText) return { label, text: t('note.frameworkText.unavailable') };
      const list = Array.isArray(entries) ? entries : [];
      const missing = list.filter((entry) => outcomeOf(entry) == null).length;
      const partial = missing > 0 ? ` ${t('note.frameworkText.partial', { missing, total: list.length })}` : '';
      return { label, text: `${t('note.frameworkText')}${partial}` };
    },
    /** One line saying the Implementation Examples are in English, or null for an English report. */
    examplesNote: () => (isEnglish ? null : t('note.examplesEnglish')),
  });
}

/** The locale of a renderer that is given none: English, unchanged. */
export const ENGLISH = createReportLocale();

/**
 * The locale a renderer was handed, or English when it was handed none — or
 * something that is not a locale. Renderers took no such argument before, so
 * a stray value in its place must not be able to break a report.
 * @param {unknown} value
 * @returns {ReturnType<typeof createReportLocale>}
 */
export function asLocale(value) {
  return value && typeof value.t === 'function' && typeof value.fixed === 'function' ? value : ENGLISH;
}

/**
 * The framework-text note of a translated report as a Markdown block quote
 * (two lines, the second empty), or nothing for an English report.
 * @param {ReturnType<typeof createReportLocale>} locale
 * @param {Array<{subcategory_id: string, outcome: string}>} entries the profile's entries
 * @returns {string[]}
 */
export function frameworkNoteLines(locale, entries) {
  const note = locale.frameworkNote(entries);
  return note ? [`> **${note.label}.** ${note.text}`, ''] : [];
}

/**
 * The official English text of the Core that ships with the tool — the text
 * the published translations were made from — by identifier. Read from the
 * installed package, never from the working directory: it is the reference a
 * user's own Core file is compared with.
 * @param {string} path the shipped Core data file
 */
async function loadReferenceText(path) {
  const core = await loadCsfCore(path, null);
  const functions = new Map(core.functions.map((fn) => [fn.id, fn.name]));
  const categories = new Map(core.subcategories.map((sub) => [sub.categoryId, sub.category]));
  const outcomes = new Map(core.subcategories.map((sub) => [sub.id, sub.outcome]));
  return {
    functionName: (id) => functions.get(id) ?? null,
    categoryLabel: (id) => categories.get(id) ?? null,
    outcome: (id) => outcomes.get(id) ?? null,
  };
}

/**
 * The locale for `report.language`, with the published translation of the Core
 * loaded when the tool ships one, together with the official English text it
 * translates. English needs nothing loaded. A language without a translation
 * of the Core still renders: the tool's sentences are translated, the
 * framework text stays as it is, and both the log and the report say so.
 * @param {string} [language]
 * @param {object} [logger]
 * @param {{referencePath?: string}} [opts] the Core file to take the official
 *   English text from (tests); the one shipped with the tool by default
 * @returns {Promise<ReturnType<typeof createReportLocale>>}
 */
export async function loadReportLocale(language, logger, { referencePath = bundledPath(DEFAULT_CSF_CORE_PATH) } = {}) {
  if (!language || language === DEFAULT_LANGUAGE) return ENGLISH;
  const shownInEnglish = 'Function names, Category names and outcomes are shown in English.';
  let csfText = await loadCsfText(language, logger);
  let reference = null;
  if (!csfText) {
    logger?.warn?.(
      `No published translation of the CSF Core is available for report language "${language}": ${shownInEnglish}`,
    );
  } else {
    try {
      reference = await loadReferenceText(referencePath);
    } catch (err) {
      // Without the official English text there is no telling which elements
      // the translation applies to, so it is not applied at all.
      logger?.warn?.(
        `The CSF Core shipped with the tool could not be read, so its published translation is not used ` +
          `(${err.message}): ${shownInEnglish}`,
      );
      csfText = null;
    }
  }
  return createReportLocale({ language, csfText, reference });
}
