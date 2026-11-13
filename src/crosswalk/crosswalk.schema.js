/**
 * JSON Schema for the crosswalk data file (data/csf-crosswalks.json): the
 * informative-reference mappings from CSF 2.0 to identifiers in other
 * frameworks, as published through NIST's OLIR program.
 *
 * The schema is deliberately CLOSED (additionalProperties: false at every
 * level). The file's one licensing-relevant rule is "identifiers only" — never
 * a referenced framework's control text or titles, several of which are
 * copyrighted by their publishers. A closed schema enforces that structurally:
 * a file carrying a `title` or `text` field is rejected at load time instead
 * of being passed along into a deliverable.
 *
 * Display strings (labels, developer names) and reference identifiers must be
 * single-line, trimmed, and free of control or other invisible characters,
 * because they are written into Markdown tables, CSV cells and terminal
 * output. Reference identifiers must also be single-spaced, so two entries
 * that differ only in leading, trailing or repeated spaces cannot coexist in
 * a file that validates. (Other spelling differences — "4.2(a)" and "4.2 (a)"
 * — are the mapping developer's and are not this schema's to judge.)
 *
 * Links are limited to documents NIST itself hosts (see isNistHostedUrl): the
 * data must not carry links to third-party pages, which can move or change
 * and which this project has no business pointing users at. That rule needs a
 * parsed URL, not a pattern, so the loader applies it after schema validation.
 */

/** Longest reference identifier accepted. Identifiers are short; text is not. */
export const REFERENCE_ID_MAX_LENGTH = 64;

/**
 * Words a crosswalk may not use as its id: they already mean something where
 * ids are typed ("all" and "default" in a selection, "none" on --crosswalk).
 */
export const RESERVED_CROSSWALK_IDS = ['all', 'default', 'none'];

const DATE = '^\\d{4}-\\d{2}-\\d{2}$';
// Characters with no visible form: controls (tab, newline, ...) and format
// characters (zero-width space, soft hyphen, ...). Two identifiers that differ
// only by one of these would look identical in every deliverable.
const INVISIBLE = '\\p{Cc}\\p{Cf}\\u2028\\u2029';
// One line, no whitespace at either end, nothing invisible.
const SINGLE_LINE = `^[^\\s${INVISIBLE}](?:[^${INVISIBLE}]*[^\\s${INVISIBLE}])?$`;
// One or more runs of visible characters separated by exactly one space.
const REFERENCE_ID = `^[^\\s${INVISIBLE}]+(?: [^\\s${INVISIBLE}]+)*$`;

const label = { type: 'string', pattern: SINGLE_LINE, maxLength: 300 };

// CSF element id -> reference identifiers. An element the mapping does not
// cover is absent (never an empty list).
const referenceMap = {
  type: 'object',
  propertyNames: { pattern: REFERENCE_ID, maxLength: 40 },
  additionalProperties: {
    type: 'array',
    minItems: 1,
    uniqueItems: true,
    items: { type: 'string', pattern: REFERENCE_ID, maxLength: REFERENCE_ID_MAX_LENGTH },
  },
};

/**
 * True for an http(s) URL whose host is nist.gov or a subdomain of it — the
 * only links the crosswalk data may carry. The host is taken from the PARSED
 * URL: "https://nist.gov.example.com/x" and "https://example.com/nist.gov"
 * contain the text "nist.gov" but are not hosted by NIST.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNistHostedUrl(value) {
  // No whitespace, angle bracket or quote: the URL is printed inside a
  // Markdown autolink and must not be able to end it.
  if (typeof value !== 'string' || !/^[^\s<>"]+$/.test(value)) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  // "https://nist.gov@example.com/" names example.com; credentials have no
  // place in a citation either way.
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === 'nist.gov' || host.endsWith('.nist.gov');
}

export const crosswalkSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['frameworkVersion', 'source', 'retrievedAt', 'catalogUrl', 'crosswalks'],
  properties: {
    _comment: { type: 'string' },
    frameworkVersion: label,
    // Where the mappings were obtained, and the day they were retrieved.
    source: label,
    retrievedAt: { type: 'string', pattern: DATE },
    // The catalog in which every mapping below and its developer are listed
    // (NIST-hosted; checked by the loader).
    catalogUrl: { type: 'string', maxLength: 500 },
    crosswalks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id', 'framework', 'olirName', 'olirVersion', 'developer',
          'releaseDate', 'sourceUrl', 'thirdParty', 'mappings',
        ],
        properties: {
          // Stable short id used in config (`report.crosswalks`) and --crosswalk.
          id: {
            type: 'string',
            pattern: '^[a-z0-9][a-z0-9.-]*$',
            maxLength: 40,
            not: { enum: RESERVED_CROSSWALK_IDS },
          },
          // Display label of the referenced framework.
          framework: label,
          // The mapping's entry in the catalog: name, version, developer of
          // record, release date.
          olirName: label,
          olirVersion: label,
          developer: label,
          releaseDate: { type: 'string', pattern: DATE },
          // The mapping's own document when NIST hosts it, otherwise null
          // (the catalog entry is then the citation). Checked by the loader.
          sourceUrl: { type: ['string', 'null'], maxLength: 500 },
          // True when the developer of record is neither NIST nor the body that
          // publishes the referenced framework. Shown wherever the mapping is.
          thirdParty: { type: 'boolean' },
          // A mapping records each relationship at the level its developer
          // chose: for a whole CSF Function, a whole Category, or one
          // Subcategory. The three maps keep them apart, as published.
          // `functionMappings` and `categoryMappings` are optional: absent
          // means the same as {} (the mapping records none at that level).
          functionMappings: referenceMap,
          categoryMappings: referenceMap,
          mappings: referenceMap,
        },
      },
    },
  },
};
