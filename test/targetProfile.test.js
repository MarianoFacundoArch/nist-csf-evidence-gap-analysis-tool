import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  newTargetSpec,
  validateTargetSpec,
  loadTargetSpec,
  resolveTarget,
  buildTargetView,
  planOrder,
} from '../src/target/targetProfile.js';
import { TargetDataError } from '../src/core/errors.js';
import { buildProfile } from '../src/report/profile.js';

const NOW = '2026-01-01T00:00:00.000Z';

/** CSF fixture shaped like the loader output (functionId/categoryId enriched). */
const CSF = {
  frameworkVersion: 'CSF 2.0',
  sample: false,
  functions: [
    { id: 'GV', name: 'GOVERN' },
    { id: 'PR', name: 'PROTECT' },
  ],
  subcategories: [
    sub('GV.OC-01', 'Mission understood', 'GV', 'GOVERN', 'GV.OC', 'Organizational Context (GV.OC)', ['Share the mission']),
    sub('GV.OC-02', 'Stakeholders understood', 'GV', 'GOVERN', 'GV.OC', 'Organizational Context (GV.OC)', ['Identify stakeholders', 'Review expectations']),
    sub('PR.AA-01', 'Identities managed', 'PR', 'PROTECT', 'PR.AA', 'Identity Management (PR.AA)', ['Maintain identity inventory']),
    sub('PR.AA-05', 'Access enforced', 'PR', 'PROTECT', 'PR.AA', 'Identity Management (PR.AA)', ['Require MFA']),
  ],
};

function sub(id, outcome, fnId, fnName, catId, cat, examples) {
  return {
    id, outcome,
    function: fnName, category: cat,
    functionId: fnId, functionName: fnName, categoryId: catId,
    implementationExamples: examples,
  };
}

function assessment(id, coverage, { needsReview = false } = {}) {
  return {
    subcategory_id: id,
    coverage,
    confidence: 0.9,
    evidence: coverage === 'none' ? [] : [{ source_file: 'doc.md', page: null, score: 0.5, quote: 'quote', verified: true }],
    rationale: `rationale for ${id}`,
    needs_review: needsReview,
    verification: { quotes_checked: 1, quotes_verified: 1, downgraded: false },
  };
}

const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' } },
  now: () => NOW,
};

function makeProfile(coverages) {
  const assessments = {};
  for (const [id, cov] of Object.entries(coverages)) assessments[id] = assessment(id, cov);
  return buildProfile(CTX, { csf: CSF, assessments, reviews: {}, meta: {} });
}

test('newTargetSpec starts at the substantial baseline with empty overrides', () => {
  const spec = newTargetSpec(NOW);
  assert.equal(spec.default, 'substantial');
  assert.deepEqual(spec.functions, {});
  assert.deepEqual(spec.priorities, {});
  assert.equal(spec.createdAt, NOW);
});

test('validateTargetSpec normalizes optional maps and rejects bad values', () => {
  const ok = validateTargetSpec({ default: 'full' });
  assert.deepEqual(ok.subcategories, {});
  assert.throws(() => validateTargetSpec({ default: 'total' }), TargetDataError);
  assert.throws(() => validateTargetSpec({}), TargetDataError);
  assert.throws(
    () => validateTargetSpec({ default: 'full', priorities: { GV: 'urgent' } }),
    TargetDataError,
  );
  // not-applicable is an override, never a baseline.
  assert.throws(() => validateTargetSpec({ default: 'not-applicable' }), TargetDataError);
});

test('resolveTarget cascades most-specific-first for target and priority', () => {
  const spec = validateTargetSpec({
    default: 'substantial',
    functions: { PR: 'partial' },
    categories: { 'PR.AA': 'full' },
    subcategories: { 'PR.AA-05': 'not-applicable' },
    priorities: { PR: 'low', 'PR.AA': 'high', 'PR.AA-05': 'medium' },
    notes: { 'PR.AA-05': 'out of scope' },
  });
  const s = (id) => CSF.subcategories.find((x) => x.id === id);

  assert.equal(resolveTarget(spec, s('GV.OC-01')).target, 'substantial'); // baseline
  assert.equal(resolveTarget(spec, s('PR.AA-01')).target, 'full'); // category beats function
  assert.equal(resolveTarget(spec, s('PR.AA-05')).target, 'not-applicable'); // subcategory beats all
  assert.equal(resolveTarget(spec, s('GV.OC-01')).priority, 'medium'); // default priority
  assert.equal(resolveTarget(spec, s('PR.AA-01')).priority, 'high'); // category beats function
  assert.equal(resolveTarget(spec, s('PR.AA-05')).priority, 'medium'); // own override
  assert.equal(resolveTarget(spec, s('PR.AA-05')).note, 'out of scope');
});

test('buildTargetView computes gaps, exclusions, and per-function rollups', () => {
  const profile = makeProfile({
    'GV.OC-01': 'substantial', // met (baseline substantial)
    'GV.OC-02': 'none',        // gap 2
    'PR.AA-01': 'partial',     // target full via category => gap 2
    'PR.AA-05': 'none',        // not-applicable
  });
  const spec = validateTargetSpec({
    default: 'substantial',
    categories: { 'PR.AA': 'full' },
    subcategories: { 'PR.AA-05': 'not-applicable' },
    priorities: { 'GV.OC-02': 'high' },
  });
  const view = buildTargetView(profile, spec, CSF);

  assert.equal(view.summary.total, 4);
  assert.equal(view.summary.notApplicable, 1);
  assert.equal(view.summary.applicable, 3);
  assert.equal(view.summary.met, 1);
  assert.equal(view.summary.unmet, 2);
  assert.deepEqual(view.summary.unmetByPriority, { high: 1, medium: 1, low: 0 });

  const byId = Object.fromEntries(view.entries.map((e) => [e.subcategory_id, e]));
  assert.equal(byId['GV.OC-01'].met, true);
  assert.equal(byId['GV.OC-01'].gap, 0);
  assert.equal(byId['GV.OC-02'].gap, 2);
  assert.equal(byId['PR.AA-01'].target_coverage, 'full');
  assert.equal(byId['PR.AA-05'].not_applicable, true);
  assert.equal(byId['PR.AA-05'].priority, null);
  // A current coverage above target is met, never a negative gap.
  assert.ok(view.entries.every((e) => e.gap >= 0));
  // NIST implementation examples ride along from the CSF core.
  assert.deepEqual(byId['PR.AA-05'].implementation_examples, ['Require MFA']);

  // Function rollup: canonical order, correct percentages.
  assert.deepEqual(view.summary.byFunction.map((f) => f.function), ['GOVERN', 'PROTECT']);
  const gov = view.summary.byFunction[0];
  assert.equal(gov.met, 1);
  assert.equal(gov.pctMet, 50);
  const pr = view.summary.byFunction[1];
  assert.equal(pr.applicable, 1);
  assert.equal(pr.notApplicable, 1);
  assert.equal(pr.pctMet, 0);
});

test('planOrder ranks by priority, then distance from target, deterministically', () => {
  const entries = [
    { subcategory_id: 'B-01', function: 'PROTECT', priority: 'medium', gap: 3, current_coverage: 'none' },
    { subcategory_id: 'A-01', function: 'GOVERN', priority: 'high', gap: 1, current_coverage: 'partial' },
    { subcategory_id: 'A-02', function: 'GOVERN', priority: 'high', gap: 2, current_coverage: 'partial' },
    { subcategory_id: 'C-01', function: 'RECOVER', priority: 'low', gap: 3, current_coverage: 'none' },
    { subcategory_id: 'A-03', function: 'GOVERN', priority: 'high', gap: 2, current_coverage: 'none' },
  ];
  const ordered = planOrder(entries).map((e) => e.subcategory_id);
  // high before medium before low; bigger gap first; lower current first; id tiebreak.
  assert.deepEqual(ordered, ['A-03', 'A-02', 'A-01', 'B-01', 'C-01']);
});

test('loadTargetSpec: absent file is null, malformed file is a friendly error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'csf-target-test-'));
  try {
    assert.equal(await loadTargetSpec(join(dir, 'missing.json')), null);

    const badJson = join(dir, 'bad.json');
    await writeFile(badJson, '{ not json');
    await assert.rejects(loadTargetSpec(badJson), TargetDataError);

    const badSchema = join(dir, 'bad-schema.json');
    await writeFile(badSchema, JSON.stringify({ default: 'everything' }));
    await assert.rejects(loadTargetSpec(badSchema), TargetDataError);

    const good = join(dir, 'good.json');
    await writeFile(good, JSON.stringify({ default: 'full', functions: { GV: 'partial' } }));
    const spec = await loadTargetSpec(good);
    assert.equal(spec.default, 'full');
    assert.deepEqual(spec.notes, {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadTargetSpec warns about keys that match nothing in the CSF core', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'csf-target-test-'));
  try {
    const p = join(dir, 'typo.json');
    await writeFile(p, JSON.stringify({
      default: 'substantial',
      subcategories: { 'GV.OC-99': 'full' },
      priorities: { 'XX': 'high' },
    }));
    const warnings = [];
    await loadTargetSpec(p, { csf: CSF, logger: { warn: (m) => warnings.push(m) } });
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /GV\.OC-99/);
    assert.match(warnings[1], /"XX"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
