/**
 * Markdown helpers for text the tool did not write.
 *
 * Document file names come from the organization's folders. In a Markdown
 * report a name is data, never markup: `__init__.md` must not turn bold, a
 * name containing "|" must not split a table row, and a name containing "<"
 * must not become HTML in a renderer that allows it. A code span renders its
 * content literally, so names are always emitted through mdCode(). Free text
 * (rationales, notes) keeps its characters but is held to a single line with
 * mdLine(), so it cannot grow list items or headings of its own.
 */

/**
 * Render untrusted text literally, as a Markdown code span. The delimiter is
 * one backtick longer than the longest run inside the text (the CommonMark
 * rule), so no content can close the span early.
 * @param {unknown} text
 * @returns {string}
 */
export function mdCode(text) {
  const s = String(text ?? '').replace(/[\r\n]+/g, ' ');
  if (s === '') return ''; // an empty code span is not valid Markdown
  const longestRun = Math.max(0, ...(s.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longestRun + 1);
  // A span whose content starts or ends with a backtick needs a space of
  // padding; CommonMark strips one such space from each side again.
  const pad = s.startsWith('`') || s.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${s}${pad}${fence}`;
}

/**
 * Collapse free text onto one line. A report line such as "- Rationale: …" is
 * followed by lines the tool vouches for (official NIST text, review state); a
 * line break inside AI- or human-written text would let it continue as a list
 * item or a heading of its own and read as one of those. Text that is already
 * a single line is returned unchanged, character for character.
 * @param {unknown} text
 * @returns {string}
 */
export function mdLine(text) {
  return String(text ?? '').replace(/\s*[\r\n]+\s*/g, ' ');
}

/**
 * Make a string safe to place in a GFM table cell: a literal "|" is escaped
 * (required even inside a code span) and line breaks become spaces.
 * @param {unknown} text
 * @returns {string}
 */
export function mdCell(text) {
  return String(text ?? '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
}
