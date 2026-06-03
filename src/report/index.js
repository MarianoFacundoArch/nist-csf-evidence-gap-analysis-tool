/**
 * Report stage orchestration: build the Current Profile, enforce strict mode,
 * and write the three deliverables (machine-readable profile JSON, human
 * gap-analysis Markdown, evidence-map CSV).
 *
 * STRICT MODE (brief §6): when enabled, refuse to emit the final profile until
 * every subcategory is resolved by a human. We stop with a clear, actionable
 * message (a StrictModeError, caught and printed by the CLI) listing the
 * blocking items — never a stack-trace crash.
 */

import { buildProfile } from './profile.js';
import { renderGapMarkdown } from './gapMarkdown.js';
import { renderEvidenceCsv } from './evidenceCsv.js';
import { writeJsonAtomic, writeFileAtomic } from '../util/fsx.js';
import { StrictModeError } from '../core/errors.js';

export async function renderReports(ctx, { csf, assessments, reviews, meta }) {
  const profile = buildProfile(ctx, { csf, assessments, reviews, meta });

  if (ctx.config.analysis.strict) {
    const unresolved = profile.subcategories.filter((e) => e.review_status !== 'reviewed');
    if (unresolved.length > 0) {
      const sample = unresolved.slice(0, 10).map((e) => e.subcategory_id).join(', ');
      throw new StrictModeError(
        `Strict mode: ${unresolved.length} of ${profile.subcategories.length} subcategories are not resolved ` +
          `(${profile.summary.unreviewed} unreviewed, ${profile.summary.stale} stale).`,
        {
          hint:
            `Run \`csf-tool review\` to resolve them, or drop --strict to emit a draft. ` +
            `Unresolved: ${sample}${unresolved.length > 10 ? ', …' : ''}`,
        },
      );
    }
  }

  const md = renderGapMarkdown(profile, { evidenceQuoteMaxChars: ctx.config.report.evidenceQuoteMaxChars });
  const csv = renderEvidenceCsv(profile);

  await writeJsonAtomic(ctx.paths.currentProfile, profile);
  await writeFileAtomic(ctx.paths.gapReport, md);
  await writeFileAtomic(ctx.paths.evidenceMap, csv);

  return {
    profile,
    profileJsonPath: ctx.paths.currentProfile,
    gapMdPath: ctx.paths.gapReport,
    evidenceCsvPath: ctx.paths.evidenceMap,
  };
}
