import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProfile } from '../src/report/profile.js';
import {
  newTargetSpec,
  validateTargetSpec,
  loadTargetSpec,
  buildTargetView,
  planOrder,
} from '../src/target/targetProfile.js';
import { PLAN_STATUSES, DEFAULT_PLAN_STATUS } from '../src/target/target.schema.js';
import { renderPoamCsv, buildPoamRows, poamId, POAM_HEADER } from '../src/report/poamCsv.js';
import { renderRemediationMarkdown } from '../src/report/remediationMarkdown.js';
import { buildTargetProfile } from '../src/report/targetJson.js';
import { TargetDataError } from '../src/core/errors.js';

const NOW = '2026-04-15T09:30:00.000Z';

const CSF = {
  frameworkVersion: 'CSF 2.0',
  sample: false,
  functions: [
    { id: 'GV', name: 'GOVERN' },
    { id: 'PR', name: 'PROTECT' },
    { id: 'RC', name: 'RECOVER' },
  ],
  subcategories: [
    sub('GV.OC-01', 'Mission understood', 'GOVERN', 'Organizational Context (GV.OC)', ['Share the mission']),
    sub('GV.OC-02', 'Stakeholders understood', 'GOVERN', 'Organizational Context (GV.OC)', ['Identify stakeholders', 'Review expectations, e.g., yearly']),
    sub('PR.AA-01', 'Identities managed', 'PROTECT', 'Identity Management (PR.AA)', ['Maintain identity inventory']),
    sub('PR.AA-05', 'Access enforced', 'PROTECT', 'Identity Management (PR.AA)', ['Require MFA']),
    sub('RC.RP-01', 'Recovery plan executed', 'RECOVER', 'Incident Recovery Plan Execution (RC.RP)', []),
  ],
};

function sub(id, outcome, fnName, category, examples) {
  return {
    id, outcome, function: fnName, category,
    functionId: id.split('.')[0], functionName: fnName, categoryId: id.split('-')[0],
    implementationExamples: examples,
  };
}

function assessment(id, coverage) {
  return {
    subcategory_id: id,
    coverage,
    confidence: 0.8,
    evidence: coverage === 'none'
      ? []
      : [{ source_file: 'policy.md', page: null, score: 0.5, quote: `evidence quote for ${id}`, verified: true }],
    rationale: `rationale for ${id}`,
    needs_review: false,
    verification: { quotes_checked: 1, quotes_verified: 1, downgraded: false },
  };
}

const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' } },
  now: () => NOW,
};

const COVERAGE = {
  'GV.OC-01': 'substantial', // meets the baseline
  'GV.OC-02': 'none',
  'PR.AA-01': 'partial',
  'PR.AA-05': 'none',
  'RC.RP-01': 'partial',
};

function profileOf(coverage = COVERAGE) {
  const assessments = {};
  for (const [id, cov] of Object.entries(coverage)) assessments[id] = assessment(id, cov);
  return buildProfile(CTX, { csf: CSF, assessments, reviews: {}, meta: {} });
}

function build(target, coverage = COVERAGE) {
  const profile = profileOf(coverage);
  const view = buildTargetView(profile, validateTargetSpec(target), CSF);
  return { profile, view };
}

/** Minimal RFC-4180 reader, enough to check what a spreadsheet would see. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' && body[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += ch;
  }
  return rows;
}

function records(csv) {
  const [header, ...rows] = parseCsv(csv);
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/* --------------------------- plan in target.json --------------------------- */

test('plan: newTargetSpec includes it and validateTargetSpec normalizes a missing one', () => {
  assert.deepEqual(newTargetSpec(NOW).plan, {});
  assert.deepEqual(validateTargetSpec({ default: 'full' }).plan, {});
  assert.deepEqual(PLAN_STATUSES, ['open', 'in-progress', 'done', 'risk-accepted']);
  assert.equal(DEFAULT_PLAN_STATUS, 'open');
});

test('plan: every field is optional, and a full entry validates', () => {
  const spec = validateTargetSpec({
    default: 'substantial',
    plan: {
      'PR.AA-05': { owner: 'IT lead', due: '2026-06-30', status: 'in-progress', milestones: 'Pilot, then roll out.' },
      'GV.OC-02': {},
      'PR.AA-01': { status: 'risk-accepted' },
    },
  });
  assert.equal(spec.plan['PR.AA-05'].due, '2026-06-30');
  for (const status of PLAN_STATUSES) {
    assert.doesNotThrow(() => validateTargetSpec({ default: 'full', plan: { 'PR.AA-05': { status } } }));
  }
});

test('plan: bad values are rejected with a message that says what to fix', () => {
  const bad = (plan) => {
    try {
      validateTargetSpec({ default: 'substantial', plan });
    } catch (err) {
      assert.ok(err instanceof TargetDataError, 'a typed, explainable error');
      assert.match(err.userMessage, /Fix the file by hand/);
      return err.message;
    }
    return assert.fail(`accepted: ${JSON.stringify(plan)}`);
  };

  assert.match(bad({ 'PR.AA-05': { status: 'wip' } }), /\/plan\/PR\.AA-05\/status must be one of: open, in-progress, done, risk-accepted/);
  assert.match(bad({ 'PR.AA-05': { onwer: 'typo' } }), /\/plan\/PR\.AA-05 has an unknown field "onwer"/);
  assert.match(bad({ 'PR.AA-05': { owner: 42 } }), /\/plan\/PR\.AA-05\/owner must be string/);
  assert.match(bad({ 'PR.AA-05': { due: null } }), /\/plan\/PR\.AA-05\/due must be string/);
  assert.match(bad({ 'PR.AA-05': 'Jane' }), /\/plan\/PR\.AA-05 must be object/);
  assert.match(bad(['PR.AA-05']), /\/plan must be object/);
  // Not the YYYY-MM-DD shape.
  for (const due of ['30/06/2026', '2026-6-30', '2026-06-30T00:00:00Z', 'next quarter', '']) {
    assert.match(bad({ 'PR.AA-05': { due } }), /\/plan\/PR\.AA-05\/due must be a date written as YYYY-MM-DD/, due);
  }
});

test('plan: a due date must exist in the calendar, not just look like a date', () => {
  const accepts = (due) => validateTargetSpec({ default: 'full', plan: { 'PR.AA-05': { due } } });
  for (const due of ['2026-02-30', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-01-32', '2100-02-29']) {
    assert.throws(() => accepts(due), (err) => {
      assert.ok(err instanceof TargetDataError);
      assert.match(err.message, new RegExp(`/plan/PR\\.AA-05/due "${due}" is not a calendar date \\(use YYYY-MM-DD`));
      return true;
    }, due);
  }
  // Real days, including leap days (2028; 2000 is a leap year, 2100 is not).
  for (const due of ['2026-02-28', '2028-02-29', '2000-02-29', '2026-12-31', '2026-01-01']) {
    assert.doesNotThrow(() => accepts(due), due);
  }
});

test('plan: keys that are not Subcategory ids are warned about on load', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'csf-plan-test-'));
  try {
    const path = join(dir, 'target.json');
    await writeFile(path, JSON.stringify({
      default: 'substantial',
      plan: {
        'PR.AA-05': { owner: 'ok' },
        'PR.AA': { owner: 'a Category is not a plan key' },
        'GV': { owner: 'neither is a Function' },
        'PR.AA-99': { owner: 'typo' },
      },
    }));
    const warnings = [];
    const spec = await loadTargetSpec(path, { csf: CSF, logger: { warn: (m) => warnings.push(m) } });
    assert.equal(warnings.length, 3);
    assert.match(warnings[0], /"plan" key "PR\.AA" matches nothing in the CSF core — ignored/);
    assert.match(warnings[1], /"plan" key "GV"/);
    assert.match(warnings[2], /"plan" key "PR\.AA-99"/);
    // Unknown keys are ignored by the view, exactly as the warning says.
    const view = buildTargetView(profileOf(), spec, CSF);
    assert.equal(view.entries.filter((e) => e.plan).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('plan: validation never rewrites nested values of its input', () => {
  // `status` validates a shallow copy of the raw file and then hashes the raw
  // content; a nested rewrite would make an unchanged target.json look edited.
  const raw = { default: 'substantial', plan: { 'PR.AA-05': { owner: '  Jane  ', due: '2026-06-30' } } };
  const before = JSON.stringify(raw);
  validateTargetSpec({ ...raw });
  assert.equal(JSON.stringify(raw), before);
});

test('target view: every entry carries plan (object or null) once the profile records one', () => {
  const { view } = build({
    default: 'substantial',
    plan: {
      'PR.AA-05': { owner: '  Jane Doe ', due: '2026-06-30', status: 'in-progress', milestones: ' Pilot first. ' },
      'GV.OC-02': { owner: '   ', milestones: '' }, // nothing actually recorded
      'PR.AA-01': { status: 'risk-accepted' },
    },
  });
  const byId = Object.fromEntries(view.entries.map((e) => [e.subcategory_id, e]));

  // Trimmed, never defaulted: a missing field is null, not "open" or "TBD".
  assert.deepEqual(byId['PR.AA-05'].plan, { owner: 'Jane Doe', due: '2026-06-30', status: 'in-progress', milestones: 'Pilot first.' });
  assert.deepEqual(byId['PR.AA-01'].plan, { owner: null, due: null, status: 'risk-accepted', milestones: null });
  assert.equal(byId['GV.OC-02'].plan, null);
  assert.equal(byId['GV.OC-01'].plan, null);
  assert.ok(view.entries.every((e) => Object.hasOwn(e, 'plan')));
});

test('target view: a profile without plan fields gets no plan key at all', () => {
  for (const target of [
    { default: 'substantial' },
    { default: 'substantial', plan: {} },
    { default: 'substantial', plan: { 'PR.AA-05': {}, 'GV.OC-02': { owner: ' ' } } },
    // A key that matches no Subcategory is warned about as ignored — and is.
    { default: 'substantial', plan: { 'PR.AA-99': { owner: 'typo in the id' }, 'PR.AA': { status: 'open' } } },
  ]) {
    const { profile, view } = build(target);
    assert.ok(view.entries.every((e) => !Object.hasOwn(e, 'plan')), JSON.stringify(target));
    assert.ok(!JSON.stringify(buildTargetProfile(profile, view)).includes('"plan"'));
    assert.ok(!renderRemediationMarkdown(profile, view).includes('Plan (recorded'));
  }
});

/* --------------------------------- POA&M ---------------------------------- */

const PLANNED = {
  default: 'substantial',
  priorities: { 'PR.AA-05': 'high', RC: 'low' },
  notes: { 'PR.AA-05': 'Contractual requirement.' },
  plan: {
    'PR.AA-05': { owner: 'Jane Doe', due: '2026-06-30', status: 'in-progress', milestones: 'Pilot, then roll out.' },
    'GV.OC-01': { owner: 'CISO', status: 'done' }, // target already met
  },
};

test('POA&M: one row per unmet applicable target, in plan order, with the fixed columns', () => {
  const { profile, view } = build(PLANNED);
  const csv = renderPoamCsv(profile, view);
  const rows = records(csv);

  assert.deepEqual(parseCsv(csv)[0], POAM_HEADER);
  assert.deepEqual(POAM_HEADER, [
    'poam_id', 'subcategory_id', 'function', 'category', 'weakness', 'current_coverage', 'target_coverage',
    'levels_to_close', 'priority', 'target_met', 'review_status', 'status', 'owner', 'due', 'milestones',
    'nist_implementation_examples', 'assessment_rationale', 'target_note', 'report_date',
  ]);

  const unmet = planOrder(view.entries.filter((e) => !e.not_applicable && !e.met)).map((e) => e.subcategory_id);
  assert.deepEqual(unmet, ['PR.AA-05', 'GV.OC-02', 'PR.AA-01', 'RC.RP-01']);
  assert.deepEqual(rows.slice(0, 4).map((r) => r.subcategory_id), unmet);

  assert.deepEqual(rows[0], {
    poam_id: 'POAM-PR.AA-05',
    subcategory_id: 'PR.AA-05',
    function: 'PROTECT',
    category: 'Identity Management (PR.AA)',
    weakness: 'Outcome not demonstrated at the target level: Access enforced',
    current_coverage: 'none',
    target_coverage: 'substantial',
    levels_to_close: '2',
    priority: 'high',
    target_met: 'no',
    review_status: 'unreviewed',
    status: 'in-progress',
    owner: 'Jane Doe',
    due: '2026-06-30',
    milestones: 'Pilot, then roll out.',
    nist_implementation_examples: 'Require MFA',
    assessment_rationale: 'rationale for PR.AA-05',
    target_note: 'Contractual requirement.',
    report_date: '2026-04-15',
  });
});

test('POA&M: owner and due are never invented — blank until a person records them', () => {
  const { profile, view } = build(PLANNED);
  const untriaged = records(renderPoamCsv(profile, view)).find((r) => r.subcategory_id === 'GV.OC-02');
  assert.equal(untriaged.owner, '');
  assert.equal(untriaged.due, '');
  assert.equal(untriaged.milestones, '');
  assert.equal(untriaged.status, 'open'); // the only default: an unmet target is open
  // NIST's examples verbatim (commas and all), joined with " | ".
  assert.equal(untriaged.nist_implementation_examples, 'Identify stakeholders | Review expectations, e.g., yearly');
  // No examples in the CSF export => an empty cell, not invented text.
  assert.equal(records(renderPoamCsv(profile, view)).find((r) => r.subcategory_id === 'RC.RP-01').nist_implementation_examples, '');
});

test('POA&M: an item with a plan entry stays as a closed row once its target is met or scoped out', () => {
  const target = {
    ...PLANNED,
    subcategories: { 'PR.AA-01': 'not-applicable' },
    plan: { ...PLANNED.plan, 'PR.AA-01': { owner: 'Facilities', status: 'risk-accepted' } },
  };
  const { profile, view } = build(target);
  const rows = records(renderPoamCsv(profile, view));

  // Open rows first, then the closed ones.
  assert.deepEqual(rows.map((r) => r.subcategory_id), ['PR.AA-05', 'GV.OC-02', 'RC.RP-01', 'GV.OC-01', 'PR.AA-01']);

  const met = rows[3];
  assert.equal(met.target_met, 'yes');
  assert.equal(met.weakness, 'Target level met in the current assessment: Mission understood');
  assert.equal(met.levels_to_close, '0');
  assert.equal(met.status, 'done'); // the person's value, carried as recorded
  assert.equal(met.owner, 'CISO');
  assert.equal(met.nist_implementation_examples, ''); // no open gap, nothing to suggest
  assert.equal(met.report_date, '');

  const scopedOut = rows[4];
  assert.equal(scopedOut.target_met, 'n/a');
  assert.equal(scopedOut.target_coverage, 'not-applicable');
  assert.equal(scopedOut.priority, '');
  assert.equal(scopedOut.weakness, 'Outcome marked not-applicable in the target profile: Identities managed');
  assert.equal(scopedOut.status, 'risk-accepted');

  // A met target WITHOUT a plan entry is not a POA&M row at all.
  const noPlan = build({ default: 'substantial' });
  assert.ok(!records(renderPoamCsv(noPlan.profile, noPlan.view)).some((r) => r.subcategory_id === 'GV.OC-01'));
});

test('POA&M: a closed row is never marked done on the person\'s behalf', () => {
  const { profile, view } = build({ default: 'substantial', plan: { 'GV.OC-01': { owner: 'CISO' } } });
  const met = records(renderPoamCsv(profile, view)).find((r) => r.subcategory_id === 'GV.OC-01');
  assert.equal(met.target_met, 'yes');
  assert.equal(met.status, '');
});

test('POA&M: ids are derived from the Subcategory, so re-prioritizing reorders rows without renumbering them', () => {
  const first = build(PLANNED);
  const reprioritized = build({ ...PLANNED, priorities: { 'RC.RP-01': 'high', 'PR.AA-05': 'low' } });
  const a = records(renderPoamCsv(first.profile, first.view));
  const b = records(renderPoamCsv(reprioritized.profile, reprioritized.view));

  assert.notDeepEqual(a.map((r) => r.poam_id), b.map((r) => r.poam_id)); // the order did change
  assert.deepEqual(a.map((r) => r.poam_id).sort(), b.map((r) => r.poam_id).sort());
  for (const r of [...a, ...b]) assert.equal(r.poam_id, `POAM-${r.subcategory_id}`);
  assert.equal(poamId('PR.AA-05'), 'POAM-PR.AA-05');
  assert.ok(!a.some((r) => /^\d+$/.test(r.poam_id) || /POAM-\d+$/.test(r.poam_id)));
});

test('POA&M: human text is quoted per RFC-4180 and formula-shaped cells are neutralized', () => {
  const { profile, view } = build({
    default: 'substantial',
    notes: { 'GV.OC-02': '+1 for doing this first' },
    plan: {
      'PR.AA-05': { owner: '=HYPERLINK("http://evil.example","Jane")', milestones: 'Step 1, pilot\nStep 2: "all staff"' },
      'GV.OC-02': { owner: '@SUM(A1:A9)', milestones: '-2 weeks slack' },
      'PR.AA-01': { owner: '  =cmd|\' /C calc\'!A0  ' },
    },
  });
  const csv = renderPoamCsv(profile, view);

  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.endsWith('\r\n'));
  const rows = records(csv);
  const byId = Object.fromEntries(rows.map((r) => [r.subcategory_id, r]));
  // A leading = + - @ would be run as a formula by a spreadsheet: prefixed with '.
  assert.equal(byId['PR.AA-05'].owner, '\'=HYPERLINK("http://evil.example","Jane")');
  assert.equal(byId['GV.OC-02'].owner, "'@SUM(A1:A9)");
  assert.equal(byId['GV.OC-02'].milestones, "'-2 weeks slack");
  assert.equal(byId['GV.OC-02'].target_note, "'+1 for doing this first");
  // Trimming happens before the guard, so leading whitespace cannot hide a formula.
  assert.equal(byId['PR.AA-01'].owner, "'=cmd|' /C calc'!A0");
  // Commas, quotes and line breaks survive as one cell.
  assert.equal(byId['PR.AA-05'].milestones, 'Step 1, pilot\nStep 2: "all staff"');
  assert.ok(rows.every((r) => Object.keys(r).length === POAM_HEADER.length));
  // The invariant behind all of the above: no cell a spreadsheet opens starts with a formula leader.
  for (const r of rows) {
    for (const [column, cell] of Object.entries(r)) assert.ok(!/^[=+\-@\t\r]/.test(cell), `${r.poam_id} ${column}: ${cell}`);
  }
});

test('POA&M: nothing unmet and nothing planned is a header-only file', () => {
  const allMet = Object.fromEntries(Object.keys(COVERAGE).map((id) => [id, 'full']));
  const { profile, view } = build({ default: 'substantial' }, allMet);
  assert.deepEqual(buildPoamRows(profile, view), []);
  assert.equal(renderPoamCsv(profile, view), `﻿${POAM_HEADER.join(',')}\r\n`);
});

test('POA&M: report_date is the date part of the report timestamp, or blank if that is unusable', () => {
  const { profile, view } = build(PLANNED);
  assert.ok(buildPoamRows(profile, view).slice(0, 4).every((r) => r.report_date === '2026-04-15'));
  profile.generatedAt = 'not a timestamp';
  assert.ok(buildPoamRows(profile, view).every((r) => r.report_date === ''));
});

/* ---------------------------- remediation plan ---------------------------- */

test('remediation plan: recorded plan fields appear on one line, and only for items that have them', () => {
  const { profile, view } = build({
    ...PLANNED,
    plan: {
      'PR.AA-05': { owner: 'Jane Doe', due: '2026-06-30', status: 'in-progress', milestones: 'Pilot first.\nThen all staff.' },
      'GV.OC-02': { due: '2026-09-30' },
    },
  });
  const md = renderRemediationMarkdown(profile, view);
  const lines = md.split('\n');

  assert.ok(lines.includes(
    '- Plan (recorded in the target profile): owner: Jane Doe; due: 2026-06-30; status: in-progress; milestones: Pilot first. Then all staff.',
  ));
  // Only what was recorded: no default status, no "owner: —".
  assert.ok(lines.includes('- Plan (recorded in the target profile): due: 2026-09-30'));
  assert.equal(lines.filter((line) => line.startsWith('- Plan (recorded')).length, 2);

  // Removing the plan gives back exactly the plan-less document.
  const bare = build({ ...PLANNED, plan: {} });
  assert.equal(
    lines.filter((line) => !line.startsWith('- Plan (recorded')).join('\n'),
    renderRemediationMarkdown(bare.profile, bare.view),
  );
});

test('target-profile.json carries the plan fields when recorded', () => {
  const { profile, view } = build(PLANNED);
  const json = buildTargetProfile(profile, view);
  const planned = json.subcategories.find((e) => e.subcategory_id === 'PR.AA-05');
  assert.deepEqual(planned.plan, { owner: 'Jane Doe', due: '2026-06-30', status: 'in-progress', milestones: 'Pilot, then roll out.' });
  assert.equal(json.subcategories.find((e) => e.subcategory_id === 'GV.OC-02').plan, null);
});
