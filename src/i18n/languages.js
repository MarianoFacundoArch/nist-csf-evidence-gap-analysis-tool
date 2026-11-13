/**
 * The report languages, on their own: which exist and which is the default.
 *
 * Kept apart from the message catalogs so that the modules that only need the
 * list — the configuration schema, the engine signature — do not load any
 * message text to get it. A language listed here must have a catalog in
 * index.js; a test holds the two together.
 */

/** The language of the framework, of the assessment, and of every default. */
export const DEFAULT_LANGUAGE = 'en';

/** Languages a report can be rendered in (the values `report.language` accepts). */
export const SUPPORTED_LANGUAGES = Object.freeze(['en', 'es']);
