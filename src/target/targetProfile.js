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
  };
}

/**
 * Validate a spec object (already parsed). Throws TargetDataError on schema
 * violations; returns the spec with all optional maps normalized to {} so
 * callers can read/mutate without null checks.
 */
export function validateTargetSpec(data, sourceLabel = 'target profile') {
  if (!validate(data)) {
    const first = (validate.errors ?? [])[0];
    throw new TargetDataError(
      `The ${sourceLabel} is malformed — ${first ? `${first.instancePath || '(root)'} ${first.message}` : 'schema validation failed'}.`,
      { hint: 'Fix the file by hand or recreate it with `csf-tool target`.' },
    );
  }
  for (const key of ['functions', 'categories', 'subcategories', 'priorities', 'notes']) {
    data[key] ??= {};
  }
  return data;
}

/**
 * Load the spec from disk. Returns null when the file does not exist (a target
 * profile is optional); throws TargetDataError when it exists but is invalid.
 * When `csf` is provided, override/priority/note keys that match nothing in the
 * framework are warned about (typos would otherwise silently do nothing).
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
 */
export function buildTargetView(profile, spec, csf) {
  const examplesById = new Map(
    (csf?.subcategories ?? []).map((s) => [s.id, s.implementationExamples ?? []]),
  );

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

  return {
    baseline: spec.default,
    description: spec.description ?? null,
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
