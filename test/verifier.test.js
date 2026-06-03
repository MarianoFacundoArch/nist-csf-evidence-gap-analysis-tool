import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAndDowngrade, normalizeForMatch } from '../src/engine/verifier.js';

function hit(source_file, text, { page = null, id = `${source_file}#c0`, score = 0.5 } = {}) {
  return { chunk: { source_file, page, id, text }, score };
}

test('ACCEPTANCE: a fabricated quote is downgraded to "none" and flagged', () => {
  const evidence = [hit('access-policy.pdf', 'All privileged access requests must be approved by the system owner before provisioning.', { page: 2 })];
  const assessment = {
    subcategory_id: 'PR.AA-05',
    coverage: 'substantial',
    confidence: 0.82,
    evidence: [{ source_file: 'access-policy.pdf', quote: 'Privileged access is reviewed quarterly and automatically revoked after 90 days.' }],
    rationale: 'The org reviews and revokes privileged access on a schedule.',
    needs_review: false,
  };

  verifyAndDowngrade(assessment, evidence);

  assert.equal(assessment.coverage, 'none');
  assert.equal(assessment.confidence, 0);
  assert.equal(assessment.needs_review, true);
  assert.deepEqual(assessment.evidence, []);
  assert.equal(assessment.verifier_action, 'downgraded_to_none_no_valid_quote');
  assert.equal(assessment.verification.downgraded, true);
});

test('a real verbatim quote survives (whitespace/case-insensitive) and gets provenance', () => {
  const evidence = [hit('policy.md', 'The   Policy is reviewed and re-approved ANNUALLY by the Security Committee.', { page: 3, id: 'policy.md#c1' })];
  const assessment = {
    subcategory_id: 'GV.PO-01',
    coverage: 'partial',
    confidence: 0.7,
    // Different spacing/case than the source — still a verbatim match after normalization.
    evidence: [{ source_file: 'policy.md', quote: 'the policy is reviewed and re-approved annually by the security committee.' }],
    rationale: 'Policy is reviewed annually.',
    needs_review: false,
  };

  verifyAndDowngrade(assessment, evidence);

  assert.equal(assessment.coverage, 'partial');
  assert.equal(assessment.evidence.length, 1);
  assert.equal(assessment.evidence[0].verified, true);
  assert.equal(assessment.evidence[0].page, 3);
  assert.equal(assessment.evidence[0].chunk_id, 'policy.md#c1');
  assert.equal(assessment.verification.downgraded, false);
});

test('a real quote attributed to the wrong file is kept but re-attributed and flagged', () => {
  const evidence = [
    hit('a.md', 'Unrelated content about coffee.'),
    hit('b.md', 'Inventories of hardware are maintained in the CMDB.'),
  ];
  const assessment = {
    subcategory_id: 'ID.AM-01',
    coverage: 'substantial',
    confidence: 0.8,
    evidence: [{ source_file: 'a.md', quote: 'Inventories of hardware are maintained in the CMDB.' }],
    rationale: 'Hardware inventory maintained.',
    needs_review: false,
  };

  verifyAndDowngrade(assessment, evidence);

  assert.equal(assessment.coverage, 'substantial'); // real quote -> not downgraded
  assert.equal(assessment.evidence[0].source_file, 'b.md'); // corrected attribution
  assert.equal(assessment.evidence[0].attribution_corrected, true);
});

test('coverage "none" stays "none" and requires no quote', () => {
  const evidence = [hit('x.md', 'Something irrelevant.')];
  const assessment = { subcategory_id: 'DE.CM-01', coverage: 'none', confidence: 0.3, evidence: [], rationale: 'No evidence.', needs_review: true };
  verifyAndDowngrade(assessment, evidence);
  assert.equal(assessment.coverage, 'none');
  assert.equal(assessment.verifier_action, null);
});

test('a quote spanning two separate chunks does not verify', () => {
  const evidence = [hit('a.md', 'The first half of a sentence'), hit('b.md', 'and the second half together.')];
  const assessment = {
    subcategory_id: 'PR.DS-01',
    coverage: 'partial',
    confidence: 0.6,
    evidence: [{ source_file: 'a.md', quote: 'The first half of a sentence and the second half together.' }],
    rationale: 'Spanning quote.',
    needs_review: false,
  };
  verifyAndDowngrade(assessment, evidence);
  assert.equal(assessment.coverage, 'none'); // cross-chunk fabrication rejected
});

test('a "none" judgment carries no evidence even if the model attached a quote', () => {
  // Real small models sometimes return coverage "none" alongside a (real) quote.
  const evidence = [hit('a.md', 'The SOC reviews IDS alerts every business day.')];
  const assessment = {
    subcategory_id: 'DE.CM-01',
    coverage: 'none',
    confidence: 0.2,
    evidence: [{ source_file: 'a.md', quote: 'The SOC reviews IDS alerts every business day.' }],
    rationale: 'Reads as intent rather than demonstrated operation.',
    needs_review: true,
  };
  verifyAndDowngrade(assessment, evidence);
  assert.equal(assessment.coverage, 'none');
  assert.deepEqual(assessment.evidence, []); // "none" carries no evidence
});

test('a trivial one-word quote cannot prop up coverage (substantive-quote bar)', () => {
  const evidence = [hit('x.md', 'We keep the break room stocked with coffee and tea.')];
  for (const quote of ['the', '.', 'is']) {
    const a = {
      subcategory_id: 'PR.AA-05',
      coverage: 'substantial',
      confidence: 0.9,
      evidence: [{ source_file: 'x.md', quote }],
      rationale: 'fabricated claim',
      needs_review: false,
    };
    verifyAndDowngrade(a, evidence);
    assert.equal(a.coverage, 'none', `quote ${JSON.stringify(quote)} must not anchor coverage`);
    assert.equal(a.verifier_action, 'downgraded_to_none_no_valid_quote');
    assert.deepEqual(a.evidence, []);
  }
});

test('NFC normalization does not let a compatibility-folded quote (m² vs m2) pass as verbatim', () => {
  const evidence = [hit('e.md', 'The floor area of 500 m2 is monitored continuously by the sensors.')];
  const a = {
    subcategory_id: 'DE.CM-01',
    coverage: 'partial',
    confidence: 0.7,
    evidence: [{ source_file: 'e.md', quote: 'floor area of 500 m² is monitored continuously' }],
    rationale: 'r',
    needs_review: false,
  };
  verifyAndDowngrade(a, evidence);
  // m² (superscript) is NOT character-for-character "m2"; under NFC it is not
  // folded, so this is not a verbatim match -> dropped -> downgraded.
  assert.equal(a.coverage, 'none');
});

test('normalizeForMatch unifies whitespace, case, and smart punctuation', () => {
  assert.equal(normalizeForMatch('  The “Quick”   Brown—Fox ’s  '), 'the "quick" brown-fox \'s');
});
