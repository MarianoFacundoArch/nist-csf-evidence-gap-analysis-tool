/**
 * Command router — the CLI entry point.
 *
 * It parses flags, builds the run context ONCE, chooses a UI port (interactive
 * when attached to a TTY, otherwise non-interactive), and either dispatches to
 * an action (command mode) or starts the interactive menu (no command). Both
 * paths call the same action functions, so there is no duplicated logic.
 *
 * All expected failures are caught here and printed as a single friendly line
 * (full stacks only under --verbose), honoring "never crash; explain".
 */

import { readFileSync } from 'node:fs';
import { parseCliArgs, HELP_TEXT } from './flags.js';
import { buildContext } from '../core/context.js';
import { createNonInteractiveUi } from './ui.cli.js';
import { createInteractiveUi } from './ui.menu.js';
import { startMenu } from './menu.js';
import * as actions from '../actions/index.js';
import { AppError } from '../core/errors.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const COMMANDS = {
  init: actions.init,
  ingest: actions.ingest,
  analyze: actions.analyze,
  review: actions.review,
  report: actions.report,
  all: actions.runAll,
  run: actions.runAll,
};

export async function main(argv = process.argv.slice(2)) {
  const { command, overrides, help, version, error } = parseCliArgs(argv);

  if (version) {
    process.stdout.write(`${pkg.name} ${pkg.version}\n`);
    return;
  }
  if (error) {
    process.stderr.write(`error: ${error}\n\n${HELP_TEXT}`);
    process.exitCode = 2;
    return;
  }
  if (help) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  const ctx = await buildContext(overrides);

  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  ctx.ui = interactive ? await createInteractiveUi() : createNonInteractiveUi(ctx.logger);

  try {
    if (!command) {
      if (!interactive) {
        // No command and no TTY: nothing to interact with — show help.
        process.stdout.write(HELP_TEXT);
        return;
      }
      await startMenu(ctx);
      return;
    }

    const action = COMMANDS[command];
    if (!action) {
      ctx.logger.error(`Unknown command: ${command}`);
      process.stderr.write(`\n${HELP_TEXT}`);
      process.exitCode = 2;
      return;
    }

    await action(ctx);
  } catch (err) {
    if (err instanceof AppError) {
      ctx.logger.error(err.userMessage);
    } else if (ctx.config.logLevel === 'debug') {
      ctx.logger.error(err.stack ?? err.message);
    } else {
      ctx.logger.error(`${err.message} (run with --verbose for details)`);
    }
    process.exitCode = 1;
  }
}
