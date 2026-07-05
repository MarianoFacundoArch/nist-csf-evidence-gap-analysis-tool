/**
 * RUN-ALL action: the convenience pipeline. Runs ingest -> analyze -> review ->
 * report in sequence. Review is interactive when possible (or bulk-accepted via
 * --accept-all); in a non-interactive run without --accept-all it is skipped
 * with a clear notice and the report is emitted as a DRAFT marking unreviewed
 * items (unless strict mode, which will then refuse to emit — by design).
 *
 * Imports sibling actions directly (not the barrel) to avoid a circular import.
 */

import { ingest } from './ingest.js';
import { analyze } from './analyze.js';
import { review } from './review.js';
import { report } from './report.js';
import { fileExists } from '../util/fsx.js';

export async function runAll(ctx) {
  ctx.logger.info('Running the full pipeline: ingest → analyze → review → report');
  await ingest(ctx);
  await analyze(ctx);

  if (ctx.ui?.isInteractive || ctx.config.acceptAll) {
    await review(ctx);
  } else {
    ctx.logger.warn(
      'Skipping interactive review (non-interactive session). The report will mark items UNREVIEWED. ' +
        'Run `csf-tool review` to validate them, or re-run with --accept-all.',
    );
  }

  // The target stage is optional and human-owned; `all` never creates one, it
  // just points at it. When a target exists, `report` picks it up automatically.
  if (!(await fileExists(ctx.paths.target))) {
    ctx.logger.info(
      'No target profile set — the report will omit the remediation plan. Run `csf-tool target` to define one.',
    );
  }

  return report(ctx);
}
