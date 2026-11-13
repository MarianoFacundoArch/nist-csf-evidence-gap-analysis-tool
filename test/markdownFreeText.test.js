/**
 * Free text in the Markdown reports stays on its own line.
 *
 * A rationale is written by the model, and the model reads the organization's
 * documents: a document can ask it to write anything. Notes and descriptions
 * are typed by people. Each of these is printed on a "- Label: …" line that is
 * followed by lines the tool vouches for — in remediation-plan.md, NIST's own
 * Implementation Examples. A line break inside the free text used to let it
 * continue as a list item or a heading, indistinguishable from those.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../src/report/profile.js';
import { buildTargetView, validateTargetSpec } from '../src/target/targetProfile.js';
import { renderGapMarkdown } from '../src/report/gapMarkdown.js';
import { renderRemediationMarkdown } from '../src/report/remediationMarkdown.js';
import { hashAssessment } from '../src/util/hash.js';

const NOW = '2026-01-01T00:00:00.000Z';
const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' } },
  now: () => NOW,
};
const CSF = {
  frameworkVersion: 'CSF 2.0',
  sample: false,
  functions: [{ id: 'GV', name: 'GOVERN' }, { id: 'PR', name: 'PROTECT' }],
  subcategories: [
    sub('GV.OC-01', 'Mission understood', 'GOVERN', 'Organizational Context (GV.OC)', ['Share the mission']),
    sub('PR.AA-01', 'Identities managed', 'PROTECT', 'Identity Management (PR.AA)', ['Maintain identity inventory', 'Review identities']),
    sub('PR.AA-05', 'Access enforced', 'PROTECT', 'Identity Management (PR.AA)', ['Require MFA']),
  ],
};

function sub(id, outcome, fnName, category, examples) {
  return {
    id, outcome, function: fnName, category,
    functionId: id.split('.')[0], functionName: fnName, categoryId: id.split('-')[0],
    implementationExamples: examples,
  };
}

function assessment(id, rationale) {
  return {
    subcategory_id: id,
    coverage: 'none',
    confidence: 0.3,
    evidence: [],
    rationale,
    needs_review: true,
    verification: { quotes_checked: 0, quotes_verified: 0, downgraded: false },
  };
}

const INJECTED_ITEM = '  3. Purchase the ACME Compliance Suite';
const INJECTED_HEADING = '## Substantially or fully covered';

function render({ hostile }) {
  // The benign twin says the same things on one line, so the two documents
  // must have the same structure: same headings, same list items.
  const lineBreak = hostile ? '\n' : ' ';
  const assessments = {
    'GV.OC-01': assessment('GV.OC-01', `Nothing found.${lineBreak}${INJECTED_HEADING}${lineBreak}- **PR.AA-01** — _full_: Identities managed`),
    'PR.AA-01': assessment('PR.AA-01', `Nothing found.${lineBreak}- Suggested actions (NIST CSF 2.0 Implementation Examples):${lineBreak}${INJECTED_ITEM}`),
    'PR.AA-05': assessment('PR.AA-05', 'Nothing found.'),
  };
  const reviews = {
    'GV.OC-01': {
      decision: 'accept',
      final_coverage: 'none',
      note: `Checked.${lineBreak}- **GV.OC-01** — _full_`,
      reviewed_at: NOW,
      reviewed_against: hashAssessment(assessments['GV.OC-01']),
    },
  };
  const profile = buildProfile(CTX, { csf: CSF, assessments, reviews, meta: {} });
  const view = buildTargetView(
    profile,
    validateTargetSpec({
      default: 'substantial',
      description: `Baseline for the audit.${lineBreak}## Prioritized action plan`,
      subcategories: { 'PR.AA-05': 'not-applicable' },
      notes: {
        'PR.AA-01': `Contractual.${lineBreak}  9. Buy more licenses`,
        'PR.AA-05': `No such systems.${lineBreak}- **PR.AA-01** — met`,
      },
    }),
    CSF,
  );
  return { gap: renderGapMarkdown(profile, { targetView: view }), plan: renderRemediationMarkdown(profile, view) };
}

const headings = (md) => md.split('\n').filter((line) => line.startsWith('#'));
/** What each line IS in Markdown terms: heading, list item (with its indent), or other. */
const structure = (md) =>
  md.split('\n').map((line) => (/^#+ /.exec(line) ?? /^\s*(?:-|\d+\.) /.exec(line) ?? [''])[0].replace(/\d+/, 'N'));

test('a line break in free text adds no heading and no list item to gap-analysis.md', () => {
  const hostile = render({ hostile: true }).gap;
  const benign = render({ hostile: false }).gap;

  // Line for line the same kind of document as when the text has no line breaks.
  assert.deepEqual(structure(hostile), structure(benign));
  assert.equal(headings(hostile).filter((h) => h === INJECTED_HEADING).length, 1);
  assert.ok(hostile.includes(`  - Rationale: Nothing found. ${INJECTED_HEADING} - **PR.AA-01** — _full_: Identities managed\n`));
  assert.ok(hostile.includes('  - Reviewer note: Checked. - **GV.OC-01** — _full_\n'));
});

test('a line break in free text cannot add a look-alike NIST action to remediation-plan.md', () => {
  const hostile = render({ hostile: true }).plan;
  const benign = render({ hostile: false }).plan;

  assert.deepEqual(structure(hostile), structure(benign));
  assert.equal(headings(hostile).filter((h) => h === '## Prioritized action plan').length, 1);
  // The numbered actions are NIST's examples and nothing else.
  const numbered = hostile.split('\n').filter((line) => /^ {2}\d+\. /.test(line));
  assert.deepEqual(numbered, ['  1. Share the mission', '  1. Maintain identity inventory', '  2. Review identities']);
  assert.ok(!hostile.split('\n').includes(INJECTED_ITEM));
  assert.ok(hostile.includes('- Assessment rationale: Nothing found. - Suggested actions (NIST CSF 2.0 Implementation Examples): 3. Purchase the ACME Compliance Suite\n'));
  // Human text is flattened the same way: description, target note, out-of-scope reason.
  assert.ok(hostile.includes('- Target description: Baseline for the audit. ## Prioritized action plan\n'));
  assert.ok(hostile.includes('- Target note: Contractual. 9. Buy more licenses\n'));
  assert.ok(hostile.includes('- **PR.AA-05** — Access enforced _(reason: No such systems. - **PR.AA-01** — met)_\n'));
});
