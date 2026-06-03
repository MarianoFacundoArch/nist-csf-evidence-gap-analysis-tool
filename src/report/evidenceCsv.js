/**
 * Renders the evidence-map CSV: one row per (subcategory, verified quote).
 * Subcategories with no evidence still get a row (empty evidence fields) so
 * gaps are visible when the file is opened in a spreadsheet. The CSV writer
 * (util/csv.js) handles RFC-4180 quoting and CSV-injection safety, which matter
 * because evidence quotes are attacker-influenceable document text.
 */

import { toCsv } from '../util/csv.js';

const HEADER = [
  'subcategory_id',
  'function',
  'category',
  'coverage',
  'confidence',
  'review_status',
  'source_file',
  'page',
  'similarity',
  'quote',
  'quote_verified',
  'rationale',
];

export function renderEvidenceCsv(profile) {
  const rows = [];
  for (const e of profile.subcategories) {
    if (!e.evidence?.length) {
      rows.push([
        e.subcategory_id, e.function, e.category, e.coverage, e.confidence, e.review_status,
        '', '', '', '', '', e.rationale,
      ]);
      continue;
    }
    for (const ev of e.evidence) {
      rows.push([
        e.subcategory_id, e.function, e.category, e.coverage, e.confidence, e.review_status,
        ev.source_file, ev.page ?? '', ev.score ?? '', ev.quote, ev.verified ? 'yes' : 'no', e.rationale,
      ]);
    }
  }
  return toCsv(HEADER, rows);
}
