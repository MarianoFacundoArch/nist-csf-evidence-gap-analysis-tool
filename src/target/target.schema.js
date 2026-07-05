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
 */

import { COVERAGE_LEVELS } from '../engine/coverage.js';

export const NOT_APPLICABLE = 'not-applicable';
export const TARGET_LEVELS = [...COVERAGE_LEVELS, NOT_APPLICABLE];
export const PRIORITY_LEVELS = ['high', 'medium', 'low'];
export const DEFAULT_PRIORITY = 'medium';
export const DEFAULT_BASELINE = 'substantial';

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
  },
};
