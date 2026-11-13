/**
 * Report stage orchestration: build the Current Profile, enforce strict mode,
 * and write the deliverables — machine-readable profile JSON, human
 * gap-analysis Markdown, evidence-map CSV, and a self-contained HTML dashboard.
 * When a target profile exists, three more are emitted: the machine-readable
 * Target Profile, the prioritized remediation plan, and its POA&M-style
 * tracker export; when it doesn't, stale target deliverables from an earlier
 * run are removed so an outdated plan can never be mistaken for current. The
 * crosswalk deliverables (CSF 2.0 outcomes related to identifiers in other
 * frameworks) follow the same rule: written when crosswalks are selected,
 * removed when they are not.
 *
 * Every run also writes the evidence-by-document report — the reverse view
 * (document -> what it contributes), derived from one canonical document view
 * that the dashboard shares — and the evidence request list: what to ask and
 * collect for each outcome that could not be demonstrated.
 *
 * REPORT LANGUAGE (`report.language`): the human-readable deliverables — the
 * Markdown reports and the dashboard — are rendered through one report locale
 * created here (src/i18n/locale.js). The machine-readable ones (the two
 * profile JSON files and the three CSV files) are interfaces: they are built
 * without it and are the same bytes in every language.
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
import { buildDocumentView } from './documentView.js';
import { renderDocumentsMarkdown } from './documentsMarkdown.js';
import { renderEvidenceRequestsMarkdown } from './evidenceRequestsMarkdown.js';
import { renderPoamCsv } from './poamCsv.js';
import { buildTargetView } from '../target/targetProfile.js';
import { buildCrosswalkView, crosswalkDashboardData } from '../crosswalk/view.js';
import { renderCrosswalkCsv } from './crosswalkCsv.js';
import { renderCrosswalkMarkdown } from './crosswalkMarkdown.js';
import { writeJsonAtomic, writeFileAtomic, removeIfExists } from '../util/fsx.js';
import { StrictModeError } from '../core/errors.js';
import { loadReportLocale } from '../i18n/locale.js';

export async function renderReports(ctx, { csf, assessments, reviews, meta, targetSpec = null, crosswalks = null }) {
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
  // Optional: the selected crosswalk data (null/empty => none selected or no data file).
  const crosswalkView = crosswalks?.crosswalks?.length ? buildCrosswalkView(profile, crosswalks) : null;

  // The language of the human-readable deliverables. English is the locale
  // every renderer uses by default, so an English run renders exactly as it
  // did before reports could be translated. Loaded before anything is written:
  // a malformed translation file stops the stage with nothing half-emitted.
  const locale = await loadReportLocale(ctx.config.report?.language, ctx.logger);

  const md = renderGapMarkdown(profile, {
    evidenceQuoteMaxChars: ctx.config.report.evidenceQuoteMaxChars,
    targetView,
    locale,
  });
  const csv = renderEvidenceCsv(profile);
  const documentView = buildDocumentView(profile, { assessments, meta });

  await writeJsonAtomic(ctx.paths.currentProfile, profile);
  await writeFileAtomic(ctx.paths.gapReport, md);
  await writeFileAtomic(ctx.paths.evidenceMap, csv);
  const dashboardExtras = { documentView };
  if (crosswalkView) dashboardExtras.crosswalk = crosswalkDashboardData(crosswalkView);
  // Passed only for another language, so an English page embeds what it always did.
  if (!locale.isEnglish) dashboardExtras.locale = locale;
  await writeFileAtomic(ctx.paths.dashboard, renderDashboardHtml(profile, targetView, dashboardExtras));
  await writeFileAtomic(ctx.paths.evidenceByDocument, renderDocumentsMarkdown(profile, documentView, { locale }));
  await writeFileAtomic(
    ctx.paths.evidenceRequests,
    renderEvidenceRequestsMarkdown(profile, { csf, targetView, locale }),
  );

  if (targetView) {
    await writeJsonAtomic(ctx.paths.targetProfile, buildTargetProfile(profile, targetView));
    await writeFileAtomic(ctx.paths.remediationPlan, renderRemediationMarkdown(profile, targetView, { locale }));
    await writeFileAtomic(ctx.paths.poam, renderPoamCsv(profile, targetView));
  } else {
    await removeIfExists(ctx.paths.targetProfile);
    await removeIfExists(ctx.paths.remediationPlan);
    await removeIfExists(ctx.paths.poam);
  }

  if (crosswalkView) {
    await writeFileAtomic(ctx.paths.crosswalkCsv, renderCrosswalkCsv(crosswalkView));
    await writeFileAtomic(ctx.paths.crosswalkReport, renderCrosswalkMarkdown(profile, crosswalkView, { locale }));
  } else {
    // Same rule as the target deliverables: a crosswalk left over from an
    // earlier run must not sit next to a report that no longer selects it.
    for (const stale of [ctx.paths.crosswalkCsv, ctx.paths.crosswalkReport]) {
      if (stale) await removeIfExists(stale);
    }
  }

  return {
    profile,
    targetView,
    crosswalkView,
    profileJsonPath: ctx.paths.currentProfile,
    gapMdPath: ctx.paths.gapReport,
    evidenceCsvPath: ctx.paths.evidenceMap,
    dashboardPath: ctx.paths.dashboard,
    evidenceByDocumentPath: ctx.paths.evidenceByDocument,
    evidenceRequestsPath: ctx.paths.evidenceRequests,
    targetProfileJsonPath: targetView ? ctx.paths.targetProfile : null,
    remediationPlanPath: targetView ? ctx.paths.remediationPlan : null,
    poamPath: targetView ? ctx.paths.poam : null,
    crosswalkCsvPath: crosswalkView ? ctx.paths.crosswalkCsv : null,
    crosswalkReportPath: crosswalkView ? ctx.paths.crosswalkReport : null,
  };
}
