/**
 * Interactive menu mode (launched when no command is given).
 *
 * The menu is a thin front-end: it walks the user through the same pipeline by
 * calling the SAME action functions the command router calls. Any input an
 * action needs (e.g. the documents path) is requested inside the action via
 * ctx.ui, so the menu "walks the user through" automatically.
 */

import * as actions from '../actions/index.js';
import { AppError } from '../core/errors.js';

export async function startMenu(ctx) {
  const p = ctx.ui.clack;
  p?.intro?.('NIST CSF 2.0 — AI-assisted evidence & gap analysis');
  ctx.ui.info('Build a CSF 2.0 Current Profile from your documents. AI proposes, a human validates.');

  for (;;) {
    const choice = await ctx.ui.select('What would you like to do?', [
      { value: 'init', label: 'Initialize (config, .env, working dir)' },
      { value: 'ingest', label: 'Ingest documents (parse + embed + index)' },
      { value: 'analyze', label: 'Analyze coverage (AI judgments)' },
      { value: 'review', label: 'Review AI judgments (human-in-the-loop)' },
      { value: 'report', label: 'Generate reports (profile, gaps, evidence map)' },
      { value: 'all', label: 'Run everything (ingest → analyze → review → report)' },
      { value: 'exit', label: 'Exit' },
    ]);

    if (choice === 'exit') break;

    const action = choice === 'all' ? actions.runAll : actions[choice];
    try {
      await action(ctx);
      ctx.ui.success(`Done: ${choice}`);
    } catch (err) {
      if (err instanceof AppError) ctx.ui.warn(err.userMessage);
      else ctx.ui.warn(`Unexpected error: ${err.message}`);
      // Stay in the menu so the user can fix inputs and retry.
    }
  }

  p?.outro?.('Goodbye.');
}
