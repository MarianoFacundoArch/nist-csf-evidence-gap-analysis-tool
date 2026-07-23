import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildAssessmentStatus, renderAssessmentStatus } from '../src/status/assessmentStatus.js';
import { buildReportSnapshot } from '../src/status/reportSnapshot.js';
import { status as statusAction } from '../src/actions/status.js';
import { parseCliArgs, HELP_TEXT } from '../src/cli/flags.js';
import { resolvePaths } from '../src/core/paths.js';
import { hashAssessment } from '../src/util/hash.js';

function assessment(coverage, quote, assessedAt, needsReview = false, engineSig = null) {
  return {
    coverage,
    evidence: quote ? [{ source_file: 'policy.md', quote }] : [],
    assessed_at: assessedAt,
    needs_review: needsReview,
    ...(engineSig ? { engine_sig: engineSig } : {}),
  };
}

function decisionFor(value, reviewedAt, reviewedAgainst = hashAssessment(value)) {
  return {
    decision: 'accept',
    final_coverage: value.coverage,
    reviewed_at: reviewedAt,
    reviewed_against: reviewedAgainst,
  };
}

test('status shows empty pipeline state and recommends ingest', () => {
  const result = buildAssessmentStatus({
    subcategoryIds: ['GV.OC-01', 'ID.AM-01'],
    workDir: '/tmp/assessment',
  });

  assert.equal(result.ingest.status, 'not-started');
  assert.equal(result.analysis.status, 'not-started');
  assert.deepEqual(
    { reviewed: result.review.reviewed, stale: result.review.stale, unreviewed: result.review.unreviewed },
    { reviewed: 0, stale: 0, unreviewed: 2 },
  );
  assert.equal(result.report.status, 'missing');
  assert.equal(result.next.command, 'csf-tool ingest');

  const output = renderAssessmentStatus(result);
  assert.match(output, /Work directory: \/tmp\/assessment/);
  assert.match(output, /Analyze\s+0\/2 assessed/);
  assert.match(output, /Next: csf-tool ingest/);
});

test('status uses reviewStatus semantics, tracks last review, and identifies newer report inputs', () => {
  const first = assessment('partial', 'first verified quote', '2026-01-01T10:00:00.000Z');
  const second = assessment('full', 'new quote after re-analysis', '2026-01-01T10:30:00.000Z');
  const assessments = { A: first, B: second, C: assessment('none', null, '2026-01-01T10:45:00.000Z') };
  const reviews = {
    A: decisionFor(first, '2026-01-01T12:00:00.000Z'),
    B: decisionFor(second, '2026-01-01T13:00:00.000Z', 'old-assessment-hash'),
  };
  const target = { default: 'substantial', updatedAt: '2026-01-01T14:00:00.000Z' };
  const result = buildAssessmentStatus({
    subcategoryIds: ['A', 'B', 'C'],
    meta: {
      ingested_at: '2026-01-01T09:00:00.000Z',
      analyzed_at: '2026-01-01T11:00:00.000Z',
      ingest_report: { parsed: 4, skipped: 1, failed: 0 },
      llm_id: 'openai:test-model',
      report_snapshot: buildReportSnapshot({
        assessments,
        reviews,
        target,
        generatedAt: '2026-01-01T11:30:00.000Z',
      }),
    },
    assessments,
    reviews,
    target,
    profile: {
      generatedAt: '2026-01-01T11:30:00.000Z',
      summary: { totalSubcategories: 3, reviewed: 2, stale: 0, unreviewed: 1 },
      subcategories: [
        { subcategory_id: 'A', review_status: 'reviewed' },
        { subcategory_id: 'B', review_status: 'reviewed' },
        { subcategory_id: 'C', review_status: 'unreviewed' },
      ],
    },
  });

  assert.deepEqual(
    { reviewed: result.review.reviewed, stale: result.review.stale, unreviewed: result.review.unreviewed },
    { reviewed: 1, stale: 1, unreviewed: 1 },
  );
  assert.equal(result.review.lastReviewedAt, '2026-01-01T13:00:00.000Z');
  assert.equal(result.report.status, 'stale');
  assert.deepEqual(result.report.newerInputs.map(({ stage }) => stage), ['review', 'target']);
  assert.deepEqual(result.report.mismatches, ['review state']);
  assert.equal(result.lastActivityAt, '2026-01-01T14:00:00.000Z');
  assert.equal(result.next.command, 'csf-tool review --all');
});

test('a current completed assessment reports no required next action and includes report in last activity', () => {
  const first = assessment('partial', 'quote one', '2026-02-01T10:00:00.000Z');
  const second = assessment('full', 'quote two', '2026-02-01T10:00:00.000Z');
  const reviews = {
    A: decisionFor(first, '2026-02-01T11:00:00.000Z'),
    B: decisionFor(second, '2026-02-01T11:30:00.000Z'),
  };
  const result = buildAssessmentStatus({
    subcategoryIds: ['A', 'B'],
    meta: {
      ingested_at: '2026-02-01T09:00:00.000Z',
      analyzed_at: '2026-02-01T10:00:00.000Z',
      ingest_report: { parsed: 2, skipped: 0, failed: 0 },
      report_snapshot: buildReportSnapshot({
        assessments: { A: first, B: second },
        reviews,
        target: { default: 'full', updatedAt: '2026-02-01T12:00:00.000Z' },
        generatedAt: '2026-02-01T13:00:00.000Z',
      }),
    },
    assessments: { A: first, B: second },
    reviews,
    target: { default: 'full', updatedAt: '2026-02-01T12:00:00.000Z' },
    profile: {
      generatedAt: '2026-02-01T13:00:00.000Z',
      summary: { totalSubcategories: 2, reviewed: 2, stale: 0, unreviewed: 0 },
      subcategories: [
        { subcategory_id: 'A', review_status: 'reviewed' },
        { subcategory_id: 'B', review_status: 'reviewed' },
      ],
    },
  });

  assert.equal(result.review.status, 'complete');
  assert.equal(result.report.status, 'current');
  assert.equal(result.lastActivityAt, '2026-02-01T13:00:00.000Z');
  assert.equal(result.next, null);
  assert.match(renderAssessmentStatus(result), /Next: no action needed/);
});

test('review snapshot mismatch makes a report stale even when timestamps are equal', () => {
  const value = assessment('partial', 'verified quote', '2026-03-01T10:00:00.000Z');
  const review = decisionFor(value, '2026-03-01T10:00:00.000Z');
  const result = buildAssessmentStatus({
    subcategoryIds: ['A'],
    meta: {
      ingested_at: '2026-03-01T10:00:00.000Z',
      analyzed_at: '2026-03-01T10:00:00.000Z',
      ingest_report: { parsed: 1, skipped: 0, failed: 0 },
      report_snapshot: buildReportSnapshot({
        assessments: { A: value },
        reviews: { A: review },
        generatedAt: '2026-03-01T10:00:00.000Z',
      }),
    },
    assessments: { A: value },
    reviews: { A: review },
    profile: {
      generatedAt: '2026-03-01T10:00:00.000Z',
      summary: { totalSubcategories: 1, reviewed: 0, stale: 0, unreviewed: 1 },
      subcategories: [{ subcategory_id: 'A', review_status: 'unreviewed' }],
    },
  });

  assert.equal(result.report.status, 'stale');
  assert.deepEqual(result.report.newerInputs, []);
  assert.deepEqual(result.report.mismatches, ['review state']);
  assert.equal(result.next.command, 'csf-tool report');
});

test('an interrupted analysis after report generation is detected from assessed_at', () => {
  const result = buildAssessmentStatus({
    subcategoryIds: ['A', 'B'],
    meta: {
      ingested_at: '2026-04-01T08:00:00.000Z',
      ingest_report: { parsed: 1, skipped: 0, failed: 0 },
    },
    assessments: {
      A: assessment('partial', 'new analysis quote', '2026-04-01T12:00:00.000Z'),
    },
    profile: {
      generatedAt: '2026-04-01T11:00:00.000Z',
      summary: { totalSubcategories: 2, reviewed: 0, stale: 0, unreviewed: 2 },
      subcategories: [
        { subcategory_id: 'A', review_status: 'unreviewed' },
        { subcategory_id: 'B', review_status: 'unreviewed' },
      ],
    },
  });

  assert.equal(result.analysis.status, 'in-progress');
  assert.equal(result.report.status, 'stale');
  assert.deepEqual(result.report.newerInputs.map(({ stage }) => stage), ['analyze']);
  assert.equal(result.next.command, 'csf-tool analyze');
  assert.match(result.next.reason, /resume/);
});

test('a new evidence index makes otherwise complete assessments stale', () => {
  const value = assessment('partial', 'verified quote', '2026-04-02T10:00:00.000Z', false, 'engine-old');
  const result = buildAssessmentStatus({
    subcategoryIds: ['A'],
    meta: {
      ingested_at: '2026-04-02T12:00:00.000Z',
      analyzed_at: '2026-04-02T10:00:00.000Z',
      index_id: 'index-new',
      analyzed_index_id: 'index-old',
      engine_sig: 'engine-old',
      ingest_report: { parsed: 1, skipped: 0, failed: 0 },
    },
    assessments: { A: value },
    profile: {
      generatedAt: '2026-04-02T11:00:00.000Z',
      summary: { totalSubcategories: 1, reviewed: 0, stale: 0, unreviewed: 1 },
      subcategories: [{ subcategory_id: 'A', review_status: 'unreviewed' }],
    },
  });

  assert.equal(result.analysis.status, 'stale');
  assert.match(result.analysis.reasons.join(' '), /evidence index changed/);
  assert.equal(result.next.command, 'csf-tool analyze');
  assert.match(renderAssessmentStatus(result), /! Analyze/);
});

test('mixed assessment engine signatures are never reported as complete', () => {
  const result = buildAssessmentStatus({
    subcategoryIds: ['A', 'B'],
    meta: {
      ingested_at: '2026-04-03T09:00:00.000Z',
      analyzed_at: '2026-04-03T10:00:00.000Z',
      index_id: 'index-one',
      analyzed_index_id: 'index-one',
      engine_sig: 'engine-old',
      ingest_report: { parsed: 1, skipped: 0, failed: 0 },
    },
    assessments: {
      A: assessment('partial', 'old quote', '2026-04-03T10:00:00.000Z', false, 'engine-old'),
      B: assessment('full', 'new quote', '2026-04-03T11:00:00.000Z', false, 'engine-new'),
    },
  });

  assert.equal(result.analysis.status, 'stale');
  assert.deepEqual(result.analysis.reasons, ['mixed engine signatures']);
  assert.equal(result.next.command, 'csf-tool analyze');
});

test('report snapshot catches a hand-edited target without timestamp changes', () => {
  const value = assessment('full', 'verified quote', '2026-04-04T10:00:00.000Z', false, 'engine-one');
  const review = decisionFor(value, '2026-04-04T11:00:00.000Z');
  const originalTarget = { default: 'full' };
  const editedTarget = { default: 'partial' };
  const meta = {
    ingested_at: '2026-04-04T09:00:00.000Z',
    analyzed_at: '2026-04-04T10:00:00.000Z',
    index_id: 'index-one',
    analyzed_index_id: 'index-one',
    engine_sig: 'engine-one',
    ingest_report: { parsed: 1, skipped: 0, failed: 0 },
  };
  meta.report_snapshot = buildReportSnapshot({
    assessments: { A: value },
    reviews: { A: review },
    target: originalTarget,
    generatedAt: '2026-04-04T12:00:00.000Z',
    engineSig: meta.engine_sig,
    indexId: meta.index_id,
  });

  const result = buildAssessmentStatus({
    subcategoryIds: ['A'],
    meta,
    assessments: { A: value },
    reviews: { A: review },
    target: editedTarget,
    profile: {
      generatedAt: '2026-04-04T12:00:00.000Z',
      summary: { totalSubcategories: 1, reviewed: 1, stale: 0, unreviewed: 0 },
      subcategories: [{ subcategory_id: 'A', review_status: 'reviewed' }],
    },
    reportArtifacts: {
      gapReport: true,
      evidenceMap: true,
      dashboard: true,
      targetProfile: true,
      remediationPlan: true,
    },
  });

  assert.equal(result.report.status, 'stale');
  assert.ok(result.report.mismatches.includes('target profile'));
  assert.equal(result.next.command, 'csf-tool report');
});

test('missing or obsolete report deliverables make the report stale', () => {
  const base = {
    subcategoryIds: [],
    meta: {},
    target: null,
    profile: { generatedAt: '2026-04-05T12:00:00.000Z', summary: {} },
  };
  const result = buildAssessmentStatus({
    ...base,
    reportArtifacts: {
      gapReport: true,
      evidenceMap: true,
      dashboard: false,
      targetProfile: true,
      remediationPlan: true,
    },
  });

  assert.equal(result.report.status, 'stale');
  assert.ok(result.report.mismatches.includes('missing dashboard.html'));
  assert.ok(result.report.mismatches.includes('obsolete target-profile.json'));
});

test('a pre-snapshot report is stale once after upgrade', () => {
  const result = buildAssessmentStatus({
    profile: { generatedAt: '2026-04-05T12:00:00.000Z', summary: {} },
  });

  assert.equal(result.report.status, 'stale');
  assert.ok(result.report.mismatches.includes('report freshness snapshot unavailable'));
  assert.equal(result.next.command, 'csf-tool ingest');
});

test('a missing evidence index makes recorded ingest stale', () => {
  const result = buildAssessmentStatus({
    meta: {
      ingested_at: '2026-04-06T09:00:00.000Z',
      ingest_report: { parsed: 2, skipped: 0, failed: 0 },
    },
    indexExists: false,
  });

  assert.equal(result.ingest.status, 'stale');
  assert.equal(result.ingest.indexPresent, false);
  assert.equal(result.next.command, 'csf-tool ingest');
  assert.match(renderAssessmentStatus(result), /missing index\.json/);
});

test('invalid target state is explicit and blocks report generation', () => {
  const result = buildAssessmentStatus({
    subcategoryIds: [],
    target: { default: 'bogus' },
    targetError: 'Target baseline is invalid.',
  });

  assert.equal(result.target.status, 'invalid');
  assert.match(renderAssessmentStatus(result), /! Target\s+invalid/);
});

test('status action reads all artifacts without modifying them', async () => {
  const root = mkdtempSync(join(tmpdir(), 'csf-status-'));
  try {
    const reportsDir = join(root, 'reports');
    mkdirSync(reportsDir);

    const value = assessment('none', null, '2026-05-01T10:00:00.000Z', true);
    const artifacts = {
      meta: {
        ingested_at: '2026-05-01T09:00:00.000Z',
        analyzed_at: '2026-05-01T10:00:00.000Z',
        ingest_report: { parsed: 1, skipped: 0, failed: 0 },
        llm_id: 'mock',
      },
      assessments: { 'GV.OC-01': value },
      reviews: { 'GV.OC-01': decisionFor(value, '2026-05-01T11:00:00.000Z') },
      target: { default: 'substantial', updatedAt: '2026-05-01T12:00:00.000Z' },
      currentProfile: {
        generatedAt: '2026-05-01T13:00:00.000Z',
        summary: { totalSubcategories: 106, reviewed: 1, stale: 0, unreviewed: 105 },
      },
    };
    const paths = {
      root,
      meta: join(root, 'meta.json'),
      assessments: join(root, 'assessments.json'),
      reviews: join(root, 'reviews.json'),
      target: join(root, 'target.json'),
      currentProfile: join(reportsDir, 'current-profile.json'),
    };
    for (const [key, valueToWrite] of Object.entries(artifacts)) {
      writeFileSync(paths[key], JSON.stringify(valueToWrite, null, 2) + '\n');
    }
    const before = Object.fromEntries(
      Object.keys(artifacts).map((key) => [key, readFileSync(paths[key], 'utf8')]),
    );
    let note = null;
    const result = await statusAction({
      config: { csfCorePath: resolve('data/csf-core.json') },
      paths,
      logger: { info() {}, warn() {} },
      ui: {
        note(title, body) {
          note = { title, body };
        },
      },
    });

    assert.equal(result.analysis.assessed, 1);
    assert.equal(note.title, 'Assessment status');
    assert.match(note.body, /1\/106 valid/);
    for (const key of Object.keys(artifacts)) {
      assert.equal(readFileSync(paths[key], 'utf8'), before[key], `${key} was modified`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('status action reports a malformed target instead of crashing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'csf-status-invalid-target-'));
  const paths = resolvePaths(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(paths.target, '{"default":"bogus"}\n');
  let note = null;

  try {
    const result = await statusAction({
      config: { csfCorePath: resolve('data/csf-core.json') },
      paths,
      logger: { info() {}, warn() {} },
      ui: { note(title, body) { note = { title, body }; } },
    });
    assert.equal(result.target.status, 'invalid');
    assert.match(note.body, /Target\s+invalid/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('status is a documented CLI command', () => {
  assert.equal(parseCliArgs(['status']).command, 'status');
  assert.match(HELP_TEXT, /^\s+status\s+Show pipeline progress/m);
});
