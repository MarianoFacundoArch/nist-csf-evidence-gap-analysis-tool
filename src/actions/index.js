/**
 * The actions barrel — the single import surface shared by BOTH front-ends
 * (the command router and the interactive menu). Each action has the signature
 * action(ctx) and returns a plain result object. This is the one code path the
 * brief requires: the menu and the CLI differ only in the injected ctx.ui and
 * how they display results.
 */

export { init } from './init.js';
export { ingest } from './ingest.js';
export { analyze } from './analyze.js';
export { review } from './review.js';
export { report } from './report.js';
export { runAll } from './runAll.js';
