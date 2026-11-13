/**
 * Renders poam.csv — a POA&M-style tracker export (Plan of Action &
 * Milestones): one row per open item, with owner, due date, status and
 * milestones. remediation-plan.md is the narrative; this is the table that
 * gets handed over and tracked. It does not follow, or claim to conform to,
 * any specific agency's POA&M template.
 *
 * The tool never invents an owner or a date. Those are human decisions, and
 * this file is regenerated on every run, so it cannot be where a person
 * records them: they live in the human-owned target.json (`plan`) and are
 * carried into this export from there. A blank owner or due cell is correct
 * output — nobody has decided yet.
 *
 * Rows:
 *  - the unmet applicable targets, in the remediation plan's order (planOrder);
 *  - then every outcome that still has a `plan` entry although its target is
 *    now met or scoped out, marked through `target_met` and the wording of
 *    `weakness`, so an item someone was tracking never silently vanishes.
 *
 * `poam_id` is derived from the Subcategory id, never from the row position: a
 * positional number would renumber every item whenever a priority changes, and
 * break whatever tracker the rows were imported into.
 *
 * Cells hold human- and document-derived text, so serialization goes through
 * util/csv.js (RFC-4180 quoting and the spreadsheet formula-injection guard).
 */

import { toCsv } from '../util/csv.js';
import { planOrder } from '../target/targetProfile.js';
import { DEFAULT_PLAN_STATUS } from '../target/target.schema.js';

export const POAM_HEADER = [
  'poam_id',
  'subcategory_id',
  'function',
  'category',
  'weakness',
  'current_coverage',
  'target_coverage',
  'levels_to_close',
  'priority',
  'target_met',
  'review_status',
  'status',
  'owner',
  'due',
  'milestones',
  'nist_implementation_examples',
  'assessment_rationale',
  'target_note',
  'report_date',
];

/** Stable identifier of the POA&M item for a Subcategory. */
export function poamId(subcategoryId) {
  return `POAM-${subcategoryId}`;
}

/**
 * The rows of the export as objects keyed by POAM_HEADER.
 * @param {object} profile the Current Profile from buildProfile()
 * @param {object} view the target view from buildTargetView()
 * @returns {Array<Record<string, string|number>>}
 */
export function buildPoamRows(profile, view) {
  const reportDate = datePart(profile.generatedAt);
  const open = planOrder(view.entries.filter((e) => !e.not_applicable && !e.met));
  const closed = planOrder(view.entries.filter((e) => (e.not_applicable || e.met) && e.plan));

  const row = (e, isOpen) => ({
    poam_id: poamId(e.subcategory_id),
    subcategory_id: e.subcategory_id,
    function: e.function,
    category: e.category,
    weakness: weakness(e),
    current_coverage: e.current_coverage,
    target_coverage: e.target_coverage,
    levels_to_close: e.gap,
    priority: e.priority ?? '',
    target_met: e.not_applicable ? 'n/a' : e.met ? 'yes' : 'no',
    review_status: e.review_status,
    // The person's value; an unmet target nobody has triaged yet is "open".
    // A closed row keeps whatever was recorded and is never set to "done"
    // on the person's behalf.
    status: e.plan?.status ?? (isOpen ? DEFAULT_PLAN_STATUS : ''),
    owner: e.plan?.owner ?? '',
    due: e.plan?.due ?? '',
    milestones: e.plan?.milestones ?? '',
    // NIST's Implementation Examples, verbatim. The column is named for what
    // it holds, so the text keeps its source once the file leaves this folder.
    // Left empty once the target is met or scoped out: no open gap remains.
    nist_implementation_examples: isOpen ? e.implementation_examples.join(' | ') : '',
    assessment_rationale: e.rationale ?? '',
    target_note: e.note ?? '',
    // The date of this report, i.e. of the assessment in which the gap is
    // observed. It is deliberately not called "identified on": the tool keeps
    // no history, so it cannot say when a gap first appeared, and the value
    // moves with every report run.
    report_date: isOpen ? reportDate : '',
  });

  return [...open.map((e) => row(e, true)), ...closed.map((e) => row(e, false))];
}

/**
 * @param {object} profile the Current Profile from buildProfile()
 * @param {object} view the target view from buildTargetView()
 * @returns {string} CSV (CRLF, UTF-8 BOM), one row per POA&M item
 */
export function renderPoamCsv(profile, view) {
  const rows = buildPoamRows(profile, view).map((r) => POAM_HEADER.map((column) => r[column]));
  return toCsv(POAM_HEADER, rows);
}

/** Fixed template around the official outcome text; no free-form wording. */
function weakness(e) {
  if (e.not_applicable) return `Outcome marked not-applicable in the target profile: ${e.outcome}`;
  if (e.met) return `Target level met in the current assessment: ${e.outcome}`;
  return `Outcome not demonstrated at the target level: ${e.outcome}`;
}

/** "2026-01-01T00:00:00.000Z" -> "2026-01-01"; anything else -> "". */
function datePart(timestamp) {
  const m = /^\d{4}-\d{2}-\d{2}/.exec(String(timestamp ?? ''));
  return m ? m[0] : '';
}
