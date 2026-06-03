#!/usr/bin/env node
/**
 * Executable entry point. Thin shim: delegate to the CLI router.
 */

import { main } from '../src/cli/router.js';

main().catch((err) => {
  // Last-resort guard so an unexpected error never prints a raw crash without
  // a non-zero exit code.
  process.stderr.write(`fatal: ${err?.stack ?? err}\n`);
  process.exitCode = 1;
});
