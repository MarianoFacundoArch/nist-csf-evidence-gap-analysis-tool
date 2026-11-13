/**
 * Renders the human-readable gap-analysis report (Markdown).
 *
 * Layout deliberately puts GAPS FIRST (the actionable part): a reader sees what
 * is missing before what is done. Items are grouped by Function (in canonical
 * order), with a coverage summary table up top. Unreviewed/stale items and
 * human overrides are marked inline so AI output is never mistaken for
 * validated output.
 *
 * The wording comes from the message catalog through a report locale
 * (src/i18n/locale.js). Without one the report is in English, exactly as it
 * always was; with one, the tool's sentences and vocabulary are in that
 * language and the Function names and outcomes are those of the published
 * translation of the Core. Entries are still grouped and ordered by their
 * English Function name, so the order never depends on the language.
 */

import { isGap } from '../engine/coverage.js';
import { orderFunctions } from '../csf/order.js';
import { compareText } from '../util/compare.js';
import { mdLine } from './markdownText.js';
import { asLocale, frameworkNoteLines } from '../i18n/locale.js';

function statusBadge(e, locale) {
  const { t } = locale;
  const parts = [];
  if (e.review_status === 'unreviewed') parts.push(t('badge.unreviewed'));
  else if (e.review_status === 'stale') parts.push(t('badge.stale'));
  if (e.human_coverage != null) {
    parts.push(t('badge.override', { from: locale.coverage(e.ai_coverage), to: locale.coverage(e.human_coverage) }));
  }
  if (e.verification?.downgraded) parts.push(t('badge.downgraded'));
  return parts.length ? ` _(${parts.join('; ')})_` : '';
}

function evidenceLines(e, maxChars, locale) {
  if (!e.evidence?.length) return [];
  return e.evidence.map((ev) => {
    const where = locale.where(ev.source_file, ev.page);
    let q = ev.quote;
    if (q.length > maxChars) q = q.slice(0, maxChars).trimEnd() + '…';
    return `  - ${locale.t('gap.item.evidence', { where, quote: q })}`;
  });
}

/**
 * @param {object} profile the Current Profile from buildProfile()
 * @param {object} [options]
 * @param {number} [options.evidenceQuoteMaxChars] longest quote printed in full
 * @param {object|null} [options.targetView] the target view from buildTargetView(), if any
 * @param {ReturnType<typeof import('../i18n/locale.js').createReportLocale>} [options.locale]
 *   report locale; English when omitted
 * @returns {string} Markdown
 */
export function renderGapMarkdown(profile, { evidenceQuoteMaxChars = 300, targetView = null, locale: given } = {}) {
  const locale = asLocale(given);
  const { t } = locale;
  const s = profile.summary;
  const entries = profile.subcategories;
  const functionName = locale.functionNames(entries);
  const out = [];

  out.push(`# ${t('gap.title')}`);
  out.push('');
  out.push(`> ${locale.fixed(profile.disclaimer)}`);
  out.push('');
  if (s.unreviewed > 0 || s.stale > 0) {
    out.push(`> ${t('gap.draft', { unreviewed: s.unreviewed, stale: s.stale })}`);
    out.push('');
  }
  out.push(...frameworkNoteLines(locale, entries));

  out.push(`## ${t('common.heading.overview')}`);
  out.push('');
  out.push(`- ${t('common.overview.framework', { framework: profile.framework, version: profile.frameworkVersion })}`);
  out.push(`- ${t('common.overview.generated', { date: profile.generatedAt })}`);
  out.push(`- ${t('gap.overview.providers', { embeddings: profile.providers.embeddings, llm: profile.providers.llm })}`);
  out.push(`- ${t('common.overview.csfSource', { source: locale.fixed(profile.csfSource) })}`);
  out.push(`- ${t('gap.overview.subcategories', { total: s.totalSubcategories, gaps: s.gaps })}`);
  out.push(
    `- ${t('gap.overview.coverage', {
      none: s.byCoverage.none,
      partial: s.byCoverage.partial,
      substantial: s.byCoverage.substantial,
      full: s.byCoverage.full,
    })}`,
  );
  out.push(
    `- ${t('gap.overview.review', { reviewed: s.reviewed, unreviewed: s.unreviewed, stale: s.stale, overridden: s.overridden })}`,
  );
  out.push(`- ${t('gap.overview.downgraded', { count: s.downgradedByVerifier })}`);
  out.push('');

  // Per-function summary table.
  out.push(`## ${t('gap.heading.byFunction')}`);
  out.push('');
  out.push(t('gap.table.byFunction.header'));
  out.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const fn of orderFunctions(entries)) {
    const es = entries.filter((e) => e.function === fn);
    const c = { none: 0, partial: 0, substantial: 0, full: 0 };
    for (const e of es) c[e.coverage]++;
    const addressed = es.length ? Math.round(((c.substantial + c.full) / es.length) * 100) : 0;
    out.push(`| ${functionName(fn)} | ${es.length} | ${c.none} | ${c.partial} | ${c.substantial} | ${c.full} | ${addressed}% |`);
  }
  out.push('');

  // Current vs Target (only when a target profile exists).
  if (targetView) {
    const summary = targetView.summary;
    out.push(`## ${t('gap.heading.currentVsTarget')}`);
    out.push('');
    out.push(
      t('gap.target.summary', {
        baseline: locale.coverage(targetView.baseline),
        met: summary.met,
        applicable: summary.applicable,
        pct: summary.pctMet,
        unmet: summary.unmet,
        high: summary.unmetByPriority.high,
        medium: summary.unmetByPriority.medium,
        low: summary.unmetByPriority.low,
      }) + `${summary.notApplicable ? `; ${t('gap.target.outOfScope', { count: summary.notApplicable })}` : ''}.`,
    );
    out.push('');
    // The organization's CSF Tier selection, when it recorded one. Tiers are
    // chosen, not computed from the coverage above; the sentence says so.
    if (targetView.tiers) {
      out.push(locale.tierSentence(targetView.tiers));
      out.push('');
      if (targetView.tiers.note) {
        out.push(t('tier.note', { note: mdLine(targetView.tiers.note) }));
        out.push('');
      }
    }
    out.push(t('common.table.target.header'));
    out.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const f of summary.byFunction) {
      out.push(`| ${functionName(f.function)} | ${f.applicable} | ${f.met} | ${f.unmet} | ${f.notApplicable} | ${f.pctMet}% |`);
    }
    out.push('');
    out.push(t('gap.target.seePlan'));
    out.push('');
  }

  // Gaps first.
  out.push(`## ${t('gap.heading.gaps')}`);
  out.push('');
  let anyGap = false;
  for (const fn of orderFunctions(entries)) {
    const gaps = entries
      .filter((e) => e.function === fn && isGap(e.coverage))
      .sort((a, b) => rank(a.coverage) - rank(b.coverage) || compareText(a.subcategory_id, b.subcategory_id));
    if (gaps.length === 0) continue;
    anyGap = true;
    out.push(`### ${functionName(fn)}`);
    out.push('');
    for (const e of gaps) {
      out.push(`- **${e.subcategory_id}** — _${locale.coverage(e.coverage)}_${statusBadge(e, locale)}`);
      out.push(`  - ${t('common.item.outcome', { outcome: locale.outcome(e) })}`);
      // Held to one line each: a line break in AI- or human-written text
      // must not start a list item or a heading of its own. A rationale the
      // tool wrote itself (an outcome that was never assessed) is shown in the
      // report's language; one a model wrote is shown as written.
      out.push(`  - ${t('gap.item.rationale', { rationale: mdLine(locale.fixed(e.rationale)) })}`);
      out.push(...evidenceLines(e, evidenceQuoteMaxChars, locale));
      if (e.reviewer_notes) out.push(`  - ${t('common.item.reviewerNote', { note: mdLine(e.reviewer_notes) })}`);
    }
    out.push('');
  }
  if (!anyGap) {
    out.push(t('gap.noGaps'));
    out.push('');
  }

  // Covered.
  out.push(`## ${t('gap.heading.covered')}`);
  out.push('');
  let anyCovered = false;
  for (const fn of orderFunctions(entries)) {
    const covered = entries
      .filter((e) => e.function === fn && !isGap(e.coverage))
      .sort((a, b) => compareText(a.subcategory_id, b.subcategory_id));
    if (covered.length === 0) continue;
    anyCovered = true;
    out.push(`### ${functionName(fn)}`);
    out.push('');
    for (const e of covered) {
      out.push(`- **${e.subcategory_id}** — _${locale.coverage(e.coverage)}_${statusBadge(e, locale)}: ${locale.outcome(e)}`);
      const first = e.evidence?.[0];
      if (first) {
        out.push(`  - ${t('gap.item.evidenceSource', { where: locale.where(first.source_file, first.page) })}`);
      }
    }
    out.push('');
  }
  if (!anyCovered) {
    out.push(t('gap.noneCovered'));
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(t('gap.footer'));
  out.push('');
  return out.join('\n');
}

function rank(c) {
  return c === 'none' ? 0 : 1; // none before partial within the gaps section
}
