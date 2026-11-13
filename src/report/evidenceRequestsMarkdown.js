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
 */

import { planOrder } from '../target/targetProfile.js';
import { PRIORITY_LEVELS } from '../target/target.schema.js';
import { isGap, COVERAGE_LEVELS } from '../engine/coverage.js';
import { orderFunctions } from '../csf/order.js';
import { compareText } from '../util/compare.js';
import { mdCode, mdLine } from './markdownText.js';

const PURPOSE =
  'An interview and collection guide for the outcomes this assessment could not demonstrate at the required ' +
  'level. An outcome is listed because the documents provided did not show it — not because the organization ' +
  'necessarily lacks the practice: absence of evidence is not absence of a control. To close an item, collect ' +
  'the documents or records, add them to the documents folder, and re-run the pipeline (ingest, analyze, ' +
  'review, report). The assessment gives a coverage level above "none" only when a quote verified verbatim ' +
  'against the documents supports it; a reviewer then validates each level and may override it.';

const SOURCES =
  'The three questions are the same for every outcome and mirror the assessment\'s rubric. The checklists are the ' +
  'official NIST CSF 2.0 Implementation Examples (public domain, source: NIST CPRT), quoted verbatim: ' +
  'illustrative, not an exhaustive list and not a baseline of required actions. Rationales are the assessment\'s ' +
  'AI-generated reasoning.';

/** Fixed for every item, on purpose (see the module comment). */
export const EVIDENCE_QUESTIONS = [
  'Is this outcome achieved today, and who is accountable for it?',
  'Where is it documented, and when was that documentation last reviewed?',
  'Which records show it operating in practice (not only that it is required)?',
];

const EXAMPLES_LABEL =
  'Evidence that could demonstrate it — documents or records showing practices such as these in operation ' +
  '(NIST CSF 2.0 Implementation Examples, verbatim; illustrative, not exhaustive, not a required baseline):';

/**
 * @param {object} profile the Current Profile from buildProfile()
 * @param {object} [options]
 * @param {object|null} [options.csf] loaded CSF core (source of the Implementation Examples)
 * @param {object|null} [options.targetView] the target view from buildTargetView(), if any
 * @returns {string} Markdown
 */
export function renderEvidenceRequestsMarkdown(profile, { csf = null, targetView = null } = {}) {
  const entryById = new Map(profile.subcategories.map((e) => [e.subcategory_id, e]));
  const examplesById = implementationExamples(csf, targetView);
  const unmet = targetView ? planOrder(targetView.entries.filter((t) => !t.not_applicable && !t.met)) : [];
  const gaps = targetView ? [] : profile.subcategories.filter((e) => isGap(e.coverage));
  const total = targetView ? unmet.length : gaps.length;
  const out = [];

  out.push('# NIST CSF 2.0 — Evidence Request List');
  out.push('');
  out.push(`> ${PURPOSE}`);
  out.push('');
  out.push(`> ${SOURCES}`);
  out.push('');
  if (profile.summary.unreviewed > 0 || profile.summary.stale > 0) {
    out.push(
      `> **DRAFT — not fully reviewed.** ${profile.summary.unreviewed} unreviewed and ${profile.summary.stale} ` +
        'stale item(s) remain. A human must validate every item before the coverage levels this list is based ' +
        'on are authoritative.',
    );
    out.push('');
  }
  const caveat = analysisCaveat(profile);
  if (caveat) {
    out.push(`> **Note.** ${caveat}`);
    out.push('');
  }

  out.push('## Overview');
  out.push('');
  out.push(`- Generated: ${profile.generatedAt}`);
  if (targetView) {
    const s = targetView.summary;
    out.push(
      `- Scope: the ${count(total, 'applicable outcome')} that ${total === 1 ? 'does' : 'do'} not meet ` +
        `${total === 1 ? 'its' : 'their'} target, in the same order and numbering as remediation-plan.md`,
    );
    out.push(
      `- Not listed: ${s.met} at or above target` +
        (s.notApplicable ? `, ${s.notApplicable} scoped out as not-applicable` : ''),
    );
  } else {
    out.push(
      `- Scope: the ${count(total, 'outcome')} whose current coverage is none or partial (no target profile ` +
        'is set), grouped by Function',
    );
    out.push(`- Not listed: ${profile.subcategories.length - total} substantially or fully covered`);
  }
  out.push(`- Open requests: ${total}${byCoverage(targetView ? unmet.map((t) => t.current_coverage) : gaps.map((e) => e.coverage))}`);
  out.push('');

  out.push('## Evidence requests');
  out.push('');
  if (total === 0) {
    out.push(
      targetView
        ? '_No open evidence requests — every applicable outcome meets its target._'
        : '_No open evidence requests — every outcome is at least substantially covered._',
    );
    out.push('');
  } else if (targetView) {
    let n = 0;
    for (const prio of PRIORITY_LEVELS) {
      const items = unmet.filter((t) => t.priority === prio);
      if (items.length === 0) continue;
      out.push(`### ${prio.charAt(0).toUpperCase()}${prio.slice(1)} priority (${items.length})`);
      out.push('');
      for (const t of items) {
        n++;
        const e = entryById.get(t.subcategory_id) ?? null;
        pushItem(out, {
          heading:
            `${n}. ${t.subcategory_id} — ${t.current_coverage} → ${t.target_coverage}` +
            `${levelsToClose(t.gap)}${statusBadge(t.review_status)}`,
          functionName: t.function,
          category: t.category,
          outcome: t.outcome,
          coverageLine: `${coverageWithOverride(t.current_coverage, e)}; target: ${t.target_coverage}; priority: ${t.priority}`,
          reviewStatus: t.review_status,
          rationale: t.rationale,
          entry: e,
          examples: examplesById.get(t.subcategory_id) ?? [],
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
      out.push(`### ${fn} (${items.length})`);
      out.push('');
      for (const e of items) {
        pushItem(out, {
          heading: `${e.subcategory_id} — ${e.coverage}${statusBadge(e.review_status)}`,
          functionName: e.function,
          category: e.category,
          outcome: e.outcome,
          coverageLine: coverageWithOverride(e.coverage, e),
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
  out.push(
    'An item leaves this list when a later assessment demonstrates the outcome at the required level with ' +
      'verified quotes' +
      (targetView ? ', or when the target profile lowers its target or scopes it out' : '') +
      '. Items marked UNREVIEWED or STALE still require human validation.',
  );
  out.push('');
  return out.join('\n');
}

function pushItem(out, { heading, functionName, category, outcome, coverageLine, reviewStatus, rationale, entry, examples }) {
  out.push(`#### ${heading}`);
  out.push('');
  out.push(`- Function / Category: ${functionName} / ${category}`);
  out.push(`- Outcome: ${outcome}`);
  out.push(`- Current coverage: ${coverageLine}`);
  out.push(`- Review status: ${reviewStatus}`);
  // Free text is held to one line: the lines that follow carry official NIST
  // text, and a rationale must not be able to add a look-alike of its own.
  out.push(`- Assessment rationale: ${mdLine(rationale)}`);
  if (entry?.reviewer_notes) out.push(`- Reviewer note: ${mdLine(entry.reviewer_notes)}`);
  const quoted = quotedDocuments(entry);
  if (quoted) out.push(`- Documents already quoted: ${quoted}`);
  out.push('- Questions to ask:');
  EVIDENCE_QUESTIONS.forEach((q, i) => out.push(`  ${i + 1}. ${q}`));
  if (examples.length > 0) {
    out.push(`- ${EXAMPLES_LABEL}`);
    // Verbatim and in NIST's order: never paraphrased, reordered or trimmed.
    for (const example of examples) out.push(`  - [ ] ${example}`);
  } else {
    out.push('- Evidence that could demonstrate it: (no Implementation Examples provided by this CSF core export)');
  }
  out.push('');
}

/**
 * The header says an outcome is listed because the documents did not show it.
 * That is only true of outcomes the analysis actually examined, against the
 * documents as they are now — so an unfinished or outdated analysis is said
 * up front rather than left to read as a finding.
 */
function analysisCaveat(profile) {
  const analysis = profile.activity?.analysis;
  if (!analysis) return null;
  if (analysis.status === 'stale') {
    return (
      `The assessment is out of date with its inputs (${(analysis.reasons ?? []).join('; ')}). Re-run the ` +
      'analyze stage before collecting evidence against this list: it may ask for something the current ' +
      'documents already show.'
    );
  }
  if (analysis.assessed < analysis.total) {
    return (
      `The analysis is incomplete: ${analysis.assessed} of ${analysis.total} outcomes have been assessed. An ` +
      'outcome that has not been assessed is listed with coverage "none" although no document was examined ' +
      'for it; run the analyze stage to complete it.'
    );
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
function quotedDocuments(entry) {
  const counts = new Map();
  for (const ev of entry?.evidence ?? []) {
    if (ev?.verified === false || typeof ev?.source_file !== 'string' || ev.source_file === '') continue;
    counts.set(ev.source_file, (counts.get(ev.source_file) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([name, n]) => `${mdCode(name)} (${count(n, 'quote')})`)
    .join(', ');
}

function coverageWithOverride(coverage, entry) {
  return entry?.human_coverage != null
    ? `${coverage} (reviewer override: ${entry.ai_coverage} → ${entry.human_coverage})`
    : coverage;
}

/** " (none 54, partial 41)" — levels that occur, in coverage order. */
function byCoverage(values) {
  const parts = COVERAGE_LEVELS.map((level) => [level, values.filter((v) => v === level).length])
    .filter(([, n]) => n > 0)
    .map(([level, n]) => `${level} ${n}`);
  return parts.length ? ` (current coverage: ${parts.join(', ')})` : '';
}

function rank(coverage) {
  return coverage === 'none' ? 0 : 1; // none before partial, as in gap-analysis.md
}

function levelsToClose(gap) {
  return gap > 0 ? ` (${gap} level${gap > 1 ? 's' : ''} to close)` : '';
}

function statusBadge(reviewStatus) {
  if (reviewStatus === 'unreviewed') return ' _(⚠ UNREVIEWED)_';
  if (reviewStatus === 'stale') return ' _(⚠ STALE REVIEW)_';
  return '';
}

function count(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
