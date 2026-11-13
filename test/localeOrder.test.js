/**
 * Generated files must not depend on the machine's locale.
 *
 * Subcategory ids used to be ordered with String.prototype.localeCompare(),
 * which follows the host locale — and Danish and Norwegian collation sort "AA"
 * after "Z". There, PR.AA moved behind the rest of PROTECT: the gap analysis
 * listed it last and the remediation plan (and everything that follows its
 * order) was renumbered.
 *
 * These tests make every localeCompare() in the process behave like Danish and
 * require the deliverables to come out byte-identical to an untouched run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../src/report/profile.js';
import { buildTargetView, validateTargetSpec, planOrder } from '../src/target/targetProfile.js';
import { renderGapMarkdown } from '../src/report/gapMarkdown.js';
import { renderRemediationMarkdown } from '../src/report/remediationMarkdown.js';
import { renderEvidenceRequestsMarkdown } from '../src/report/evidenceRequestsMarkdown.js';
import { renderPoamCsv } from '../src/report/poamCsv.js';
import { renderDashboardHtml } from '../src/report/htmlDashboard.js';

const NOW = '2026-01-01T00:00:00.000Z';
const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' } },
  now: () => NOW,
};

// PROTECT in CSF order: AA, AT, DS, PS, IR — and Danish would put AA last.
// One PR.AA outcome in each group a report sorts: unmet, met, out of scope.
const IDS = ['PR.AA-01', 'PR.AA-03', 'PR.AA-05', 'PR.AT-01', 'PR.DS-01', 'PR.PS-01', 'PR.IR-01'];
const CSF = {
  frameworkVersion: 'CSF 2.0',
  sample: false,
  functions: [{ id: 'PR', name: 'PROTECT' }],
  subcategories: IDS.map((id) => ({
    id,
    outcome: `outcome ${id}`,
    function: 'PROTECT',
    category: `Category (${id.split('-')[0]})`,
    functionId: 'PR',
    functionName: 'PROTECT',
    categoryId: id.split('-')[0],
    implementationExamples: [`example for ${id}`],
  })),
};

function assessment(id, coverage) {
  return {
    subcategory_id: id,
    coverage,
    confidence: 0.8,
    evidence: coverage === 'none' ? [] : [{ source_file: 'policy.md', page: null, score: 0.5, quote: `quote for ${id}`, verified: true }],
    rationale: `rationale for ${id}`,
    needs_review: false,
    verification: { quotes_checked: 1, quotes_verified: 1, downgraded: false },
  };
}

function renderEverything() {
  const coverage = {
    'PR.AA-01': 'none', // scoped out below
    'PR.AA-03': 'full', // met
    'PR.AA-05': 'none', // unmet
    'PR.AT-01': 'none',
    'PR.DS-01': 'full',
    'PR.PS-01': 'none',
    'PR.IR-01': 'none', // scoped out below
  };
  const assessments = Object.fromEntries(IDS.map((id) => [id, assessment(id, coverage[id])]));
  const profile = buildProfile(CTX, { csf: CSF, assessments, reviews: {}, meta: {} });
  const view = buildTargetView(
    profile,
    validateTargetSpec({ default: 'substantial', subcategories: { 'PR.AA-01': 'not-applicable', 'PR.IR-01': 'not-applicable' } }),
    CSF,
  );
  return {
    gap: renderGapMarkdown(profile, { targetView: view }),
    plan: renderRemediationMarkdown(profile, view),
    requests: renderEvidenceRequestsMarkdown(profile, { csf: CSF, targetView: view }),
    requestsNoTarget: renderEvidenceRequestsMarkdown(profile, { csf: CSF }),
    poam: renderPoamCsv(profile, view),
    dashboardPlanOrder: JSON.parse(
      /<script id="csf-data" type="application\/json">([\s\S]*?)<\/script>/.exec(renderDashboardHtml(profile, view))[1],
    ).planOrder,
  };
}

/** Run `fn` while every localeCompare() in the process collates like Danish. */
function withDanishCollation(fn) {
  const original = String.prototype.localeCompare;
  const danish = new Intl.Collator('da');
  String.prototype.localeCompare = function compareAsDanish(other) {
    return danish.compare(String(this), String(other));
  };
  try {
    return fn();
  } finally {
    String.prototype.localeCompare = original;
  }
}

const idsIn = (text) => [...text.matchAll(/PR\.[A-Z]{2}-\d{2}/g)].map((m) => m[0]);
const firstMentions = (text) => [...new Set(idsIn(text))];

test('the premise: Danish collation sorts "AA" after every other letter pair', () => {
  assert.ok(new Intl.Collator('da').compare('PR.AA-01', 'PR.AT-01') > 0);
  assert.ok(withDanishCollation(() => 'PR.AA-01'.localeCompare('PR.PS-01')) > 0);
});

test('every deliverable is byte-identical whatever the host locale', () => {
  const reference = renderEverything();
  const danish = withDanishCollation(renderEverything);
  assert.deepEqual(danish, reference);
});

test('Subcategory ids are in id order, PR.AA first', () => {
  const out = withDanishCollation(renderEverything);

  // gap-analysis.md: the gaps, then what is covered — each by id.
  const gaps = out.gap.slice(out.gap.indexOf('## Gaps and partial coverage'), out.gap.indexOf('## Substantially or fully covered'));
  assert.deepEqual(firstMentions(gaps), ['PR.AA-01', 'PR.AA-05', 'PR.AT-01', 'PR.IR-01', 'PR.PS-01']);
  const covered = out.gap.slice(out.gap.indexOf('## Substantially or fully covered'));
  assert.deepEqual(firstMentions(covered), ['PR.AA-03', 'PR.DS-01']);

  // remediation-plan.md: unmet in plan order, then met, then out of scope — each by id.
  const plan = out.plan;
  const section = (from, to) => plan.slice(plan.indexOf(from), to ? plan.indexOf(to) : undefined);
  const unmet = ['PR.AA-05', 'PR.AT-01', 'PR.PS-01'];
  assert.deepEqual(firstMentions(section('## Prioritized action plan', '## At or above target')), unmet);
  assert.deepEqual(firstMentions(section('## At or above target', '## Out of scope')), ['PR.AA-03', 'PR.DS-01']);
  assert.deepEqual(firstMentions(section('## Out of scope', '\n---\n')), ['PR.AA-01', 'PR.IR-01']);

  // Everything that follows the plan's order agrees with it — numbering included.
  assert.deepEqual(out.dashboardPlanOrder, unmet);
  assert.deepEqual(firstMentions(out.requests.slice(out.requests.indexOf('## Evidence requests'))), unmet);
  assert.deepEqual(firstMentions(out.poam), unmet);
  assert.match(plan, /#### 1\. PR\.AA-05 — none → substantial/);
  assert.deepEqual(
    firstMentions(out.requestsNoTarget.slice(out.requestsNoTarget.indexOf('## Evidence requests'))),
    ['PR.AA-01', 'PR.AA-05', 'PR.AT-01', 'PR.IR-01', 'PR.PS-01'],
  );
});

test('planOrder breaks its last tie by id without consulting the locale', () => {
  const entries = ['PR.PS-01', 'PR.AA-03', 'PR.AT-01', 'PR.AA-01'].map((id) => ({
    subcategory_id: id, function: 'PROTECT', priority: 'medium', gap: 2, current_coverage: 'none',
  }));
  const expected = ['PR.AA-01', 'PR.AA-03', 'PR.AT-01', 'PR.PS-01'];
  assert.deepEqual(planOrder(entries).map((e) => e.subcategory_id), expected);
  assert.deepEqual(withDanishCollation(() => planOrder(entries)).map((e) => e.subcategory_id), expected);
});
