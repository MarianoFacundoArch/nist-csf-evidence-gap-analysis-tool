/**
 * Interactive UI port, backed by @clack/prompts (lazily imported).
 *
 * This is the ONLY interactive implementation; it is used both by the
 * interactive menu and by any subcommand run in a terminal (e.g. `review`).
 * Keeping a single implementation behind the `ui` interface is what lets the
 * menu and the commands share one code path — the action calls ctx.ui.select(),
 * not @clack directly.
 */

// Columns a note box adds around its text (border, padding on both sides).
const BOX_CHROME = 6;

/**
 * Word-wrap text so every line fits `width` columns. Continuation lines keep
 * the indentation of the line they continue — past a list marker such as
 * "  1. " — so a wrapped numbered quote still reads as one item. Only line
 * breaks are added; no other character of the text changes.
 * @param {string} text
 * @param {number} width
 * @returns {string}
 */
export function wrapForBox(text, width) {
  const max = Math.max(20, Math.trunc(width) || 0);
  const out = [];
  for (const line of String(text).split('\n')) {
    // Capped at half the width, so each pass below always consumes text.
    const hang = ' '.repeat(Math.min(/^\s*(?:\d+\.\s+)?/.exec(line)[0].length, max >> 1));
    let rest = line;
    while (rest.length > max) {
      // Break at the last space that fits; a single over-long word is cut hard.
      let cut = rest.lastIndexOf(' ', max);
      if (cut <= hang.length) cut = max;
      out.push(rest.slice(0, cut).trimEnd());
      rest = hang + rest.slice(cut).trimStart();
    }
    out.push(rest);
  }
  return out.join('\n');
}

export async function createInteractiveUi() {
  const p = await import('@clack/prompts');

  const cancelGuard = (value) => {
    if (p.isCancel(value)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }
    return value;
  };

  return {
    isInteractive: true,
    clack: p,
    info: (m) => p.log.info(m),
    warn: (m) => p.log.warn(m),
    success: (m) => p.log.success(m),
    note: (title, body) => p.note(body, title),
    // A command's product (e.g. the answer from `ask`). Same box as a note, but
    // the lines are wrapped to the terminal first: a result is mostly long
    // quotes, and the box is drawn as wide as its longest line.
    result: (title, body) => p.note(wrapForBox(body, (process.stdout.columns || 80) - BOX_CHROME), title),
    async select(message, options) {
      return cancelGuard(await p.select({ message, options }));
    },
    async confirm(message, initialValue = true) {
      return cancelGuard(await p.confirm({ message, initialValue }));
    },
    async text(message, { placeholder, initial } = {}) {
      // `initial` pre-fills the field so the person can keep, edit or erase it.
      // Passed as a default instead, it would come back whenever the answer is
      // empty — and "leave empty to clear" could never clear anything.
      const r = cancelGuard(await p.text({ message, placeholder, initialValue: initial }));
      return r ?? '';
    },
  };
}
