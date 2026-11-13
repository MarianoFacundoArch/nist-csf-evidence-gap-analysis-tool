import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../src/report/profile.js';
import { buildTargetView, validateTargetSpec, planOrder } from '../src/target/targetProfile.js';
import { renderEvidenceRequestsMarkdown, EVIDENCE_QUESTIONS } from '../src/report/evidenceRequestsMarkdown.js';
import { renderRemediationMarkdown } from '../src/report/remediationMarkdown.js';
import { hashAssessment } from '../src/util/hash.js';

const NOW = '2026-01-01T00:00:00.000Z';

// NIST text carries punctuation that Markdown could mangle; it must pass through untouched.
const VERBATIM_EXAMPLE =
  'Share the organization\'s mission (e.g., through vision and mission statements, marketing, and service strategies) to provide a basis for identifying risks that may impede that mission';

const CSF = {
  frameworkVersion: 'CSF 2.0',
  sample: false,
  functions: [
    { id: 'GV', name: 'GOVERN' },
    { id: 'ID', name: 'IDENTIFY' },
    { id: 'PR', name: 'PROTECT' },
    { id: 'RC', name: 'RECOVER' },
  ],
  // CSF order differs from id order within GOVERN (RM before OC), as in the real core.
  subcategories: [
    sub('GV.RM-01', 'Risk objectives agreed', 'GOVERN', 'Risk Management Strategy (GV.RM)', ['Update near-term objectives', 'Establish measurable objectives']),
    sub('GV.OC-01', 'Mission understood', 'GOVERN', 'Organizational Context (GV.OC)', [VERBATIM_EXAMPLE]),
    sub('GV.OC-02', 'Stakeholders understood', 'GOVERN', 'Organizational Context (GV.OC)', ['Identify stakeholders', 'Review expectations yearly']),
    sub('ID.AM-01', 'Hardware inventoried', 'IDENTIFY', 'Asset Management (ID.AM)', ['Maintain a hardware inventory']),
    sub('PR.AA-01', 'Identities managed', 'PROTECT', 'Identity Management (PR.AA)', ['Zebra example listed first by NIST', 'Alpha example listed second by NIST']),
    sub('PR.AA-05', 'Access enforced', 'PROTECT', 'Identity Management (PR.AA)', ['Require MFA']),
    sub('PR.AA-06', 'Physical access managed', 'PROTECT', 'Identity Management (PR.AA)', []),
    sub('RC.RP-01', 'Recovery plan executed', 'RECOVER', 'Incident Recovery Plan Execution (RC.RP)', ['Begin recovery procedures']),
  ],
};

function sub(id, outcome, fnName, category, examples) {
  return {
    id, outcome, function: fnName, category,
    functionId: id.split('.')[0], functionName: fnName, categoryId: id.split('-')[0],
    implementationExamples: examples,
  };
}

function assessment(id, coverage, files = ['policy.md']) {
  return {
    subcategory_id: id,
    coverage,
    confidence: 0.7,
    evidence: coverage === 'none'
      ? []
      : files.map((file, i) => ({ source_file: file, page: null, score: 0.5, quote: `evidence quote ${i + 1} for ${id}`, verified: true })),
    rationale: `rationale for ${id}`,
    needs_review: false,
    verification: { quotes_checked: 1, quotes_verified: 1, downgraded: false },
  };
}

const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' } },
  now: () => NOW,
};

function baseAssessments() {
  return {
    'GV.RM-01': assessment('GV.RM-01', 'partial', ['risk-register.xlsx.md', 'policy.md', 'policy.md']),
    'GV.OC-01': assessment('GV.OC-01', 'none'),
    'GV.OC-02': assessment('GV.OC-02', 'substantial'),
    'ID.AM-01': assessment('ID.AM-01', 'full'),
    'PR.AA-01': assessment('PR.AA-01', 'partial'),
    'PR.AA-05': assessment('PR.AA-05', 'none'),
    'PR.AA-06': assessment('PR.AA-06', 'none'),
    'RC.RP-01': assessment('RC.RP-01', 'none'),
  };
}

function build({ assessments = baseAssessments(), reviews = {}, target = null, csf = CSF } = {}) {
  const profile = buildProfile(CTX, { csf, assessments, reviews, meta: {} });
  const targetView = target ? buildTargetView(profile, validateTargetSpec(target), csf) : null;
  return { profile, targetView, md: renderEvidenceRequestsMarkdown(profile, { csf, targetView }) };
}

const itemHeadings = (md) => md.split('\n').filter((line) => line.startsWith('#### '));
const itemIds = (md) => itemHeadings(md).map((h) => /([A-Z]{2}\.[A-Z]{2}-\d{2})/.exec(h)[1]);

/** The Markdown block of one item (from its heading to the next heading). */
function item(md, id) {
  const start = md.split('\n').findIndex((line) => line.startsWith('#### ') && line.includes(id));
  assert.ok(start >= 0, `item ${id} present`);
  const lines = md.split('\n').slice(start + 1);
  const end = lines.findIndex((line) => line.startsWith('#') || line === '---');
  return lines.slice(0, end < 0 ? undefined : end).join('\n');
}

test('without a target: the gaps, by Function in canonical order, none before partial', () => {
  const { md } = build();

  // GOVERN (none GV.OC-01, then partial GV.RM-01), PROTECT (none 05, 06, then partial 01), RECOVER.
  assert.deepEqual(itemIds(md), ['GV.OC-01', 'GV.RM-01', 'PR.AA-05', 'PR.AA-06', 'PR.AA-01', 'RC.RP-01']);
  assert.deepEqual(
    md.split('\n').filter((line) => line.startsWith('### ')),
    ['### GOVERN (2)', '### PROTECT (3)', '### RECOVER (1)'],
  );
  // Substantial/full outcomes are not evidence requests.
  assert.ok(!itemIds(md).includes('GV.OC-02') && !itemIds(md).includes('ID.AM-01'));
  assert.match(md, /- Scope: the 6 outcomes whose current coverage is none or partial \(no target profile is set\), grouped by Function/);
  assert.match(md, /- Not listed: 2 substantially or fully covered/);
  assert.match(md, /- Open requests: 6 \(current coverage: none 4, partial 2\)/);
  assert.match(md, /#### GV\.OC-01 — none _\(⚠ UNREVIEWED\)_/);
});

test('with a target: the unmet applicable targets, in the order and numbering of the remediation plan', () => {
  const target = {
    default: 'substantial',
    categories: { 'PR.AA': 'full' },
    subcategories: { 'PR.AA-05': 'not-applicable', 'GV.RM-01': 'partial', 'ID.AM-01': 'full', 'GV.OC-02': 'full' },
    priorities: { 'RC': 'high', 'GV.OC': 'low' },
  };
  const { profile, targetView, md } = build({ target });

  const expected = planOrder(targetView.entries.filter((e) => !e.not_applicable && !e.met)).map((e) => e.subcategory_id);
  assert.deepEqual(itemIds(md), expected);
  assert.deepEqual(expected, ['RC.RP-01', 'PR.AA-06', 'PR.AA-01', 'GV.OC-01', 'GV.OC-02']);
  // Same item headings as remediation-plan.md, so the two can be read side by side.
  const planHeadings = renderRemediationMarkdown(profile, targetView).split('\n').filter((line) => line.startsWith('#### '));
  assert.deepEqual(itemHeadings(md), planHeadings);
  assert.deepEqual(
    md.split('\n').filter((line) => line.startsWith('### ')),
    ['### High priority (1)', '### Medium priority (2)', '### Low priority (2)'],
  );

  // A partial outcome that meets a "partial" target is not a request, and neither is a scoped-out one...
  assert.ok(!itemIds(md).includes('GV.RM-01') && !itemIds(md).includes('PR.AA-05'));
  // ...while a substantial outcome below a "full" target is, although it is not a gap.
  assert.match(md, /#### 5\. GV\.OC-02 — substantial → full \(1 level to close\)/);
  assert.match(item(md, 'GV.OC-02'), /- Current coverage: substantial; target: full; priority: low/);
  assert.match(md, /- Scope: the 5 applicable outcomes that do not meet their target, in the same order and numbering as remediation-plan\.md/);
  assert.match(md, /- Not listed: 2 at or above target, 1 scoped out as not-applicable/);
  assert.match(md, /- Open requests: 5 \(current coverage: none 3, partial 1, substantial 1\)/);
});

test('every item carries the same three fixed questions', () => {
  const { md } = build();
  assert.equal(EVIDENCE_QUESTIONS.length, 3);
  for (const [i, question] of EVIDENCE_QUESTIONS.entries()) {
    assert.equal(md.split(`  ${i + 1}. ${question}`).length - 1, itemIds(md).length, question);
  }
  // No other numbered question appears anywhere: nothing outcome-specific is composed.
  const numbered = md.split('\n').filter((line) => /^ {2}\d+\. /.test(line));
  assert.equal(numbered.length, 3 * itemIds(md).length);
  assert.deepEqual([...new Set(numbered)], EVIDENCE_QUESTIONS.map((q, i) => `  ${i + 1}. ${q}`));
});

test('the checklist is the NIST Implementation Examples: verbatim, in NIST order, labeled as illustrative', () => {
  const { md } = build();

  const mission = item(md, 'GV.OC-01');
  assert.ok(mission.split('\n').includes(`  - [ ] ${VERBATIM_EXAMPLE}`));
  // Order is NIST's, never alphabetical or otherwise "improved".
  const identities = item(md, 'PR.AA-01').split('\n').filter((line) => line.startsWith('  - [ ] '));
  assert.deepEqual(identities, [
    '  - [ ] Zebra example listed first by NIST',
    '  - [ ] Alpha example listed second by NIST',
  ]);
  // Every checklist line in the report is one of the official examples, character for character.
  const official = new Set(CSF.subcategories.flatMap((s) => s.implementationExamples));
  const checklist = md.split('\n').filter((line) => line.startsWith('  - [ ] ')).map((line) => line.slice('  - [ ] '.length));
  assert.ok(checklist.length > 0);
  for (const line of checklist) assert.ok(official.has(line), line);

  assert.match(mission, /Evidence that could demonstrate it — documents or records showing practices such as these in operation \(NIST CSF 2\.0 Implementation Examples, verbatim; illustrative, not exhaustive, not a required baseline\):/);
  assert.match(md, /official NIST CSF 2\.0 Implementation Examples \(public domain, source: NIST CPRT\), quoted verbatim: illustrative, not an exhaustive list and not a baseline of required actions/);
});

test('an outcome without Implementation Examples says so instead of inventing a checklist', () => {
  const { md } = build();
  const physical = item(md, 'PR.AA-06');
  assert.match(physical, /- Evidence that could demonstrate it: \(no Implementation Examples provided by this CSF core export\)/);
  assert.ok(!physical.includes('- [ ]'));
  // The questions are still there: they do not depend on the examples.
  assert.ok(physical.includes(`  1. ${EVIDENCE_QUESTIONS[0]}`));
});

test('items show the rationale as the assessment\'s, the review state, and the documents already quoted', () => {
  const assessments = baseAssessments();
  const reviews = {
    'PR.AA-01': {
      decision: 'override',
      final_coverage: 'none',
      note: 'Quoted sentence is a statement of intent only.',
      reviewed_by: 'reviewer@example.org',
      reviewed_at: NOW,
      reviewed_against: hashAssessment(assessments['PR.AA-01']),
    },
    'RC.RP-01': { decision: 'accept', final_coverage: 'none', reviewed_at: NOW, reviewed_against: 'outdated-hash' },
  };
  const { md } = build({ assessments, reviews });

  const risk = item(md, 'GV.RM-01');
  assert.match(risk, /- Function \/ Category: GOVERN \/ Risk Management Strategy \(GV\.RM\)/);
  assert.match(risk, /- Outcome: Risk objectives agreed/);
  assert.match(risk, /- Current coverage: partial\n/);
  assert.match(risk, /- Review status: unreviewed/);
  assert.match(risk, /- Assessment rationale: rationale for GV\.RM-01/);
  // Distinct documents with their quote counts, ordered by name, names as code spans.
  assert.match(risk, /- Documents already quoted: `policy\.md` \(2 quotes\), `risk-register\.xlsx\.md` \(1 quote\)/);

  // Nothing quoted => no such line (rather than an empty one).
  assert.ok(!item(md, 'GV.OC-01').includes('Documents already quoted'));

  // A reviewer override to "none": the override is visible and the AI's quotes remain traceable.
  const identities = item(md, 'PR.AA-01');
  assert.match(identities, /- Current coverage: none \(reviewer override: partial → none\)/);
  assert.match(identities, /- Review status: reviewed/);
  assert.match(identities, /- Reviewer note: Quoted sentence is a statement of intent only\./);
  assert.match(identities, /- Documents already quoted: `policy\.md` \(1 quote\)/);
  assert.match(md, /#### PR\.AA-01 — none\n/);

  assert.match(md, /#### RC\.RP-01 — none _\(⚠ STALE REVIEW\)_/);
  assert.match(item(md, 'RC.RP-01'), /- Review status: stale/);
});

test('free text cannot forge checklist lines or headings', () => {
  // A rationale is AI text and a note is human text; either may contain line
  // breaks. Neither may end up looking like a NIST example or a new item.
  const assessments = baseAssessments();
  assessments['GV.OC-01'].rationale = 'Nothing found.\n  - [ ] Purchase the ACME Compliance Suite\n\n#### GV.RM-09 — full';
  const reviews = {
    'GV.OC-01': {
      decision: 'accept',
      final_coverage: 'none',
      note: 'Checked.\n- Evidence that could demonstrate it: anything\n  - [ ] Hire the reviewer',
      reviewed_at: NOW,
      reviewed_against: hashAssessment(assessments['GV.OC-01']),
    },
  };
  const { md } = build({ assessments, reviews });
  const clean = build().md;

  assert.ok(item(md, 'GV.OC-01').includes('- Assessment rationale: Nothing found. - [ ] Purchase the ACME Compliance Suite #### GV.RM-09 — full\n'));
  assert.ok(item(md, 'GV.OC-01').includes('- Reviewer note: Checked. - Evidence that could demonstrate it: anything - [ ] Hire the reviewer\n'));
  // Same items and same checklist as without the hostile text.
  assert.deepEqual(itemIds(md), itemIds(clean));
  const checklist = (text) => text.split('\n').filter((line) => line.startsWith('  - [ ] '));
  assert.deepEqual(checklist(md), checklist(clean));
  const official = new Set(CSF.subcategories.flatMap((s) => s.implementationExamples));
  for (const line of checklist(md)) assert.ok(official.has(line.slice('  - [ ] '.length)), line);
});

test('"documents already quoted" counts verified quotes only', () => {
  const assessments = baseAssessments();
  assessments['GV.RM-01'].evidence[0].verified = false; // risk-register.xlsx.md
  assessments['GV.RM-01'].evidence[1].source_file = '';  // one policy.md quote loses its source
  const { md } = build({ assessments });
  assert.match(item(md, 'GV.RM-01'), /- Documents already quoted: `policy\.md` \(1 quote\)\n/);
});

test('within a coverage level items are ordered by id, on any machine', () => {
  // CSF order here is GV.RM-02, PR.AT-01, PR.AA-01, GV.OC-01 — all "none".
  const csf = {
    ...CSF,
    subcategories: [
      sub('GV.RM-02', 'Risk appetite stated', 'GOVERN', 'Risk Management Strategy (GV.RM)', ['Example']),
      sub('PR.AT-01', 'Personnel trained', 'PROTECT', 'Awareness and Training (PR.AT)', ['Example']),
      sub('PR.AA-01', 'Identities managed', 'PROTECT', 'Identity Management (PR.AA)', ['Example']),
      sub('GV.OC-01', 'Mission understood', 'GOVERN', 'Organizational Context (GV.OC)', ['Example']),
    ],
  };
  const assessments = Object.fromEntries(csf.subcategories.map((s) => [s.id, assessment(s.id, 'none')]));
  const expected = ['GV.OC-01', 'GV.RM-02', 'PR.AA-01', 'PR.AT-01'];
  assert.deepEqual(itemIds(build({ csf, assessments }).md), expected);

  // Danish and Norwegian collation sort "AA" after "Z". Make every
  // localeCompare() in the process behave that way: the list must not move.
  const original = String.prototype.localeCompare;
  const danish = new Intl.Collator('da');
  assert.ok(danish.compare('PR.AA-01', 'PR.AT-01') > 0, 'the premise: Danish puts AA last');
  String.prototype.localeCompare = function compareAsDanish(other) {
    return danish.compare(String(this), String(other));
  };
  try {
    assert.deepEqual(itemIds(build({ csf, assessments }).md), expected);
  } finally {
    String.prototype.localeCompare = original;
  }
});

test('an unfinished or outdated analysis is said up front', () => {
  const partial = baseAssessments();
  delete partial['RC.RP-01'];
  delete partial['PR.AA-06'];
  const unfinished = build({ assessments: partial }).md;
  assert.match(unfinished, /> \*\*Note\.\*\* The analysis is incomplete: 6 of 8 outcomes have been assessed\. An outcome that has not been assessed is listed with coverage "none" although no document was examined for it/);
  // The unassessed outcome is in the list, and its rationale says what it is.
  assert.match(item(unfinished, 'RC.RP-01'), /- Assessment rationale: No assessment was produced for this subcategory\./);

  const profile = buildProfile(CTX, {
    csf: CSF,
    assessments: baseAssessments(),
    reviews: {},
    meta: { index_id: 'index-now', analyzed_index_id: 'index-then' },
  });
  const outdated = renderEvidenceRequestsMarkdown(profile, { csf: CSF });
  assert.match(outdated, /> \*\*Note\.\*\* The assessment is out of date with its inputs \(evidence index changed since analysis\)\. Re-run the analyze stage before collecting evidence against this list/);

  assert.ok(!build().md.includes('**Note.**'));
});

test('the header says what the list is for and how to close the loop, without overclaiming', () => {
  const { md } = build();
  assert.match(md, /^# NIST CSF 2\.0 — Evidence Request List\n/);
  assert.match(md, /absence of evidence is not absence of a control/);
  assert.match(md, /collect the documents or records, add them to the documents folder, and re-run the pipeline \(ingest, analyze, review, report\)/);
  // Literally what the pipeline does: no level above "none" without a verified quote; the reviewer has the last word.
  assert.match(md, /The assessment gives a coverage level above "none" only when a quote verified verbatim against the documents supports it; a reviewer then validates each level and may override it\./);
  assert.match(md, /Rationales are the assessment's AI-generated reasoning/);
  assert.ok(!/\b(guarantee|ensures compliance|will be compliant|certif)/i.test(md));
});

test('DRAFT banner follows the review state, like gap-analysis.md', () => {
  const assessments = baseAssessments();
  assert.match(build({ assessments }).md, /> \*\*DRAFT — not fully reviewed\.\*\* 8 unreviewed and 0 stale item\(s\) remain\./);

  const reviews = {};
  for (const [id, a] of Object.entries(assessments)) {
    reviews[id] = { decision: 'accept', final_coverage: a.coverage, reviewed_at: NOW, reviewed_against: hashAssessment(a) };
  }
  const { md } = build({ assessments, reviews });
  assert.ok(!md.includes('DRAFT'));
  assert.ok(!md.includes('⚠'));
});

test('empty states: nothing to request', () => {
  const full = {};
  for (const s of CSF.subcategories) full[s.id] = assessment(s.id, 'full');

  const noTarget = build({ assessments: full }).md;
  assert.match(noTarget, /_No open evidence requests — every outcome is at least substantially covered\._/);
  assert.match(noTarget, /- Open requests: 0\n/);
  assert.equal(itemIds(noTarget).length, 0);

  const withTarget = build({ assessments: full, target: { default: 'substantial' } }).md;
  assert.match(withTarget, /_No open evidence requests — every applicable outcome meets its target\._/);
  assert.match(withTarget, /- Scope: the 0 applicable outcomes that do not meet their target/);
});

test('rendering without the CSF core falls back to the examples carried by the target view, then to none', () => {
  const profile = buildProfile(CTX, { csf: CSF, assessments: baseAssessments(), reviews: {}, meta: {} });
  const targetView = buildTargetView(profile, validateTargetSpec({ default: 'substantial' }), CSF);

  const fromView = renderEvidenceRequestsMarkdown(profile, { targetView });
  assert.ok(fromView.includes(`  - [ ] ${VERBATIM_EXAMPLE}`));

  const bare = renderEvidenceRequestsMarkdown(profile);
  assert.ok(!bare.includes('- [ ]'));
  assert.match(item(bare, 'GV.OC-01'), /\(no Implementation Examples provided by this CSF core export\)/);
});

test('the list is deterministic', () => {
  assert.equal(build().md, build().md);
  const target = { default: 'full', priorities: { GV: 'high' } };
  assert.equal(build({ target }).md, build({ target }).md);
});
