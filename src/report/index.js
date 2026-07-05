/**
 * Report stage orchestration: build the Current Profile, enforce strict mode,
 * and write the deliverables — machine-readable profile JSON, human
 * gap-analysis Markdown, evidence-map CSV, and a self-contained HTML dashboard.
 * When a target profile exists, two more are emitted: the machine-readable
 * Target Profile and the prioritized remediation plan; when it doesn't, stale
 * target deliverables from an earlier run are removed so an outdated plan can
 * never be mistaken for current.
 *
 * STRICT MODE (brief §6): when enabled, refuse to emit the final profile until
 * every subcategory is resolved by a human. We stop with a clear, actionable
 * message (a StrictModeError, caught and printed by the CLI) listing the
 * blocking items — never a stack-trace crash.
 */

import { buildProfile } from './profile.js';
import { renderGapMarkdown } from './gapMarkdown.js';
import { renderEvidenceCsv } from './evidenceCsv.js';
import { renderRemediationMarkdown } from './remediationMarkdown.js';
import { buildTargetProfile } from './targetJson.js';
import { renderDashboardHtml } from './htmlDashboard.js';
import { buildTargetView } from '../target/targetProfile.js';
import { writeJsonAtomic, writeFileAtomic, removeIfExists } from '../util/fsx.js';
import { StrictModeError } from '../core/errors.js';

export async function renderReports(ctx, { csf, assessments, reviews, meta, targetSpec = null }) {
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

  const targetView = targetSpec ? buildTargetView(profile, targetSpec, csf) : null;

  const md = renderGapMarkdown(profile, {
    evidenceQuoteMaxChars: ctx.config.report.evidenceQuoteMaxChars,
    targetView,
  });
  const csv = renderEvidenceCsv(profile);

  await writeJsonAtomic(ctx.paths.currentProfile, profile);
  await writeFileAtomic(ctx.paths.gapReport, md);
  await writeFileAtomic(ctx.paths.evidenceMap, csv);
  await writeFileAtomic(ctx.paths.dashboard, renderDashboardHtml(profile, targetView));

  if (targetView) {
    await writeJsonAtomic(ctx.paths.targetProfile, buildTargetProfile(profile, targetView));
    await writeFileAtomic(ctx.paths.remediationPlan, renderRemediationMarkdown(profile, targetView));
  } else {
    await removeIfExists(ctx.paths.targetProfile);
    await removeIfExists(ctx.paths.remediationPlan);
  }

  return {
    profile,
    targetView,
    profileJsonPath: ctx.paths.currentProfile,
    gapMdPath: ctx.paths.gapReport,
    evidenceCsvPath: ctx.paths.evidenceMap,
    dashboardPath: ctx.paths.dashboard,
    targetProfileJsonPath: targetView ? ctx.paths.targetProfile : null,
    remediationPlanPath: targetView ? ctx.paths.remediationPlan : null,
  };
}
