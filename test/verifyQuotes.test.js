import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyQuotes, verifyAndDowngrade } from '../src/engine/verifier.js';

// A representative retrieval: one chunk without a page, one PDF chunk with
// typographic punctuation, and one bare chunk with no page and no score.
function hits() {
  return [
    {
      chunk: {
        id: 'policy.md~aaa111#na#c0',
        source_file: 'policy.md',
        page: null,
        text: 'The   Policy is reviewed and re-approved ANNUALLY by the Security Committee.\nAccess requests must be approved by the system owner.',
      },
      score: 0.61234567,
    },
    {
      chunk: {
        id: 'plan.pdf~bbb222#p2#c1',
        source_file: 'plan.pdf',
        page: 2,
        text: 'Alerts are triaged every business day. The plan’s “tabletop” test — held in February — was recorded.',
      },
      score: 0.4,
    },
    { chunk: { id: 'bare.txt~ccc333#na#c2', source_file: 'bare.txt', text: 'Inventories of hardware are maintained in the CMDB.' } },
  ];
}

// A real quote, a real quote with normalized punctuation attributed to the
// wrong file, a fabricated quote, a trivial one, and a real quote attributed to
// a file that was not retrieved at all.
function mixedEvidence() {
  return [
    { source_file: 'policy.md', quote: 'the policy is reviewed and re-approved annually by the security committee.' },
    { source_file: 'policy.md', quote: 'The plan\'s "tabletop" test - held in February - was recorded.' },
    { source_file: 'plan.pdf', quote: 'Privileged access is reviewed quarterly and automatically revoked after 90 days.' },
    { source_file: 'policy.md', quote: 'the' },
    { source_file: 'nowhere.md', quote: 'Inventories of hardware are maintained in the CMDB.' },
  ];
}

// REGRESSION (shape + key order): verifyQuotes was extracted from
// verifyAndDowngrade so that `ask` verifies quotes with the same rules. These
// strings were recorded from verifyAndDowngrade BEFORE the extraction; the
// serialized output — every field, in the same order — must not move, because
// assessments.json, review hashes and the published evaluation depend on it.
const RECORDED = {
  mixed:
    '{"subcategory_id":"GV.PO-01","coverage":"substantial","confidence":0.8,"evidence":[' +
    '{"source_file":"policy.md","quote":"the policy is reviewed and re-approved annually by the security committee.","page":null,"chunk_id":"policy.md~aaa111#na#c0","score":0.61234567,"verified":true,"attribution_corrected":false},' +
    '{"source_file":"plan.pdf","quote":"The plan\'s \\"tabletop\\" test - held in February - was recorded.","page":2,"chunk_id":"plan.pdf~bbb222#p2#c1","score":0.4,"verified":true,"attribution_corrected":true},' +
    '{"source_file":"bare.txt","quote":"Inventories of hardware are maintained in the CMDB.","page":null,"chunk_id":"bare.txt~ccc333#na#c2","score":null,"verified":true,"attribution_corrected":true}],' +
    '"rationale":"Policy is reviewed annually.","needs_review":true,"verifier_action":"dropped_2_unverifiable_quotes","verification":{"quotes_checked":5,"quotes_verified":3,"downgraded":false}}',
  allFabricated:
    '{"subcategory_id":"PR.AA-05","coverage":"none","confidence":0,"evidence":[],' +
    '"rationale":"[Auto-downgraded: the claimed coverage had no verifiable verbatim quote in the retrieved evidence.] Fabricated.",' +
    '"needs_review":true,"verifier_action":"downgraded_to_none_no_valid_quote","verification":{"quotes_checked":1,"quotes_verified":0,"downgraded":true}}',
  noneWithQuote:
    '{"subcategory_id":"DE.CM-01","coverage":"none","confidence":0.2,"evidence":[],"rationale":"Intent only.","needs_review":true,' +
    '"verifier_action":null,"verification":{"quotes_checked":1,"quotes_verified":1,"downgraded":false}}',
  clean:
    '{"subcategory_id":"DE.CM-01","coverage":"partial","confidence":0.7,"evidence":[' +
    '{"source_file":"plan.pdf","quote":"Alerts are triaged every business day.","page":2,"chunk_id":"plan.pdf~bbb222#p2#c1","score":0.4,"verified":true,"attribution_corrected":false}],' +
    '"rationale":"Triage happens.","needs_review":false,"verifier_action":null,"verification":{"quotes_checked":1,"quotes_verified":1,"downgraded":false}}',
};

test('REGRESSION: verifyAndDowngrade output is unchanged in shape and key order (mixed quotes)', () => {
  const assessment = {
    subcategory_id: 'GV.PO-01',
    coverage: 'substantial',
    confidence: 0.8,
    evidence: mixedEvidence(),
    rationale: 'Policy is reviewed annually.',
    needs_review: false,
  };
  const out = verifyAndDowngrade(assessment, hits());
  assert.equal(out, assessment, 'the assessment is still mutated and returned');
  assert.equal(JSON.stringify(out), RECORDED.mixed);
});

test('REGRESSION: verifyAndDowngrade output is unchanged for downgrade, "none", and clean cases', () => {
  const allFabricated = {
    subcategory_id: 'PR.AA-05',
    coverage: 'full',
    confidence: 0.9,
    evidence: [{ source_file: 'policy.md', quote: 'Privileged access is reviewed quarterly and automatically revoked after 90 days.' }],
    rationale: 'Fabricated.',
    needs_review: false,
  };
  const noneWithQuote = {
    subcategory_id: 'DE.CM-01',
    coverage: 'none',
    confidence: 0.2,
    evidence: [{ source_file: 'plan.pdf', quote: 'Alerts are triaged every business day.' }],
    rationale: 'Intent only.',
    needs_review: true,
  };
  const clean = {
    subcategory_id: 'DE.CM-01',
    coverage: 'partial',
    confidence: 0.7,
    evidence: [{ source_file: 'plan.pdf', quote: 'Alerts are triaged every business day.' }],
    rationale: 'Triage happens.',
    needs_review: false,
  };
  assert.equal(JSON.stringify(verifyAndDowngrade(allFabricated, hits())), RECORDED.allFabricated);
  assert.equal(JSON.stringify(verifyAndDowngrade(noneWithQuote, hits())), RECORDED.noneWithQuote);
  assert.equal(JSON.stringify(verifyAndDowngrade(clean, hits())), RECORDED.clean);
});

test('verifyQuotes returns the verified, enriched quotes and the number dropped', () => {
  const { verified, checked, dropped } = verifyQuotes(mixedEvidence(), hits());
  assert.equal(checked, 5);
  assert.equal(dropped, 2); // the fabricated quote and the trivial one
  assert.deepEqual(verified.map((e) => e.source_file), ['policy.md', 'plan.pdf', 'bare.txt']);
  // Each item carries the provenance of the chunk that really contains it.
  assert.deepEqual(Object.keys(verified[0]), [
    'source_file', 'quote', 'page', 'chunk_id', 'score', 'verified', 'attribution_corrected',
  ]);
  assert.equal(verified[1].page, 2);
  assert.equal(verified[1].attribution_corrected, true);
  assert.equal(verified[2].score, null);
});

test('verifyQuotes and verifyAndDowngrade agree on which quotes are real', () => {
  const direct = verifyQuotes(mixedEvidence(), hits());
  const viaAssessment = verifyAndDowngrade(
    { subcategory_id: 'X', coverage: 'partial', confidence: 0.5, evidence: mixedEvidence(), rationale: 'r', needs_review: false },
    hits(),
  );
  assert.deepEqual(viaAssessment.evidence, direct.verified);
  assert.equal(viaAssessment.verification.quotes_checked, direct.checked);
  assert.equal(viaAssessment.verification.quotes_verified, direct.verified.length);
});

test('verifyQuotes does not mutate its input and treats a non-array as no quotes', () => {
  const claimed = mixedEvidence();
  const before = JSON.stringify(claimed);
  verifyQuotes(claimed, hits());
  assert.equal(JSON.stringify(claimed), before);

  for (const notAnArray of [undefined, null, 'quote', { quote: 'x' }]) {
    assert.deepEqual(verifyQuotes(notAnArray, hits()), { verified: [], checked: 0, dropped: 0 });
  }
});

test('verifyQuotes applies the same rules as assessments: cross-chunk, trivial and paraphrased quotes are dropped', () => {
  const evidence = [
    { chunk: { id: 'a#c0', source_file: 'a.md', page: null, text: 'The first half of a sentence' }, score: 0.5 },
    { chunk: { id: 'b#c0', source_file: 'b.md', page: null, text: 'and the second half together. The floor area of 500 m2 is monitored continuously.' }, score: 0.4 },
  ];
  const claimed = [
    { source_file: 'a.md', quote: 'The first half of a sentence and the second half together.' }, // spans two chunks
    { source_file: 'b.md', quote: 'is' }, // trivial
    { source_file: 'b.md', quote: 'floor area of 500 m² is monitored continuously' }, // m² is not m2
    { source_file: 'b.md', quote: 'The floor area of 500 m2 is monitored continuously.' }, // real
  ];
  const { verified, dropped } = verifyQuotes(claimed, evidence);
  assert.equal(dropped, 3);
  assert.deepEqual(verified.map((e) => e.quote), ['The floor area of 500 m2 is monitored continuously.']);
});
