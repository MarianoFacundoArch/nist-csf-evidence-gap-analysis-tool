/**
 * Chooses which crosswalks a report includes.
 *
 * The selection lives in `config.report.crosswalks` (also set by
 * `--crosswalk`):
 *   null            the default set — every crosswalk in the data file that
 *                   is not a third-party mapping
 *   [id, id, ...]   exactly those crosswalks
 *   [..., "all"]    every crosswalk in the data file, third-party included
 *   []              none
 *
 * WHY third-party mappings are opt-in: by default the deliverables carry only
 * mappings developed by NIST or by the body that publishes the mapped
 * framework. A mapping developed by anyone else is available, but it is
 * reproduced as published — including entries that are non-specific or appear
 * erroneous — so it has to be chosen deliberately, by naming it (or by "all").
 * "default" may be named in a list too, so that "the default set plus this
 * third-party mapping" does not mean typing every id.
 *
 * Whatever the order of the request, the result follows the data file's order,
 * so the same selection always renders the same deliverables. An id that
 * matches nothing is most likely a typo. It is reported once, together with
 * the ids that do exist, and then ignored — a misspelled id must not abort a
 * report whose other deliverables are unaffected.
 */

import { loadCrosswalks } from './loader.js';

/** Words accepted in a selection in place of a crosswalk id. */
export const SELECT_ALL = 'all';
export const SELECT_DEFAULT = 'default';

/**
 * True for a crosswalk that reports include without being asked for: one that
 * is not a third-party mapping.
 * @param {{thirdParty:boolean}} crosswalk
 */
export function isDefaultCrosswalk(crosswalk) {
  return crosswalk.thirdParty !== true;
}

/**
 * Apply a selection to loaded crosswalk data.
 * @param {{crosswalks:Array<{id:string, thirdParty:boolean}>}|null} data
 *   validated crosswalk data, or null when no data file is available
 * @param {string[]|null|undefined} selection `config.report.crosswalks`
 * @param {{warn?:Function}} [logger]
 * @returns {object|null} the same data limited to the selected crosswalks (in
 *   data-file order), or null when nothing is selected or available
 */
export function selectCrosswalks(data, selection, logger) {
  if (!data) return null;

  let chosen;
  if (!Array.isArray(selection)) {
    chosen = data.crosswalks.filter(isDefaultCrosswalk);
  } else {
    // Ids are lowercase by schema, so a differently cased request still matches.
    const requested = new Map();
    for (const raw of selection) {
      const typed = String(raw).trim();
      if (typed) requested.set(typed.toLowerCase(), typed);
    }
    const everything = requested.delete(SELECT_ALL);
    const defaults = requested.delete(SELECT_DEFAULT);
    const known = data.crosswalks.map((c) => c.id);
    const unknown = [...requested].filter(([id]) => !known.includes(id)).map(([, typed]) => typed);
    if (unknown.length > 0) {
      logger?.warn?.(
        `Unknown crosswalk id(s) ignored: ${unknown.join(', ')}. ` +
          `Known ids: ${known.length ? known.join(', ') : '(none)'} (or "${SELECT_DEFAULT}", "${SELECT_ALL}").`,
      );
    }
    chosen = data.crosswalks.filter(
      (c) => everything || (defaults && isDefaultCrosswalk(c)) || requested.has(c.id),
    );
  }

  return chosen.length > 0 ? { ...data, crosswalks: chosen } : null;
}

/**
 * Load the crosswalk data file named by the config and apply the configured
 * selection — the one call the report stage needs. Returns null (and the
 * crosswalk deliverables are skipped) when the selection is empty or the data
 * file does not exist; a malformed file throws CrosswalkDataError.
 * @param {{crosswalkPath?:string, report?:{crosswalks?:string[]|null}}} config
 * @param {{warn?:Function, debug?:Function}} [logger]
 * @returns {Promise<object|null>}
 */
export async function loadSelectedCrosswalks(config, logger) {
  const selection = config?.report?.crosswalks ?? null;
  // Explicitly "none": do not read the file at all, so a broken or absent data
  // file can never get in the way of a report that does not want crosswalks.
  if (Array.isArray(selection) && selection.length === 0) return null;

  const data = await loadCrosswalks(config?.crosswalkPath, logger);
  if (!data) {
    logger?.warn?.(
      `Crosswalk data file not found: ${config?.crosswalkPath ?? '(no path configured)'} — ` +
        'the crosswalk deliverables are skipped. Set "crosswalkPath" in your config, or pass ' +
        '`--crosswalk none` to silence this message.',
    );
    return null;
  }
  return selectCrosswalks(data, selection, logger);
}
