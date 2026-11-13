/**
 * Renders the crosswalk CSV: one row per relationship a selected mapping
 * records — (crosswalk, reference identifier, related CSF element). It is the
 * pivot a consultant filters to answer "which assessed outcomes relate to
 * this control?".
 *
 * Three kinds of row, told apart by `csf_level`, because a mapping relates a
 * reference to one Subcategory, to a whole Category, or to a whole Function:
 *   subcategory  `csf_id` is the Subcategory; the two `subcategory_*` columns
 *                carry that outcome's coverage and review status.
 *   category     `csf_id` is the Category. No coverage: a Category has
 *   function     several outcomes, not one value, and inventing one (or
 *                copying the row onto each Subcategory) would misstate what
 *                the mapping says. Join on `csf_id` to see the outcomes.
 * The coverage columns are named `subcategory_*` on purpose: they describe a
 * CSF outcome, never the reference beside them.
 *
 * `reference` repeats the identifier prefixed with its crosswalk id
 * ("cis-v8.1:3.10"). Spreadsheets silently turn an identifier such as 3.10
 * into the number 3.1 when a CSV is opened by double click; the composite key
 * cannot be read as a number, and it is unique across crosswalks.
 *
 * Rows are ordered by crosswalk (data-file order), then reference identifier
 * (natural order), then Subcategory rows, Category rows and Function rows,
 * each in CSF order — the order the view already holds. Every row repeats who
 * developed the mapping and whether it is a third-party one, so the
 * provenance survives filtering and copy-paste.
 */

import { toCsv } from '../util/csv.js';

const HEADER = [
  'crosswalk_id',
  'framework',
  'reference',
  'reference_id',
  'csf_level',
  'csf_id',
  'function',
  'category',
  'subcategory_coverage',
  'subcategory_review_status',
  'mapping_developer',
  'mapping_release_date',
  'third_party_mapping',
];

/**
 * @param {ReturnType<typeof import('../crosswalk/view.js').buildCrosswalkView>} view
 * @returns {string} RFC-4180 CSV (see util/csv.js)
 */
export function renderCrosswalkCsv(view) {
  const rows = [];
  for (const crosswalk of view.crosswalks) {
    const tail = [crosswalk.developer, crosswalk.releaseDate, crosswalk.thirdParty ? 'yes' : 'no'];
    for (const reference of crosswalk.references) {
      const head = [
        crosswalk.id, crosswalk.framework,
        `${crosswalk.id}:${reference.reference_id}`, reference.reference_id,
      ];
      for (const r of reference.related) {
        rows.push([...head, 'subcategory', r.subcategory_id, r.function, r.category, r.coverage, r.review_status, ...tail]);
      }
      for (const g of reference.groups) {
        rows.push([...head, g.level, g.id, g.function, g.category, '', '', ...tail]);
      }
    }
  }
  return toCsv(HEADER, rows);
}
