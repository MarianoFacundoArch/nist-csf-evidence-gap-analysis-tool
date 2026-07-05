import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../src/report/profile.js';
import { buildTargetView, validateTargetSpec } from '../src/target/targetProfile.js';
import { renderRemediationMarkdown } from '../src/report/remediationMarkdown.js';
import { buildTargetProfile } from '../src/report/targetJson.js';
import { renderGapMarkdown } from '../src/report/gapMarkdown.js';
import { renderDashboardHtml } from '../src/report/htmlDashboard.js';

const NOW = '2026-01-01T00:00:00.000Z';

const CSF = {
  frameworkVersion: 'CSF 2.0',
  sample: false,
  functions: [
    { id: 'GV', name: 'GOVERN' },
    { id: 'PR', name: 'PROTECT' },
  ],
  subcategories: [
    sub('GV.OC-01', 'Mission understood', 'GV', 'GOVERN', 'GV.OC', 'Organizational Context (GV.OC)', ['Share the mission']),
    sub('GV.OC-02', 'Stakeholders understood', 'GV', 'GOVERN', 'GV.OC', 'Organizational Context (GV.OC)', ['Identify stakeholders', 'Review expectations yearly']),
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

function assessment(id, coverage) {
  return {
    subcategory_id: id,
    coverage,
    confidence: 0.9,
    evidence: coverage === 'none'
      ? []
      : [{ source_file: 'policy.md', page: 2, score: 0.5, quote: `evidence quote for ${id}`, verified: true }],
    rationale: `rationale for ${id}`,
    needs_review: false,
    verification: { quotes_checked: 1, quotes_verified: 1, downgraded: false },
  };
}

const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' } },
  now: () => NOW,
};

function fixtures() {
  const assessments = {
    'GV.OC-01': assessment('GV.OC-01', 'substantial'),
    'GV.OC-02': assessment('GV.OC-02', 'none'),
    'PR.AA-01': assessment('PR.AA-01', 'partial'),
    'PR.AA-05': assessment('PR.AA-05', 'none'),
  };
  const profile = buildProfile(CTX, { csf: CSF, assessments, reviews: {}, meta: {} });
  const spec = validateTargetSpec({
    default: 'substantial',
    categories: { 'PR.AA': 'full' },
    subcategories: { 'PR.AA-05': 'not-applicable' },
    priorities: { 'GV.OC-02': 'high' },
    notes: { 'PR.AA-05': 'No OT systems in scope.' },
  });
  const view = buildTargetView(profile, spec, CSF);
  return { profile, view };
}

test('remediation plan: prioritized, grounded in NIST examples, honest about review state', () => {
  const { profile, view } = fixtures();
  const md = renderRemediationMarkdown(profile, view);

  // Draft banner: nothing was human-reviewed in this fixture.
  assert.match(md, /DRAFT — not fully reviewed/);
  // High priority section comes before medium, and contains the high item.
  const hi = md.indexOf('### High priority (1)');
  const med = md.indexOf('### Medium priority (1)');
  assert.ok(hi > 0 && med > hi);
  assert.ok(md.indexOf('GV.OC-02') > hi && md.indexOf('GV.OC-02') < med);
  // Items state the move and the distance.
  assert.match(md, /GV\.OC-02 — none → substantial \(2 levels to close\)/);
  // Suggested actions are the official implementation examples, numbered.
  assert.match(md, /Suggested actions \(NIST CSF 2\.0 Implementation Examples\):/);
  assert.match(md, /1\. Identify stakeholders/);
  assert.match(md, /2\. Review expectations yearly/);
  // Unreviewed items are flagged inline.
  assert.match(md, /⚠ UNREVIEWED/);
  // Met and out-of-scope sections exist with their content.
  assert.match(md, /## At or above target \(1\)/);
  assert.match(md, /## Out of scope — not-applicable \(1\)/);
  assert.match(md, /No OT systems in scope\./);
});

test('remediation plan: empty-state when every target is met', () => {
  const assessments = {
    'GV.OC-01': assessment('GV.OC-01', 'full'),
    'GV.OC-02': assessment('GV.OC-02', 'full'),
    'PR.AA-01': assessment('PR.AA-01', 'full'),
    'PR.AA-05': assessment('PR.AA-05', 'full'),
  };
  const profile = buildProfile(CTX, { csf: CSF, assessments, reviews: {}, meta: {} });
  const view = buildTargetView(profile, validateTargetSpec({ default: 'substantial' }), CSF);
  const md = renderRemediationMarkdown(profile, view);
  assert.match(md, /No unmet targets/);
});

test('target-profile.json mirrors the current profile envelope and carries the entries', () => {
  const { profile, view } = fixtures();
  const t = buildTargetProfile(profile, view);
  assert.equal(t.profileType, 'Target');
  assert.equal(t.frameworkVersion, 'CSF 2.0');
  assert.equal(t.generatedAt, NOW);
  assert.equal(t.baseline, 'substantial');
  assert.deepEqual(t.review, { reviewed: 0, unreviewed: 4, stale: 0 });
  assert.equal(t.subcategories.length, 4);
  const na = t.subcategories.find((e) => e.subcategory_id === 'PR.AA-05');
  assert.equal(na.not_applicable, true);
  assert.equal(na.note, 'No OT systems in scope.');
});

test('gap-analysis gains a Current vs Target section only when a target exists', () => {
  const { profile, view } = fixtures();
  const without = renderGapMarkdown(profile, {});
  const withTarget = renderGapMarkdown(profile, { targetView: view });
  assert.ok(!/## Current vs Target/.test(without));
  assert.match(withTarget, /## Current vs Target/);
  assert.match(withTarget, /Target baseline: \*\*substantial\*\*/);
  assert.match(withTarget, /remediation-plan\.md/);
});

test('dashboard HTML is self-contained and escapes hostile document text', () => {
  const { profile, view } = fixtures();
  // Evidence quotes are attacker-influenceable: try to break out of the JSON script.
  profile.subcategories[0].evidence.push({
    source_file: 'evil.md', page: null, score: 0.1,
    quote: '</script><script>alert(1)</script>',
    verified: true,
  });
  const html = renderDashboardHtml(profile, view);

  // Single, complete document.
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<\/html>\s*$/);
  // The hostile quote never appears as live markup (only <-escaped in JSON).
  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.ok(html.includes('\\u003c/script>\\u003cscript>alert(1)'));
  // No external fetches of any kind.
  assert.ok(!/\bsrc\s*=\s*["']https?:/.test(html));
  assert.ok(!/\bhref\s*=\s*["']https?:/.test(html));
  assert.ok(!/@import|url\(/.test(html));
  // The embedded data round-trips and includes the plan order.
  const m = /<script id="csf-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'embedded data block present');
  const data = JSON.parse(m[1]);
  assert.equal(data.profile.subcategories.length, 4);
  assert.deepEqual(data.planOrder, ['GV.OC-02', 'PR.AA-01']);
  assert.equal(data.target.baseline, 'substantial');
});

test('dashboard HTML renders without a target profile too', () => {
  const { profile } = fixtures();
  const html = renderDashboardHtml(profile, null);
  const m = /<script id="csf-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  const data = JSON.parse(m[1]);
  assert.equal(data.target, null);
  assert.deepEqual(data.planOrder, []);
  assert.deepEqual(data.functionOrder, ['GOVERN', 'PROTECT']);
});
