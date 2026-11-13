/**
 * Target-profile logic: load/validate the spec, resolve the goal for each
 * Subcategory, and derive the gap view that the remediation deliverables and
 * the dashboard render.
 *
 * CSF 2.0 background: an Organizational Profile has TWO halves — the Current
 * Profile (what the organization achieves today; built by the report stage
 * from reviewed assessments) and the Target Profile (what it wants to achieve).
 * Comparing them yields the prioritized gaps an action plan addresses. This
 * module is the "second half": everything here is deterministic, offline code —
 * no AI is involved in deciding targets, gaps, or priorities.
 */

import Ajv from 'ajv';
import {
  targetSchema,
  NOT_APPLICABLE,
  PRIORITY_LEVELS,
  DEFAULT_PRIORITY,
  DEFAULT_BASELINE,
} from './target.schema.js';
import { resolveTiers } from './tiers.js';
import { coverageRank } from '../engine/coverage.js';
import { FUNCTION_ORDER, orderFunctions } from '../csf/order.js';
import { readJsonSafe, fileExists } from '../util/fsx.js';
import { TargetDataError } from '../core/errors.js';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(targetSchema);

/** A fresh spec with the given baseline and no overrides. */
export function newTargetSpec(now, baseline = DEFAULT_BASELINE) {
  return {
    schemaVersion: '1.0',
    createdAt: now,
    updatedAt: now,
    description: null,
    default: baseline,
    functions: {},
    categories: {},
    subcategories: {},
    priorities: {},
    notes: {},
    plan: {},
    tiers: { current: null, target: null, note: null },
  };
}

/**
 * Validate a spec object (already parsed). Throws TargetDataError on schema
 * violations; returns the spec with all optional maps normalized to {} so
 * callers can read/mutate without null checks.
 *
 * Normalization only ever sets top-level keys (missing maps, and `tiers`
 * completed to its three fields). Nested objects of the input are never
 * rewritten in place: `status` validates a shallow copy of the raw file and
 * then hashes the raw content, so an in-place change here would make an
 * unchanged target.json look edited.
 */
export function validateTargetSpec(data, sourceLabel = 'target profile') {
  const malformed = (what) =>
    new TargetDataError(`The ${sourceLabel} is malformed — ${what}.`, {
      hint: 'Fix the file by hand or recreate it with `csf-tool target`.',
    });

  if (!validate(data)) {
    const first = (validate.errors ?? [])[0];
    throw malformed(first ? describeSchemaError(first) : 'schema validation failed');
  }
  for (const key of ['functions', 'categories', 'subcategories', 'priorities', 'notes', 'plan']) {
    data[key] ??= {};
  }
  // A fresh object, so a partial `tiers` in the file is completed without
  // touching the object that was read from it.
  data.tiers = {
    current: data.tiers?.current ?? null,
    target: data.tiers?.target ?? null,
    note: data.tiers?.note ?? null,
  };
  // The schema checks the shape of a due date; whether that day exists is
  // checked here (a plan due on 2026-02-30 is a typo, not a date).
  for (const [id, entry] of Object.entries(data.plan)) {
    if (entry.due != null && !isCalendarDate(entry.due)) {
      throw malformed(`/plan/${id}/due "${entry.due}" is not a calendar date (use YYYY-MM-DD, e.g. 2026-03-31)`);
    }
  }
  return data;
}

/**
 * One schema violation as a sentence a person editing target.json by hand can
 * act on: which value, and what was expected (Ajv's stock messages for enum
 * and unknown-field errors name neither the choices nor the field).
 */
function describeSchemaError(error) {
  const where = error.instancePath || '(root)';
  if (error.keyword === 'enum') {
    return `${where} must be one of: ${error.params.allowedValues.join(', ')}`;
  }
  if (error.keyword === 'additionalProperties') {
    return `${where} has an unknown field "${error.params.additionalProperty}"`;
  }
  if (error.keyword === 'pattern' && where.endsWith('/due')) {
    return `${where} must be a date written as YYYY-MM-DD`;
  }
  if (where === '/tiers/current' || where === '/tiers/target') {
    return `${where} must be a CSF Tier number (1, 2, 3 or 4) or null`;
  }
  return `${where} ${error.message}`;
}

/** True when a YYYY-MM-DD string names a day that exists (leap years included). */
function isCalendarDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Build the date in UTC and read it back: an impossible day rolls over into
  // the next month, so the round trip no longer matches.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Load the spec from disk. Returns null when the file does not exist (a target
 * profile is optional); throws TargetDataError when it exists but is invalid.
 * When `csf` is provided, override/priority/note/plan keys that match nothing
 * in the framework are warned about (typos would otherwise silently do nothing).
 */
export async function loadTargetSpec(path, { csf, logger } = {}) {
  if (!(await fileExists(path))) return null;

  let data;
  try {
    data = await readJsonSafe(path);
  } catch (err) {
    throw new TargetDataError(`Target profile is not valid JSON: ${path} (${err.message})`, {
      hint: 'Fix the file by hand or recreate it with `csf-tool target`.',
    });
  }
  const spec = validateTargetSpec(data, `target profile (${path})`);
  if (csf && logger) warnUnknownKeys(spec, csf, logger);
  return spec;
}

function warnUnknownKeys(spec, csf, logger) {
  const functionIds = new Set(csf.functions.map((f) => f.id));
  const categoryIds = new Set(csf.subcategories.map((s) => s.categoryId));
  const subcategoryIds = new Set(csf.subcategories.map((s) => s.id));
  const anyId = (k) => functionIds.has(k) || categoryIds.has(k) || subcategoryIds.has(k);

  const complain = (mapName, key) =>
    logger.warn(`Target profile: "${mapName}" key "${key}" matches nothing in the CSF core — ignored.`);

  for (const k of Object.keys(spec.functions)) if (!functionIds.has(k)) complain('functions', k);
  for (const k of Object.keys(spec.categories)) if (!categoryIds.has(k)) complain('categories', k);
  for (const k of Object.keys(spec.subcategories)) if (!subcategoryIds.has(k)) complain('subcategories', k);
  for (const k of Object.keys(spec.priorities)) if (!anyId(k)) complain('priorities', k);
  for (const k of Object.keys(spec.notes)) if (!subcategoryIds.has(k)) complain('notes', k);
  for (const k of Object.keys(spec.plan)) if (!subcategoryIds.has(k)) complain('plan', k);
}

/**
 * Resolve the goal for one Subcategory: most specific override wins
 * (subcategory > category > function > baseline); same cascade for priority.
 * `sub` needs { id, categoryId, functionId }.
 */
export function resolveTarget(spec, sub) {
  const target =
    spec.subcategories?.[sub.id] ??
    spec.categories?.[sub.categoryId] ??
    spec.functions?.[sub.functionId] ??
    spec.default;
  const priority =
    spec.priorities?.[sub.id] ??
    spec.priorities?.[sub.categoryId] ??
    spec.priorities?.[sub.functionId] ??
    DEFAULT_PRIORITY;
  return { target, priority, note: spec.notes?.[sub.id] ?? null };
}

/**
 * Merge the Current Profile with the resolved targets into the canonical
 * target/gap view. ALL target-side deliverables (target-profile.json,
 * remediation-plan.md, the dashboard's target section) derive from this one
 * object, so they can never drift from one another — same principle as
 * buildProfile() for the current side.
 *
 * `gap` counts coverage levels still to climb (0..3); a met or exceeded target
 * is gap 0. "not-applicable" entries carry no gap or priority and are listed
 * separately by renderers. Implementation examples come from the CSF core (the
 * official NIST text) — they are the remediation plan's suggested actions.
 *
 * `plan` (owner, due, status, milestones — the human's tracking fields) is
 * added to EVERY entry, as an object or null, once the target profile records
 * at least one; a profile that records none gets no `plan` key at all, so its
 * deliverables are byte-identical to those of versions that predate the field.
 * The same holds for `tiers` (the organization's CSF Tier selection, with the
 * Tier names resolved): present on the view only when one is recorded.
 */
export function buildTargetView(profile, spec, csf) {
  const examplesById = new Map(
    (csf?.subcategories ?? []).map((s) => [s.id, s.implementationExamples ?? []]),
  );
  // Looked up per Subcategory of THIS profile: a `plan` key that matches
  // nothing (warned about on load, as "ignored") really is ignored, and so
  // cannot switch the plan fields on for every entry.
  const planById = new Map();
  for (const e of profile.subcategories) {
    const plan = planEntry(spec.plan?.[e.subcategory_id]);
    if (plan) planById.set(e.subcategory_id, plan);
  }

  const entries = profile.subcategories.map((e) => {
    const { target, priority, note } = resolveTarget(spec, {
      id: e.subcategory_id,
      categoryId: e.subcategory_id.split('-')[0],
      functionId: e.function_id,
    });
    const notApplicable = target === NOT_APPLICABLE;
    const gap = notApplicable ? 0 : Math.max(0, coverageRank(target) - coverageRank(e.coverage));
    return {
      subcategory_id: e.subcategory_id,
      function: e.function,
      function_id: e.function_id,
      category: e.category,
      outcome: e.outcome,
      current_coverage: e.coverage,
      target_coverage: target,
      priority: notApplicable ? null : priority,
      gap,
      met: !notApplicable && gap === 0,
      not_applicable: notApplicable,
      review_status: e.review_status,
      rationale: e.rationale,
      note,
      ...(planById.size > 0 ? { plan: planById.get(e.subcategory_id) ?? null } : {}),
      implementation_examples: examplesById.get(e.subcategory_id) ?? [],
    };
  });

  const applicable = entries.filter((e) => !e.not_applicable);
  const unmet = applicable.filter((e) => !e.met);

  const byFunction = orderFunctions(entries).map((fn) => {
    const es = entries.filter((e) => e.function === fn);
    const app = es.filter((e) => !e.not_applicable);
    const met = app.filter((e) => e.met).length;
    return {
      function: fn,
      total: es.length,
      applicable: app.length,
      met,
      unmet: app.length - met,
      notApplicable: es.length - app.length,
      pctMet: app.length ? Math.round((met / app.length) * 100) : 100,
    };
  });

  const tiers = resolveTiers(spec.tiers);

  return {
    baseline: spec.default,
    description: spec.description ?? null,
    createdAt: typeof spec.createdAt === 'string' ? spec.createdAt : null,
    updatedAt: typeof spec.updatedAt === 'string' ? spec.updatedAt : null,
    ...(tiers ? { tiers } : {}),
    summary: {
      total: entries.length,
      applicable: applicable.length,
      notApplicable: entries.length - applicable.length,
      met: applicable.length - unmet.length,
      unmet: unmet.length,
      pctMet: applicable.length
        ? Math.round(((applicable.length - unmet.length) / applicable.length) * 100)
        : 100,
      unmetByPriority: {
        high: unmet.filter((e) => e.priority === 'high').length,
        medium: unmet.filter((e) => e.priority === 'medium').length,
        low: unmet.filter((e) => e.priority === 'low').length,
      },
      byFunction,
    },
    entries,
  };
}

/**
 * One Subcategory's plan fields as the deliverables carry them: every field
 * present, null when the person left it out or blank. Returns null when
 * nothing at all is recorded, so an empty `{}` in target.json does not count
 * as a plan entry. Values are only trimmed — never defaulted or inferred.
 */
function planEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
  const plan = {
    owner: text(raw.owner),
    due: text(raw.due),
    status: text(raw.status),
    milestones: text(raw.milestones),
  };
  return Object.values(plan).some((value) => value != null) ? plan : null;
}

/**
 * The remediation plan's ordering, in one place so the Markdown plan and the
 * dashboard agree: priority first, then how far from the goal (bigger gap
 * first, lower current coverage breaking ties), then canonical Function order,
 * then id — fully deterministic.
 */
export function planOrder(entries) {
  const prio = (p) => {
    const i = PRIORITY_LEVELS.indexOf(p);
    return i < 0 ? PRIORITY_LEVELS.length : i;
  };
  const fnRank = (name) => {
    const i = FUNCTION_ORDER.indexOf(name);
    return i < 0 ? 99 : i;
  };
  return [...entries].sort(
    (a, b) =>
      prio(a.priority) - prio(b.priority) ||
      b.gap - a.gap ||
      coverageRank(a.current_coverage) - coverageRank(b.current_coverage) ||
      fnRank(a.function) - fnRank(b.function) ||
      a.subcategory_id.localeCompare(b.subcategory_id),
  );
}

export { NOT_APPLICABLE, PRIORITY_LEVELS, DEFAULT_PRIORITY, DEFAULT_BASELINE };
