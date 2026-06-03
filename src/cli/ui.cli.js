/**
 * Non-interactive UI port.
 *
 * Used when there is no TTY (CI, pipes, the worked-example build script). It
 * routes informational output through the logger and refuses interactive
 * prompts with a clear, actionable message — actions are written to avoid
 * prompting when `ui.isInteractive` is false (e.g. they require --docs and
 * --accept-all instead).
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
