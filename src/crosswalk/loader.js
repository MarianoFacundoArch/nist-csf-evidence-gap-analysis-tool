/**
 * Loads and validates the crosswalk data file (informative references from
 * CSF 2.0 Subcategories to identifiers in other frameworks).
 *
 * Crosswalks are OPTIONAL, unlike the CSF core: every other deliverable is
 * complete without them. So a missing file is not an error — the loader
 * returns null and the caller skips the crosswalk deliverables. A file that
 * exists but is malformed is different: silently ignoring it would drop
 * deliverables the user asked for, or worse, render half-valid data. That
 * case stops with a typed CrosswalkDataError and a hint, never a stack trace.
 */

import Ajv from 'ajv';
import { crosswalkSchema, isNistHostedUrl, RESERVED_CROSSWALK_IDS } from './crosswalk.schema.js';
import { readJsonSafe, fileExists } from '../util/fsx.js';
import { CrosswalkDataError } from '../core/errors.js';
import { resolveDataPath } from '../core/bundled.js';
import { DEFAULT_CROSSWALK_PATH } from '../core/defaults.js';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(crosswalkSchema);

const HINT =
  'Restore data/csf-crosswalks.json from the repository or regenerate it with `npm run build-crosswalks`. ' +
  'To produce reports without crosswalks, pass `--crosswalk none`.';

// Plain-language replacements for the schema's pattern failures, keyed by the
// last segment of the failing path (a raw regular expression explains nothing).
const PATTERN_HELP = {
  id: 'must be a lowercase id made of letters, digits, "." and "-"',
  retrievedAt: 'must be a YYYY-MM-DD date',
  releaseDate: 'must be a YYYY-MM-DD date',
};
// Reference identifiers and Subcategory keys: trimmed and single-spaced.
const IDENTIFIER_HELP =
  'must be a single-line identifier with no leading, trailing or repeated spaces and no invisible characters';
// Labels (framework, developer, ...): trimmed; inner spacing is free.
const LABEL_HELP = 'must be one line of text with no leading or trailing space and no invisible characters';

function explain(error) {
  const where = error.instancePath || '(root)';
  if (error.keyword === 'additionalProperties') {
    return `${where} has an unexpected field "${error.params.additionalProperty}" (the file holds identifiers and provenance only)`;
  }
  if (error.propertyName !== undefined) {
    return `${where} has an invalid key ${JSON.stringify(error.propertyName)}`;
  }
  if (error.keyword === 'not') {
    return `${where} is a reserved word (${RESERVED_CROSSWALK_IDS.map((w) => `"${w}"`).join(', ')} cannot be crosswalk ids)`;
  }
  if (error.keyword === 'pattern') {
    if (/[mM]appings\//.test(where)) return `${where} ${IDENTIFIER_HELP}`;
    const field = where.split('/').pop();
    return `${where} ${Object.hasOwn(PATTERN_HELP, field) ? PATTERN_HELP[field] : LABEL_HELP}`;
  }
  return `${where} ${error.message}`;
}

/**
 * Validate an already-parsed crosswalk data object. Throws CrosswalkDataError
 * on a schema violation, a link that NIST does not host, or a duplicated
 * crosswalk id; returns the data without its `_comment`.
 * @param {unknown} data
 * @param {string} [sourceLabel] how to name the source in the error message
 * @returns {{frameworkVersion:string, source:string, retrievedAt:string,
 *   catalogUrl:string,
 *   crosswalks:Array<{id:string, framework:string, olirName:string,
 *     olirVersion:string, developer:string, releaseDate:string,
 *     sourceUrl:string|null, thirdParty:boolean,
 *     functionMappings?:Record<string,string[]>,
 *     categoryMappings?:Record<string,string[]>,
 *     mappings:Record<string,string[]>}>}}
 */
export function validateCrosswalkData(data, sourceLabel = 'crosswalk data') {
  if (!validate(data)) {
    const first = (validate.errors ?? [])[0];
    throw new CrosswalkDataError(
      `The ${sourceLabel} is malformed — ${first ? explain(first) : 'schema validation failed'}.`,
      { hint: HINT },
    );
  }

  // Links: only documents NIST itself hosts (see crosswalk.schema.js).
  const badLink = (where) =>
    new CrosswalkDataError(`The ${sourceLabel} is malformed — ${where} must be a link to a page hosted on nist.gov.`, {
      hint: HINT,
    });
  if (!isNistHostedUrl(data.catalogUrl)) throw badLink('/catalogUrl');
  data.crosswalks.forEach((crosswalk, i) => {
    if (crosswalk.sourceUrl !== null && !isNistHostedUrl(crosswalk.sourceUrl)) {
      throw badLink(`/crosswalks/${i}/sourceUrl (when not null)`);
    }
  });

  // Ids select crosswalks in config and on the command line; they must be unique.
  const seen = new Set();
  for (const crosswalk of data.crosswalks) {
    if (seen.has(crosswalk.id)) {
      throw new CrosswalkDataError(`The ${sourceLabel} lists the crosswalk id "${crosswalk.id}" more than once.`, {
        hint: HINT,
      });
    }
    seen.add(crosswalk.id);
  }

  return {
    frameworkVersion: data.frameworkVersion,
    source: data.source,
    retrievedAt: data.retrievedAt,
    catalogUrl: data.catalogUrl,
    crosswalks: data.crosswalks,
  };
}

/**
 * Load the crosswalk data file.
 * @param {string} configuredPath the path from the configuration
 * @param {{debug?:Function}} [logger]
 * @returns {Promise<ReturnType<typeof validateCrosswalkData>|null>} the
 *   validated data, or null when the file does not exist
 */
export async function loadCrosswalks(configuredPath, logger) {
  if (typeof configuredPath !== 'string' || configuredPath.length === 0) return null;
  // The built-in default names a file shipped with the tool; find it even when
  // the tool is run from another directory. A user's own file always wins.
  const path = await resolveDataPath(configuredPath, DEFAULT_CROSSWALK_PATH);
  if (!(await fileExists(path))) return null;

  let data;
  try {
    data = await readJsonSafe(path);
  } catch (err) {
    throw new CrosswalkDataError(`Crosswalk data file is not valid JSON: ${path} (${err.message})`, { hint: HINT });
  }

  const crosswalks = validateCrosswalkData(data, `crosswalk data file (${path})`);
  logger?.debug?.(
    `Loaded ${crosswalks.crosswalks.length} crosswalk(s) from ${path} (retrieved ${crosswalks.retrievedAt}).`,
  );
  return crosswalks;
}
