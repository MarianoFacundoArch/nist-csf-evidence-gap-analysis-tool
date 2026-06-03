/**
 * Minimal RFC-4180 CSV serializer (no dependency).
 *
 * Two concerns the brief calls out explicitly:
 *  1. Quoting/escaping — document quotes routinely contain commas, double
 *     quotes, and newlines. Any field containing , " CR or LF is wrapped in
 *     double quotes, and embedded double quotes are doubled ("").
 *  2. CSV injection safety — evidence quotes are attacker-influenceable text.
 *     A field beginning with = + - @ (or tab/CR) can be interpreted as a
 *     formula by spreadsheet software. We defuse this by prefixing such a
 *     field with a single quote before CSV-quoting it.
 *
 * Output uses CRLF line endings (RFC-4180) and an optional UTF-8 BOM so Excel
 * renders non-ASCII correctly.
 */

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_LEADERS = /^[=+\-@\t\r]/;

function escapeField(value) {
  let s = value == null ? '' : String(value);
  // CSV-injection guard: neutralize a leading formula character.
  if (FORMULA_LEADERS.test(s)) s = `'${s}`;
  if (NEEDS_QUOTING.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialize rows to a CSV string.
 * @param {string[]} header column names
 * @param {Array<Array<unknown>>} rows row values aligned to `header`
 * @param {{bom?: boolean}} [opts]
 */
export function toCsv(header, rows, { bom = true } = {}) {
  const lines = [header, ...rows].map((row) => row.map(escapeField).join(','));
  const body = lines.join('\r\n') + '\r\n';
  return bom ? '﻿' + body : body;
}
