/**
 * Renders evidence-requests.md — the list an assessor takes to the next
 * meeting: for every outcome the assessment could not demonstrate, what to ask
 * and what to collect, so the next ingest can close it.
 *
 * WHY it exists: the assessment rule is "absence of evidence = none". That is
 * right for the assessment, but absence of evidence is not absence of a
 * control — often the organization does the thing and simply did not hand over
 * the document. Without this list the reader is left with a wall of "none" and
 * no next step.
 *
 * Nothing here is generated advice. Each item is fixed template text plus
 * official text:
 *  - the three questions are THE SAME for every outcome and mirror the
 *    assessment's own rubric (outcome vs topic; documentation; intent vs
 *    operation). The tool does not compose outcome-specific questions: it
 *    could not ground them.
 *  - "Evidence that could demonstrate it" is the official NIST CSF 2.0
 *    Implementation Examples for the Subcategory — verbatim, in NIST's order —
 *    as a checklist. NIST describes them as illustrative: not a comprehensive
 *    list and not a baseline of required actions, and the label says so.
 *  - the rationale is AI text and is labeled as the assessment's rationale,
 *    as in the other reports.
 *
 * Scope and order follow the sibling deliverables so they can be read side by
 * side: with a target profile, the applicable outcomes that do not meet their
 * target, in the remediation plan's order (planOrder) and numbering; without
 * one, the outcomes whose coverage is a gap, grouped by Function with "none"
 * before "partial" like gap-analysis.md.
 *
 * In another report language (a locale from src/i18n/locale.js) the fixed
 * template text — the three questions included — is translated, and the
 * outcome text is that of the published translation of the Core. The
 * checklists are not translated: NIST publishes the Implementation Examples
 * in English only, so they stay verbatim in English and the list says so.
 */

import { planOrder } from '../target/targetProfile.js';
import { PRIORITY_LEVELS } from '../target/target.schema.js';
import { isGap, COVERAGE_LEVELS } from '../engine/coverage.js';
import { orderFunctions } from '../csf/order.js';
import { compareText } from '../util/compare.js';
import { mdCode, mdLine } from './markdownText.js';
import { ENGLISH, asLocale, frameworkNoteLines } from '../i18n/locale.js';

// The same three questions for every item, on purpose (see the module comment).
const QUESTION_KEYS = ['requests.question.1', 'requests.question.2', 'requests.question.3'];

/** The three questions as an English report prints them. */
export const EVIDENCE_QUESTIONS = QUESTION_KEYS.map((key) => ENGLISH.t(key));

/**
 * @param {object} profile the Current Profile from buildProfile()
 * @param {object} [options]
 * @param {object|null} [options.csf] loaded CSF core (source of the Implementation Examples)
 * @param {object|null} [options.targetView] the target view from buildTargetView(), if any
 * @param {ReturnType<typeof import('../i18n/locale.js').createReportLocale>} [options.locale]
 *   report locale; English when omitted
 * @returns {string} Markdown
 */
export function renderEvidenceRequestsMarkdown(profile, { csf = null, targetView = null, locale: given } = {}) {
  const locale = asLocale(given);
  const { t } = locale;
  const entryById = new Map(profile.subcategories.map((e) => [e.subcategory_id, e]));
  const examplesById = implementationExamples(csf, targetView);
  const functionName = locale.functionNames(profile.subcategories);
  const unmet = targetView ? planOrder(targetView.entries.filter((e) => !e.not_applicable && !e.met)) : [];
  const gaps = targetView ? [] : profile.subcategories.filter((e) => isGap(e.coverage));
  const total = targetView ? unmet.length : gaps.length;
  const out = [];

  out.push(`# ${t('requests.title')}`);
  out.push('');
  out.push(`> ${t('requests.purpose')}`);
  out.push('');
  // A translated list adds that the checklists themselves are NIST's English.
  const examplesNote = locale.examplesNote();
  out.push(`> ${t('requests.sources')}${examplesNote ? ` ${examplesNote}` : ''}`);
  out.push('');
  if (profile.summary.unreviewed > 0 || profile.summary.stale > 0) {
    out.push(`> ${t('requests.draft', { unreviewed: profile.summary.unreviewed, stale: profile.summary.stale })}`);
    out.push('');
  }
  const caveat = analysisCaveat(profile, locale);
  if (caveat) {
    out.push(`> ${t('common.note', { note: caveat })}`);
    out.push('');
  }
  out.push(...frameworkNoteLines(locale, profile.subcategories));

  out.push(`## ${t('common.heading.overview')}`);
  out.push('');
  out.push(`- ${t('common.overview.generated', { date: profile.generatedAt })}`);
  if (targetView) {
    const s = targetView.summary;
    out.push(`- ${locale.plural('requests.scope.target', total)}`);
    out.push(
      `- ${t('requests.notListed.target', { met: s.met })}` +
        (s.notApplicable ? `, ${t('requests.notListed.scopedOut', { count: s.notApplicable })}` : ''),
    );
  } else {
    out.push(`- ${locale.plural('requests.scope.gaps', total)}`);
    out.push(`- ${t('requests.notListed.gaps', { count: profile.subcategories.length - total })}`);
  }
  out.push(
    `- ${t('requests.open', { count: total })}` +
      byCoverage(targetView ? unmet.map((e) => e.current_coverage) : gaps.map((e) => e.coverage), locale),
  );
  out.push('');

  out.push(`## ${t('requests.heading.requests')}`);
  out.push('');
  if (total === 0) {
    out.push(t(targetView ? 'requests.none.target' : 'requests.none.gaps'));
    out.push('');
  } else if (targetView) {
    let n = 0;
    for (const prio of PRIORITY_LEVELS) {
      const items = unmet.filter((e) => e.priority === prio);
      if (items.length === 0) continue;
      out.push(`### ${locale.priorityHeading(prio, items.length)}`);
      out.push('');
      for (const target of items) {
        n++;
        const e = entryById.get(target.subcategory_id) ?? null;
        pushItem(out, locale, {
          heading:
            `${n}. ${target.subcategory_id} — ${locale.coverage(target.current_coverage)} → ` +
            `${locale.coverage(target.target_coverage)}${levelsToClose(target.gap, locale)}` +
            `${statusBadge(target.review_status, locale)}`,
          functionName: functionName(target.function),
          category: locale.categoryLabel(target),
          outcome: locale.outcome(target),
          coverageLine: t('requests.item.coverage.withTarget', {
            coverage: coverageWithOverride(target.current_coverage, e, locale),
            target: locale.coverage(target.target_coverage),
            priority: locale.priority(target.priority),
          }),
          reviewStatus: target.review_status,
          rationale: target.rationale,
          entry: e,
          examples: examplesById.get(target.subcategory_id) ?? [],
        });
      }
    }
  } else {
    for (const fn of orderFunctions(gaps)) {
      const items = gaps
        .filter((e) => e.function === fn)
        // By id within a level, like gap-analysis.md — compared without a
        // locale, so the list is the same on every machine.
        .sort((a, b) => rank(a.coverage) - rank(b.coverage) || compareText(a.subcategory_id, b.subcategory_id));
      out.push(`### ${functionName(fn)} (${items.length})`);
      out.push('');
      for (const e of items) {
        pushItem(out, locale, {
          heading: `${e.subcategory_id} — ${locale.coverage(e.coverage)}${statusBadge(e.review_status, locale)}`,
          functionName: functionName(e.function),
          category: locale.categoryLabel(e),
          outcome: locale.outcome(e),
          coverageLine: coverageWithOverride(e.coverage, e, locale),
          reviewStatus: e.review_status,
          rationale: e.rationale,
          entry: e,
          examples: examplesById.get(e.subcategory_id) ?? [],
        });
      }
    }
  }

  out.push('---');
  out.push('');
  out.push(t(targetView ? 'requests.footer.target' : 'requests.footer.gaps'));
  out.push('');
  return out.join('\n');
}

function pushItem(out, locale, { heading, functionName, category, outcome, coverageLine, reviewStatus, rationale, entry, examples }) {
  const { t } = locale;
  out.push(`#### ${heading}`);
  out.push('');
  out.push(`- ${t('common.item.functionCategory', { function: functionName, category })}`);
  out.push(`- ${t('common.item.outcome', { outcome })}`);
  out.push(`- ${t('requests.item.coverage', { coverage: coverageLine })}`);
  out.push(`- ${t('requests.item.reviewStatus', { status: locale.reviewStatus(reviewStatus) })}`);
  // Free text is held to one line: the lines that follow carry official NIST
  // text, and a rationale must not be able to add a look-alike of its own.
  out.push(`- ${t('common.item.assessmentRationale', { rationale: mdLine(locale.fixed(rationale)) })}`);
  if (entry?.reviewer_notes) out.push(`- ${t('common.item.reviewerNote', { note: mdLine(entry.reviewer_notes) })}`);
  const quoted = quotedDocuments(entry, locale);
  if (quoted) out.push(`- ${t('requests.item.quotedDocuments', { documents: quoted })}`);
  out.push(`- ${t('requests.item.questions')}`);
  // An English list prints the exported questions, as it always has; another
  // language prints the catalog's wording of the same three.
  const questions = locale.isEnglish ? EVIDENCE_QUESTIONS : QUESTION_KEYS.map((key) => t(key));
  questions.forEach((question, i) => out.push(`  ${i + 1}. ${question}`));
  if (examples.length > 0) {
    out.push(`- ${t('requests.item.examples')}`);
    // Verbatim, in NIST's order and in NIST's language: never paraphrased,
    // reordered, trimmed or translated.
    for (const example of examples) out.push(`  - [ ] ${example}`);
  } else {
    out.push(`- ${t('requests.item.noExamples')}`);
  }
  out.push('');
}

/**
 * The header says an outcome is listed because the documents did not show it.
 * That is only true of outcomes the analysis actually examined, against the
 * documents as they are now — so an unfinished or outdated analysis is said
 * up front rather than left to read as a finding.
 */
function analysisCaveat(profile, locale) {
  const analysis = profile.activity?.analysis;
  if (!analysis) return null;
  if (analysis.status === 'stale') {
    return locale.t('requests.caveat.stale', { reasons: (analysis.reasons ?? []).map(locale.fixed).join('; ') });
  }
  if (analysis.assessed < analysis.total) {
    return locale.t('requests.caveat.incomplete', { assessed: analysis.assessed, total: analysis.total });
  }
  return null;
}

/**
 * The official examples per Subcategory. The CSF core is the source; a target
 * view carries the same text, so it serves as a fallback for callers that
 * render without the core.
 */
function implementationExamples(csf, targetView) {
  const byId = new Map();
  for (const t of targetView?.entries ?? []) byId.set(t.subcategory_id, t.implementation_examples ?? []);
  for (const s of csf?.subcategories ?? []) byId.set(s.id, s.implementationExamples ?? []);
  return byId;
}

/** "`a.md` (2 quotes), `b.pdf` (1 quote)" — or null when nothing is quoted. */
function quotedDocuments(entry, locale) {
  const counts = new Map();
  for (const ev of entry?.evidence ?? []) {
    if (ev?.verified === false || typeof ev?.source_file !== 'string' || ev.source_file === '') continue;
    counts.set(ev.source_file, (counts.get(ev.source_file) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([name, n]) => `${mdCode(name)} (${locale.plural('common.count.quote', n)})`)
    .join(', ');
}

function coverageWithOverride(coverage, entry, locale) {
  const shown = locale.coverage(coverage);
  if (entry?.human_coverage == null) return shown;
  const override = locale.t('badge.override', {
    from: locale.coverage(entry.ai_coverage),
    to: locale.coverage(entry.human_coverage),
  });
  return `${shown} (${override})`;
}

/** " (current coverage: none 54, partial 41)" — levels that occur, in coverage order. */
function byCoverage(values, locale) {
  const parts = COVERAGE_LEVELS.map((level) => [level, values.filter((v) => v === level).length])
    .filter(([, n]) => n > 0)
    .map(([level, n]) => `${locale.coverage(level)} ${n}`);
  return parts.length ? ` (${locale.t('requests.open.byCoverage', { distribution: parts.join(', ') })})` : '';
}

function rank(coverage) {
  return coverage === 'none' ? 0 : 1; // none before partial, as in gap-analysis.md
}

function levelsToClose(gap, locale) {
  // "1 level" / "2 levels", decided by the same test the reports have always used.
  const key = gap > 1 ? 'common.levelsToClose.other' : 'common.levelsToClose.one';
  return gap > 0 ? ` (${locale.t(key, { count: gap })})` : '';
}

function statusBadge(reviewStatus, locale) {
  if (reviewStatus === 'unreviewed') return ` _(${locale.t('badge.unreviewed')})_`;
  if (reviewStatus === 'stale') return ` _(${locale.t('badge.stale')})_`;
  return '';
}
