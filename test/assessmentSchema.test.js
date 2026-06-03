import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAssessment } from '../src/engine/assessment.schema.js';

const base = {
  subcategory_id: 'GV.PO-01',
  coverage: 'partial',
  confidence: 0.5,
  evidence: [{ source_file: 'a.md', quote: 'something' }],
  rationale: 'because',
  needs_review: true,
};

test('tolerates "none" returned WITH a quote (a common small-model quirk)', () => {
  const r = validateAssessment({ ...base, coverage: 'none' });
  assert.equal(r.ok, true);
  assert.equal(r.value.coverage, 'none'); // verifier later clears the evidence
});

test('tolerates a high coverage with empty evidence (verifier downgrades later)', () => {
  const r = validateAssessment({ ...base, coverage: 'substantial', evidence: [] });
  assert.equal(r.ok, true);
});

test('normalizes coverage case and coerces confidence/needs_review', () => {
  const r = validateAssessment({ ...base, coverage: 'Partial', confidence: '0.8', needs_review: 'true' });
  assert.equal(r.ok, true);
  assert.equal(r.value.coverage, 'partial');
  assert.equal(r.value.confidence, 0.8);
  assert.equal(r.value.needs_review, true);
});

test('clamps out-of-range confidence and drops empty/malformed evidence items', () => {
  const r = validateAssessment({
    ...base,
    confidence: 5,
    evidence: [{ source_file: 'a.md', quote: '' }, { source_file: '', quote: 'x' }, 'garbage'],
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.confidence, 1);
  assert.deepEqual(r.value.evidence, []); // all three were malformed/empty
});

test('strips unknown keys rather than rejecting them', () => {
  const r = validateAssessment({ ...base, explanation: 'extra', foo: 123 });
  assert.equal(r.ok, true);
  assert.equal(r.value.explanation, undefined);
});

test('still rejects a genuinely invalid coverage value', () => {
  const r = validateAssessment({ ...base, coverage: 'maybe' });
  assert.equal(r.ok, false);
});

test('still rejects a response missing a required field', () => {
  const { rationale, ...noRationale } = base;
  const r = validateAssessment(noRationale);
  assert.equal(r.ok, false);
});
