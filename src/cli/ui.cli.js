/**
 * Non-interactive UI port.
 *
 * Used when there is no TTY (CI, pipes, the worked-example build script). It
 * routes informational output through the logger and refuses interactive
 * prompts with a clear, actionable message — actions are written to avoid
 * prompting when `ui.isInteractive` is false (e.g. they require --docs and
 * --accept-all instead). The one thing it writes to stdout is a command's
 * result (`result()`), which keeps stdout machine-usable: diagnostics on
 * stderr, the product on stdout.
 */

import { ConfigError } from '../core/errors.js';

export function createNonInteractiveUi(logger) {
  const refuse = (what) => {
    throw new ConfigError(`Interactive input required (${what}) but this session is not interactive.`, {
      hint: 'Run in a terminal, supply the value via a flag (e.g. --docs <path>), or use --accept-all for review.',
    });
  };
  return {
    isInteractive: false,
    info: (m) => logger.info(m),
    warn: (m) => logger.warn(m),
    success: (m) => logger.info(m),
    note: (title, body) => logger.info(`${title}\n${body}`),
    // The PRODUCT of a command (e.g. the answer from `ask`), as opposed to
    // commentary about the run. It is the one thing that goes to stdout, and it
    // is not gated by the log level — so `csf-tool ask "…" > answer.txt` captures
    // exactly the result and `--quiet` silences the diagnostics, not the answer.
    // The title only labels the box in the interactive UI; here the body alone
    // is written, so redirected output is the result block and nothing else.
    result: (_title, body) => {
      process.stdout.write(`${body}\n`);
    },
    async select() {
      refuse('a selection');
    },
    async confirm() {
      return false;
    },
    async text() {
      refuse('text input');
    },
  };
}
