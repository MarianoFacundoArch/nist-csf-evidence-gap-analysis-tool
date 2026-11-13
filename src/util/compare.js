/**
 * Locale-independent text ordering for generated files.
 *
 * String.prototype.localeCompare() follows the host's default locale, so the
 * same list of names can sort differently on two machines. Deliverables must
 * be byte-identical for identical inputs, so text that comes from outside the
 * tool (document file names) is ordered here without consulting a locale:
 * case-insensitively first — "Access.md" next to "access.md", which is how a
 * person scans a list — then by UTF-16 code unit so the order is total.
 */

/**
 * Comparator for Array.prototype.sort().
 * @param {string} a
 * @param {string} b
 * @returns {number} negative, zero, or positive
 */
export function compareText(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  const xl = x.toLowerCase();
  const yl = y.toLowerCase();
  if (xl !== yl) return xl < yl ? -1 : 1;
  if (x !== y) return x < y ? -1 : 1;
  return 0;
}
