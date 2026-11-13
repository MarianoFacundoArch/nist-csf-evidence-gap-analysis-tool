/**
 * Loads published TRANSLATIONS of the CSF 2.0 Core text, for report display.
 *
 * The assessment itself always runs on the authoritative English Core
 * (data/csf-core.json): prompts, retrieval, and the machine-readable
 * deliverables never use this module. It exists so a report rendered in another
 * language can show the framework's own published wording for each Function,
 * Category, and Subcategory outcome instead of a translation invented here —
 * the same "never write framework text ourselves" rule the rest of the tool
 * follows. Today that means Spanish, from NIST CSWP 29 spa (see
 * scripts/build-csf-core-es.js and NOTICE).
 *
 * Everything is optional and degrades to English: an unknown language, a
 * missing data file, or an id the translation does not cover (e.g. a custom
 * CSF export) simply yields null, and the caller keeps the English text.
 */

import Ajv from 'ajv';
import { fileURLToPath } from 'node:url';
import { readJsonSafe, fileExists } from '../util/fsx.js';
import { CsfDataError } from '../core/errors.js';

// Resolved from this module, not the working directory: the translation ships
// with the tool and is keyed by id, so it is valid for any CSF core file.
const TRANSLATION_FILES = {
  es: fileURLToPath(new URL('../../data/csf-core.es.json', import.meta.url)),
};

const entry = (extra) => ({
  type: 'array',
  minItems: 1,
  items: {
    type: 'object',
    required: ['id', 'outcome', ...extra],
    properties: {
      id: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      outcome: { type: 'string', minLength: 1 },
    },
  },
});

const translationSchema = {
  type: 'object',
  required: ['language', 'functions', 'categories', 'subcategories'],
  properties: {
    language: { type: 'string', minLength: 2 },
    source: { type: 'string' },
    citation: { type: 'string' },
    functions: entry(['name']),
    categories: entry(['name']),
    subcategories: entry([]),
  },
};

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(translationSchema);

/** Languages for which a published translation of the Core ships with the tool. */
export const TRANSLATED_LANGUAGES = Object.keys(TRANSLATION_FILES);

/**
 * @param {string} language e.g. "es"; "en" (the Core's own language) => null
 * @param {object} [logger]
 * @param {{path?: string}} [opts] explicit data file (tests)
 * @returns {Promise<null | {
 *   language: string, source: string|null, citation: string|null,
 *   functionName: (functionId: string) => string|null,
 *   categoryName: (categoryId: string) => string|null,
 *   outcome: (subcategoryId: string) => string|null
 * }>}
 */
export async function loadCsfText(language, logger, { path } = {}) {
  const file = path ?? TRANSLATION_FILES[language];
  if (!file) return null;

  if (!(await fileExists(file))) {
    logger?.debug?.(`No ${language} translation of the CSF Core found at ${file}; using the English text.`);
    return null;
  }

  let data;
  try {
    data = await readJsonSafe(file);
  } catch (err) {
    throw new CsfDataError(`CSF Core translation is not valid JSON: ${file} (${err.message})`, {
      hint: 'Regenerate it with `node scripts/build-csf-core-es.js`, or delete the file to fall back to English.',
    });
  }
  if (!validate(data)) {
    const first = (validate.errors ?? [])[0];
    throw new CsfDataError(
      `CSF Core translation is malformed: ${file} — ${first ? `${first.instancePath || '(root)'} ${first.message}` : 'schema validation failed'}.`,
      { hint: 'Regenerate it with `node scripts/build-csf-core-es.js`, or delete the file to fall back to English.' },
    );
  }

  const functions = new Map(data.functions.map((f) => [f.id, f.name]));
  const categories = new Map(data.categories.map((c) => [c.id, c.name]));
  const outcomes = new Map(data.subcategories.map((s) => [s.id, s.outcome]));

  return {
    language: data.language,
    source: data.source ?? null,
    citation: data.citation ?? null,
    functionName: (id) => functions.get(id) ?? null,
    categoryName: (id) => categories.get(id) ?? null,
    outcome: (id) => outcomes.get(id) ?? null,
  };
}
