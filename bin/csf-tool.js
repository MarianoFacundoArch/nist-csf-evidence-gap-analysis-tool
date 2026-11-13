#!/usr/bin/env node
/**
 * Executable entry point. Thin shim: delegate to the CLI router.
 */

import { main } from '../src/cli/router.js';

main().catch((err) => {
  // Last-resort guard so an unexpected error never prints a raw crash without
  // a non-zero exit code. An expected, explainable error raised before the run
  // context exists (a configuration that must not be guessed) carries its own
  // one-line message: show that instead of a stack.
  process.stderr.write(err?.userMessage ? `error: ${err.userMessage}\n` : `fatal: ${err?.stack ?? err}\n`);
  process.exitCode = 1;
});
