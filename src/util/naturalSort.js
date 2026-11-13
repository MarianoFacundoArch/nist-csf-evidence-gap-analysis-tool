/**
 * Locale-independent natural ordering for identifiers.
 *
 * Control and requirement identifiers mix letters, digits and punctuation
 * ("AC-02", "AC-02(01)", "AC-10", "3.9", "3.10", "03.11.01"). Plain string
 * order puts "AC-10" before "AC-2" and "3.10" before "3.9", which is not how
 * anyone reads a control catalog.
 *
 * WHY not `localeCompare(..., { numeric: true })`: its result depends on the
 * ICU data and default locale of the Node build that runs it, and the same
 * comparator orders both the shipped crosswalk data file and the generated
 * deliverables — both must come out byte-identical on every machine. So the
 * comparison is done by hand: split each string into runs of ASCII digits and
 * runs of everything else, compare digit runs by numeric value and other runs
 * by UTF-16 code unit.
 */

const TOKEN = /\d+|\D+/g;
const DIGITS = /^\d/;
const LEADING_ZEROS = /^0+(?=\d)/;

/** Compare two digit runs by value without parsing (no precision limit). */
function compareDigitRuns(a, b) {
  const x = a.replace(LEADING_ZEROS, '');
  const y = b.replace(LEADING_ZEROS, '');
  if (x.length !== y.length) return x.length - y.length;
  return x < y ? -1 : x > y ? 1 : 0;
}

function compareTokens(a, b) {
  const aNum = DIGITS.test(a);
  const bNum = DIGITS.test(b);
  if (aNum && bNum) return compareDigitRuns(a, b);
  // A number sorts before text at the same position ("1A" before "A1").
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Natural comparison for Array.prototype.sort. A total order: strings that are
 * equal token by token but spelled differently ("1.01" and "1.1") fall back to
 * code-unit order, so the result never depends on the input order.
 * @param {string} a
 * @param {string} b
 * @returns {number} negative, zero, or positive
 */
export function naturalCompare(a, b) {
  const left = String(a);
  const right = String(b);
  const ta = left.match(TOKEN) ?? [];
  const tb = right.match(TOKEN) ?? [];
  const shared = Math.min(ta.length, tb.length);
  for (let i = 0; i < shared; i++) {
    const c = compareTokens(ta[i], tb[i]);
    if (c !== 0) return c;
  }
  // A prefix sorts first: "AC-02" before "AC-02(01)".
  if (ta.length !== tb.length) return ta.length - tb.length;
  return left < right ? -1 : left > right ? 1 : 0;
}
