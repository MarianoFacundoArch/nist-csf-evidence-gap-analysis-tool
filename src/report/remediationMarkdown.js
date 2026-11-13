/**
 * Renders the human-readable remediation plan (Markdown) — the action plan that
 * connects the Current Profile to the Target Profile, which is the artifact the
 * CSF 2.0 profile workflow exists to produce.
 *
 * Ordering is the point of this deliverable: unmet targets appear as ONE
 * numbered list ranked by human-set priority, then by distance from the goal
 * (see planOrder). Each item's "suggested actions" are the official NIST CSF
 * 2.0 Implementation Examples for that outcome, quoted verbatim from the CPRT
 * export — the same grounding rule as evidence quotes: the tool never invents
 * recommendations.
 *
 * Owner, due date, status and milestones appear on an item only when a person
 * recorded them in the target profile (`plan`); the tool never fills them in.
 * The same goes for the CSF Tier line in the overview: it reports the
 * organization's own selection and is absent when none is recorded.
 *
 * In another report language (a locale from src/i18n/locale.js) the tool's
 * sentences are translated and the outcome text is that of the published
 * translation of the Core. The suggested actions are not: NIST publishes the
 * Implementation Examples in English only, so they stay verbatim in English
 * and the plan says so once, above the list.
 */

import { planOrder } from '../target/targetProfile.js';
import { orderFunctions } from '../csf/order.js';
import { compareText } from '../util/compare.js';
import { PRIORITY_LEVELS } from '../target/target.schema.js';
import { mdLine } from './markdownText.js';
import { asLocale, frameworkNoteLines } from '../i18n/locale.js';

/**
 * @param {object} profile the Current Profile from buildProfile()
 * @param {object} view the target view from buildTargetView()
 * @param {object} [options]
 * @param {ReturnType<typeof import('../i18n/locale.js').createReportLocale>} [options.locale]
 *   report locale; English when omitted
 * @returns {string} Markdown
 */
export function renderRemediationMarkdown(profile, view, options) {
  const locale = asLocale(options?.locale);
  const { t } = locale;
  const s = view.summary;
  const functionName = locale.functionNames(view.entries);
  const out = [];

  out.push(`# ${t('plan.title')}`);
  out.push('');
  out.push(`> ${t('plan.note')}`);
  out.push('');
  if (profile.summary.unreviewed > 0 || profile.summary.stale > 0) {
    out.push(`> ${t('plan.draft', { unreviewed: profile.summary.unreviewed, stale: profile.summary.stale })}`);
    out.push('');
  }
  out.push(...frameworkNoteLines(locale, view.entries));

  out.push(`## ${t('common.heading.overview')}`);
  out.push('');
  out.push(`- ${t('common.overview.framework', { framework: profile.framework, version: profile.frameworkVersion })}`);
  out.push(`- ${t('common.overview.generated', { date: profile.generatedAt })}`);
  out.push(`- ${t('plan.overview.baseline', { baseline: locale.coverage(view.baseline) })}`);
  if (view.description) out.push(`- ${t('plan.overview.description', { description: mdLine(view.description) })}`);
  if (view.tiers) {
    out.push(`- ${locale.tierSentence(view.tiers)}`);
    if (view.tiers.note) out.push(`- ${t('tier.note', { note: mdLine(view.tiers.note) })}`);
  }
  out.push(
    `- ${t('plan.overview.applicable', { applicable: s.applicable, total: s.total })}` +
      (s.notApplicable ? ` (${t('plan.overview.scopedOut', { count: s.notApplicable })})` : ''),
  );
  out.push(
    `- ${t('plan.overview.met', {
      met: s.met,
      applicable: s.applicable,
      pct: s.pctMet,
      unmet: s.unmet,
      high: s.unmetByPriority.high,
      medium: s.unmetByPriority.medium,
      low: s.unmetByPriority.low,
    })}`,
  );
  out.push('');

  out.push(`## ${t('plan.heading.byFunction')}`);
  out.push('');
  out.push(t('common.table.target.header'));
  out.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const f of s.byFunction) {
    out.push(`| ${functionName(f.function)} | ${f.applicable} | ${f.met} | ${f.unmet} | ${f.notApplicable} | ${f.pctMet}% |`);
  }
  out.push('');

  const unmet = planOrder(view.entries.filter((e) => !e.not_applicable && !e.met));

  out.push(`## ${t('plan.heading.actionPlan')}`);
  out.push('');
  if (unmet.length === 0) {
    out.push(t('plan.noUnmet'));
    out.push('');
  } else {
    out.push(t('plan.intro'));
    out.push('');
    // Only a translated plan needs it: the examples below are NIST's English.
    const examplesNote = locale.examplesNote();
    if (examplesNote) {
      out.push(examplesNote);
      out.push('');
    }
    let n = 0;
    for (const prio of PRIORITY_LEVELS) {
      const items = unmet.filter((e) => e.priority === prio);
      if (items.length === 0) continue;
      out.push(`### ${locale.priorityHeading(prio, items.length)}`);
      out.push('');
      for (const e of items) {
        n++;
        out.push(
          `#### ${n}. ${e.subcategory_id} — ${locale.coverage(e.current_coverage)} → ` +
            `${locale.coverage(e.target_coverage)}${levelsToClose(e.gap, locale)}${statusBadge(e, locale)}`,
        );
        out.push('');
        out.push(
          `- ${t('common.item.functionCategory', { function: functionName(e.function), category: locale.categoryLabel(e) })}`,
        );
        out.push(`- ${t('common.item.outcome', { outcome: locale.outcome(e) })}`);
        // Held to one line each: the next lines are NIST's own examples, and
        // free text must not be able to add a look-alike entry to that list.
        out.push(`- ${t('common.item.assessmentRationale', { rationale: mdLine(locale.fixed(e.rationale)) })}`);
        if (e.note) out.push(`- ${t('plan.item.targetNote', { note: mdLine(e.note) })}`);
        const plan = planLine(e.plan, locale);
        if (plan) out.push(`- ${t('plan.item.plan', { plan })}`);
        if (e.implementation_examples.length > 0) {
          out.push(`- ${t('plan.item.actions')}`);
          // Verbatim, in NIST's order and in NIST's language, in every report language.
          e.implementation_examples.forEach((ex, i) => out.push(`  ${i + 1}. ${ex}`));
        } else {
          out.push(`- ${t('plan.item.noActions')}`);
        }
        out.push('');
      }
    }
  }

  const met = view.entries.filter((e) => e.met);
  out.push(`## ${t('plan.heading.met', { count: met.length })}`);
  out.push('');
  if (met.length === 0) {
    out.push(t('plan.noneMet'));
    out.push('');
  } else {
    for (const fn of orderFunctions(met)) {
      const es = met
        .filter((e) => e.function === fn)
        .sort((a, b) => compareText(a.subcategory_id, b.subcategory_id));
      out.push(`### ${functionName(fn)}`);
      out.push('');
      for (const e of es) {
        const entry = t('plan.met.entry', {
          current: locale.coverage(e.current_coverage),
          target: locale.coverage(e.target_coverage),
        });
        out.push(`- **${e.subcategory_id}** — ${entry}${statusBadge(e, locale)}`);
      }
      out.push('');
    }
  }

  const na = view.entries.filter((e) => e.not_applicable);
  if (na.length > 0) {
    out.push(`## ${t('plan.heading.outOfScope', { count: na.length })}`);
    out.push('');
    out.push(t('plan.outOfScope.intro'));
    out.push('');
    for (const e of na.sort((a, b) => compareText(a.subcategory_id, b.subcategory_id))) {
      const reason = e.note ? ` _(${t('plan.outOfScope.reason', { reason: mdLine(e.note) })})_` : '';
      out.push(`- **${e.subcategory_id}** — ${locale.outcome(e)}${reason}`);
    }
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(t('plan.footer'));
  out.push('');
  return out.join('\n');
}

function levelsToClose(gap, locale) {
  // "1 level" / "2 levels", decided by the same test the reports have always used.
  const key = gap > 1 ? 'common.levelsToClose.other' : 'common.levelsToClose.one';
  return gap > 0 ? ` (${locale.t(key, { count: gap })})` : '';
}

/**
 * The human's plan fields on one line, or null when none is recorded. Only
 * what the person wrote is shown: no default status, and no placeholder for a
 * missing owner or date. The status is one of the values target.json accepts
 * and is shown in the report's language; everything else is the person's text.
 */
function planLine(plan, locale) {
  if (!plan) return null;
  const { t } = locale;
  const parts = [];
  if (plan.owner) parts.push(t('plan.item.plan.owner', { value: mdLine(plan.owner) }));
  if (plan.due) parts.push(t('plan.item.plan.due', { value: plan.due }));
  if (plan.status) parts.push(t('plan.item.plan.status', { value: locale.planStatus(plan.status) }));
  if (plan.milestones) parts.push(t('plan.item.plan.milestones', { value: mdLine(plan.milestones) }));
  return parts.length > 0 ? parts.join('; ') : null;
}

function statusBadge(e, locale) {
  if (e.review_status === 'unreviewed') return ` _(${locale.t('badge.unreviewed')})_`;
  if (e.review_status === 'stale') return ` _(${locale.t('badge.stale')})_`;
  return '';
}
