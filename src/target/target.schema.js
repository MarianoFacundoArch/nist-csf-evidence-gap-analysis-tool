/**
 * JSON Schema for the target-profile specification file (<work-dir>/target.json).
 *
 * The spec is deliberately small and hand-editable: a baseline goal for every
 * Subcategory plus sparse overrides at Function / Category / Subcategory
 * granularity (most specific wins). "not-applicable" is a valid OVERRIDE — an
 * organization may legitimately scope an outcome out (e.g. no OT systems) — but
 * not a valid baseline: a whole assessment can't be out of scope.
 *
 * Priorities steer the remediation plan's ordering; keys may be a Function id
 * ("GV"), a Category id ("PR.AA"), or a Subcategory id ("PR.AA-05"), resolved
 * most-specific-first. Notes record WHY a target/priority was chosen and are
 * carried into the deliverables (notes are per-Subcategory).
 *
 * `plan` holds the human-owned tracking fields of the action plan — owner, due
 * date, status, milestones — keyed by Subcategory id. They live HERE, in the
 * human-owned file, because the deliverables are regenerated on every run: a
 * generated file cannot be where a person records a decision. The tool never
 * fills them in; it only carries them into the plan and the POA&M export.
 *
 * `tiers` records the organization's CSF Tier selection (1..4, current and
 * target) with an optional note. A Tier is chosen by the organization, not
 * computed from coverage (see tiers.js), so it is recorded here like every
 * other human decision.
 */

import { COVERAGE_LEVELS } from '../engine/coverage.js';

export const NOT_APPLICABLE = 'not-applicable';
export const TARGET_LEVELS = [...COVERAGE_LEVELS, NOT_APPLICABLE];
export const PRIORITY_LEVELS = ['high', 'medium', 'low'];
export const DEFAULT_PRIORITY = 'medium';
export const DEFAULT_BASELINE = 'substantial';
export const PLAN_STATUSES = ['open', 'in-progress', 'done', 'risk-accepted'];
// What an unmet target is until a person says otherwise.
export const DEFAULT_PLAN_STATUS = 'open';

const overrideMap = {
  type: 'object',
  additionalProperties: { type: 'string', enum: TARGET_LEVELS },
};

export const targetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['default'],
  properties: {
    schemaVersion: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    description: { type: ['string', 'null'] },
    default: { type: 'string', enum: COVERAGE_LEVELS },
    functions: overrideMap,
    categories: overrideMap,
    subcategories: overrideMap,
    priorities: {
      type: 'object',
      additionalProperties: { type: 'string', enum: PRIORITY_LEVELS },
    },
    notes: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    plan: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        properties: {
          owner: { type: 'string' },
          // Shape only. That the date exists in the calendar (no 2026-02-30)
          // is checked in code by validateTargetSpec: JSON Schema cannot
          // express it without a format plug-in, i.e. a dependency.
          due: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
          status: { type: 'string', enum: PLAN_STATUSES },
          milestones: { type: 'string' },
        },
      },
    },
    tiers: {
      type: 'object',
      additionalProperties: false,
      properties: {
        current: { type: ['integer', 'null'], minimum: 1, maximum: 4 },
        target: { type: ['integer', 'null'], minimum: 1, maximum: 4 },
        note: { type: ['string', 'null'] },
      },
    },
  },
};
