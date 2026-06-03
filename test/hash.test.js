import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashAssessment } from '../src/util/hash.js';

test('harmless drift (score/rationale/confidence/timestamp) does NOT change the staleness hash', () => {
  const base = {
    coverage: 'partial',
    confidence: 0.62,
    rationale: 'the original wording',
    needs_review: true,
    evidence: [{ source_file: 'a.md', quote: 'a verbatim supporting sentence', score: 0.4382083607, page: 1, chunk_id: 'a#c0' }],
    retrieved: [{ score: 0.4382 }],
    assessed_at: 't1',
  };
  const drifted = {
    ...base,
    confidence: 0.63, // model jitter
    rationale: 'reworded on a later run', // models reword each run
    assessed_at: 't2',
    evidence: [{ source_file: 'a.md', quote: 'a verbatim supporting sentence', score: 0.4382099991, page: 1, chunk_id: 'a#c0' }],
  };
  assert.equal(hashAssessment(base), hashAssessment(drifted));
});

test('a coverage change DOES change the staleness hash', () => {
  const base = { coverage: 'partial', evidence: [{ source_file: 'a.md', quote: 'q' }] };
  assert.notEqual(hashAssessment(base), hashAssessment({ ...base, coverage: 'substantial' }));
});

test('a supporting-quote change DOES change the staleness hash', () => {
  const a = { coverage: 'partial', evidence: [{ source_file: 'a.md', quote: 'quote one' }] };
  const b = { coverage: 'partial', evidence: [{ source_file: 'a.md', quote: 'quote two' }] };
  assert.notEqual(hashAssessment(a), hashAssessment(b));
});
