import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReview } from '../src/review/review.js';
import { hashAssessment } from '../src/util/hash.js';
import { ConfigError } from '../src/core/errors.js';

const NOW = '2026-01-01T00:00:00.000Z';

const CSF = {
  subcategories: [
    { id: 'GV.OC-01', functionName: 'GOVERN', category: 'Organizational Context (GV.OC)', outcome: 'Mission understood' },
    { id: 'GV.OC-02', functionName: 'GOVERN', category: 'Organizational Context (GV.OC)', outcome: 'Stakeholders understood' },
    { id: 'PR.AA-01', functionName: 'PROTECT', category: 'Identity Management (PR.AA)', outcome: 'Identities managed' },
  ],
};

function assessment(id, coverage, needsReview) {
  return { subcategory_id: id, coverage, confidence: 0.5, evidence: [], rationale: 'r', needs_review: needsReview };
}

// Two flagged items in the queue, one that the default queue leaves out.
function fixture() {
  return {
    'GV.OC-01': assessment('GV.OC-01', 'none', true),
    'GV.OC-02': assessment('GV.OC-02', 'partial', true),
    'PR.AA-01': assessment('PR.AA-01', 'substantial', false),
  };
}

function nonInteractiveCtx({ showAll = false } = {}) {
  const lines = [];
  return {
    lines,
    ctx: {
      config: { review: { showAll }, identity: null },
      now: () => NOW,
      ui: {
        isInteractive: false,
        info: (m) => lines.push(m),
        note: () => {},
        // A prompt in a session without a terminal would be a bug in itself.
        select: async () => assert.fail('must not prompt without a terminal'),
        text: async () => assert.fail('must not prompt without a terminal'),
      },
    },
  };
}

test('review without a terminal refuses instead of accepting the queue', async () => {
  const { ctx } = nonInteractiveCtx();
  const reviews = {};
  let writes = 0;
  await assert.rejects(
    runReview(ctx, { csf: CSF, assessments: fixture(), reviews, persist: async () => { writes++; } }),
    (err) =>
      err instanceof ConfigError &&
      /2 item\(s\) are waiting for review, and this session is not interactive/.test(err.message) &&
      /--accept-all/.test(err.hint) &&
      /in a terminal/.test(err.hint),
  );
  // Nothing was decided on anyone's behalf, and nothing was written.
  assert.deepEqual(reviews, {});
  assert.equal(writes, 0);
});

test('review without a terminal accepts the queue only on explicit --accept-all', async () => {
  const { ctx } = nonInteractiveCtx();
  const assessments = fixture();
  const reviews = {};
  const stats = await runReview(ctx, { csf: CSF, assessments, reviews, persist: async () => {}, acceptAll: true });

  assert.equal(stats.reviewed, 2);
  // Only the queue is accepted: the item that was not flagged stays unreviewed.
  assert.deepEqual(Object.keys(reviews).sort(), ['GV.OC-01', 'GV.OC-02']);
  assert.equal(stats.remaining, 1);
  assert.deepEqual(reviews['GV.OC-01'], {
    subcategory_id: 'GV.OC-01',
    decision: 'accept',
    final_coverage: 'none',
    note: null,
    reviewed_by: null,
    reviewed_at: NOW,
    reviewed_against: hashAssessment(assessments['GV.OC-01']),
  });
});

test('review without a terminal and with nothing to review is not an error', async () => {
  const { ctx, lines } = nonInteractiveCtx();
  const assessments = fixture();
  const reviews = {};
  // Everything in the default queue already carries a current decision.
  for (const id of ['GV.OC-01', 'GV.OC-02']) {
    reviews[id] = { subcategory_id: id, decision: 'accept', final_coverage: assessments[id].coverage, reviewed_against: hashAssessment(assessments[id]) };
  }
  const stats = await runReview(ctx, { csf: CSF, assessments, reviews, persist: async () => {} });
  assert.equal(stats.reviewed, 0);
  // The queue is empty, but the item that was never flagged is still unreviewed:
  // the run must say so instead of reporting everything as resolved.
  assert.equal(stats.remaining, 1);
  assert.match(lines.join('\n'), /Nothing in the review queue\. 1 item\(s\) that were not flagged for review are still unreviewed/);
  assert.match(lines.join('\n'), /review --all/);
  assert.doesNotMatch(lines.join('\n'), /all items are resolved/);
});

test('"all items are resolved" is said only when every item carries a current decision', async () => {
  const { ctx, lines } = nonInteractiveCtx();
  const assessments = fixture();
  const reviews = {};
  for (const id of Object.keys(assessments)) {
    reviews[id] = { subcategory_id: id, decision: 'accept', final_coverage: assessments[id].coverage, reviewed_against: hashAssessment(assessments[id]) };
  }
  const stats = await runReview(ctx, { csf: CSF, assessments, reviews, persist: async () => {} });
  assert.equal(stats.remaining, 0);
  assert.match(lines.join('\n'), /Nothing to review — all items are resolved\./);
});

test('the refusal also covers --all (review every item) without a terminal', async () => {
  const { ctx } = nonInteractiveCtx({ showAll: true });
  await assert.rejects(
    runReview(ctx, { csf: CSF, assessments: fixture(), reviews: {}, persist: async () => {} }),
    (err) => err instanceof ConfigError && /3 item\(s\) are waiting for review/.test(err.message),
  );
});
