/**
 * Read-only assessment-status projection.
 *
 * The pipeline deliberately persists each stage separately. This module turns
 * those existing artifacts into one compact operational view without creating
 * another source of truth. In particular, review validity is delegated to
 * reviewStatus(), the same helper used by review/report, so "reviewed" and
 * "stale" mean exactly the same thing everywhere.
 */

import { reviewStatus } from '../review/state.js';
import { reportSnapshotMismatches } from './reportSnapshot.js';

export function buildAssessmentStatus({
  subcategoryIds = [],
  meta = {},
  assessments = {},
  reviews = {},
  target = null,
  targetError = null,
  profile = null,
  reportArtifacts = null,
  indexExists = null,
  workDir = null,
} = {}) {
  const ids = resolveIds(subcategoryIds, assessments, profile);
  const total = ids.length;
  const analysis = buildAnalysisStage({ ids, meta, assessments });
  const analyzedAt = analysis.at;

  const reviewStates = ids.map((id) => {
    const assessment = assessments?.[id] ?? null;
    const decision = reviews?.[id] ?? null;
    // A review cannot be valid when its assessment is absent. Normal persisted
    // state always has an assessment here; the guard keeps status honest if a
    // user manually removes or replaces assessments.json.
    if (!assessment) return decision ? 'stale' : 'unreviewed';
    return reviewStatus(assessment, decision);
  });
  const reviewed = reviewStates.filter((state) => state === 'reviewed').length;
  const stale = reviewStates.filter((state) => state === 'stale').length;
  const unreviewed = total - reviewed - stale;
  const reviewRecords = ids.map((id) => reviews?.[id]).filter(Boolean);
  const lastReviewedAt = latestTimestamp(reviewRecords.map((decision) => decision?.reviewed_at));
  const unreviewedFlagged = ids.filter(
    (id, index) => reviewStates[index] === 'unreviewed' && assessments?.[id]?.needs_review === true,
  ).length;

  const ingestAt = validTimestamp(meta?.ingested_at);
  const ingestReport = meta?.ingest_report ?? {};
  const ingestRecorded = Boolean(ingestAt || meta?.ingest_report);
  const missingIndex = ingestRecorded && indexExists === false;

  const ingest = {
    status: missingIndex ? 'stale' : ingestRecorded ? 'complete' : 'not-started',
    at: ingestAt,
    parsed: nonNegativeNumber(ingestReport.parsed),
    skipped: nonNegativeNumber(ingestReport.skipped),
    failed: nonNegativeNumber(ingestReport.failed),
    indexPresent: indexExists,
  };
  const review = {
    status:
      total > 0 && reviewed === total
        ? 'complete'
        : reviewRecords.length > 0
          ? 'in-progress'
          : 'not-started',
    reviewed,
    stale,
    unreviewed,
    unreviewedFlagged,
    total,
    lastReviewedAt,
  };
  const targetAt = target ? latestTimestamp([target.updatedAt, target.createdAt]) : null;
  const targetStage = {
    status: targetError ? 'invalid' : target ? 'configured' : 'not-configured',
    at: targetAt,
    baseline: target?.default ?? null,
    error: targetError,
  };

  const reportAt = profile?.generatedAt ?? null;
  const reportTime = timestampValue(reportAt);
  const inputActivity = [
    { stage: 'ingest', at: ingestAt },
    { stage: 'analyze', at: analyzedAt },
    { stage: 'review', at: lastReviewedAt },
    { stage: 'target', at: targetAt },
  ];
  const newerInputs =
    reportTime == null
      ? []
      : inputActivity.filter(({ at }) => {
          const time = timestampValue(at);
          return time != null && time > reportTime;
        });
  const reportMismatches = [];
  reportMismatches.push(
    ...reportSnapshotMismatches(meta?.report_snapshot, {
      assessments,
      reviews,
      target,
      generatedAt: reportAt,
      engineSig: meta?.engine_sig,
      indexId: meta?.index_id,
    }),
  );
  reportMismatches.push(...reportArtifactMismatches(reportArtifacts, targetStage.status === 'configured'));
  if (analysis.status === 'stale') reportMismatches.push('analysis state');
  if (profile && reviewSnapshotDiffers(profile, ids, reviewStates, { reviewed, stale, unreviewed, total })) {
    reportMismatches.push('review state');
  }
  const uniqueReportMismatches = [...new Set(reportMismatches)];

  let report;
  if (!profile) {
    report = { status: 'missing', at: null, newerInputs: [], mismatches: [] };
  } else if (reportTime == null) {
    report = {
      status: 'stale',
      at: reportAt,
      newerInputs: [],
      mismatches: ['invalid report timestamp', ...uniqueReportMismatches],
    };
  } else {
    report = {
      status: newerInputs.length || uniqueReportMismatches.length ? 'stale' : 'current',
      at: reportAt,
      newerInputs,
      mismatches: uniqueReportMismatches,
    };
  }

  const status = {
    workDir,
    totalSubcategories: total,
    ingest,
    analysis,
    review,
    target: targetStage,
    report,
    lastActivityAt: latestTimestamp([...inputActivity.map(({ at }) => at), validTimestamp(reportAt)]),
  };
  status.next = chooseNext(status);
  return status;
}

/** Shared by CLI status and the generated-profile activity snapshot. */
export function buildAnalysisStage({ ids = [], meta = {}, assessments = {} } = {}) {
  const known = ids.map((id) => assessments?.[id]).filter((assessment) => assessment != null);
  const assessed = known.length;
  const assessmentAt = latestTimestamp(known.map((assessment) => assessment?.assessed_at));
  const analyzedAt = latestTimestamp([meta?.analyzed_at, assessmentAt]);
  const reasons = [];

  const signatures = new Set(
    known
      .map((assessment) => assessment?.engine_sig)
      .filter((signature) => typeof signature === 'string' && signature.length > 0),
  );
  const completedEngine = stringOrNull(meta?.engine_sig);
  if (signatures.size > 1) {
    reasons.push('mixed engine signatures');
  } else if (completedEngine && signatures.size === 1 && !signatures.has(completedEngine)) {
    reasons.push('assessment signature differs from completed run');
  }

  const indexId = stringOrNull(meta?.index_id);
  const analyzedIndexId = stringOrNull(meta?.analyzed_index_id);
  if (indexId && analyzedIndexId) {
    if (indexId !== analyzedIndexId) reasons.push('evidence index changed since analysis');
  } else {
    // Backward-compatible fallback for workdirs created before index ids were
    // persisted separately. Equal/replayed fixed timestamps do not go stale.
    const ingestTime = timestampValue(meta?.ingested_at);
    const completedTime = timestampValue(meta?.analyzed_at);
    if (ingestTime != null && completedTime != null && ingestTime > completedTime) {
      reasons.push('ingest is newer than completed analysis');
    }
  }

  let status = 'not-started';
  if (reasons.length > 0) status = 'stale';
  else if (ids.length > 0 && assessed === ids.length) status = 'complete';
  else if (assessed > 0 || analyzedAt) status = 'in-progress';

  return {
    status,
    assessed,
    total: ids.length,
    at: analyzedAt,
    provider: meta?.llm_id ?? null,
    reasons,
  };
}

export function renderAssessmentStatus(status) {
  const lines = [];
  if (status.workDir) lines.push(`Work directory: ${status.workDir}`, '');

  const ingestCounts =
    status.ingest.status !== 'not-started'
      ? ` · ${status.ingest.parsed} parsed · ${status.ingest.skipped} skipped · ${status.ingest.failed} failed`
      : '';
  const ingestReason = status.ingest.indexPresent === false ? ' · missing index.json' : '';
  const ingestIconStatus = status.ingest.failed > 0 ? 'warning' : status.ingest.status;
  lines.push(
    `${stageIcon(ingestIconStatus)} Ingest   ${stageLabel(status.ingest.status)}${ingestCounts}${ingestReason}${atSuffix(status.ingest.at)}`,
  );

  const analysisProvider = status.analysis.provider ? ` · ${status.analysis.provider}` : '';
  const analysisReasons = status.analysis.reasons?.length ? ` · ${status.analysis.reasons.join(', ')}` : '';
  lines.push(
    `${stageIcon(status.analysis.status)} Analyze  ${status.analysis.assessed}/${status.analysis.total} assessed` +
      `${analysisProvider}${analysisReasons}${atSuffix(status.analysis.at)}`,
  );

  lines.push(
    `${stageIcon(status.review.status)} Review   ${status.review.reviewed}/${status.review.total} valid` +
      ` · ${status.review.stale} stale · ${status.review.unreviewed} unreviewed` +
      `${status.review.lastReviewedAt ? ` · last ${formatTimestamp(status.review.lastReviewedAt)}` : ''}`,
  );

  if (status.target.status === 'invalid') {
    lines.push(`${stageIcon('invalid')} Target   invalid · ${status.target.error}`);
  } else if (status.target.status === 'configured') {
    lines.push(
      `${stageIcon('complete')} Target   configured` +
        `${status.target.baseline ? ` · baseline ${status.target.baseline}` : ''}${atSuffix(status.target.at)}`,
    );
  } else {
    lines.push(`${stageIcon('not-started')} Target   not configured (optional)`);
  }

  if (status.report.status === 'missing') {
    lines.push(`${stageIcon('missing')} Report   not generated`);
  } else if (status.report.status === 'stale') {
    const sources = status.report.newerInputs.map(({ stage }) => stage).join(', ');
    const mismatches = status.report.mismatches?.join(', ');
    lines.push(
      `${stageIcon('stale')} Report   stale${status.report.at ? ` · generated ${formatTimestamp(status.report.at)}` : ''}` +
        `${sources ? ` · newer: ${sources}` : ''}${mismatches ? ` · mismatch: ${mismatches}` : ''}`,
    );
  } else {
    lines.push(`${stageIcon('complete')} Report   current${atSuffix(status.report.at)}`);
  }

  lines.push('');
  if (status.next?.command) {
    lines.push(`${status.next.optional ? 'Optional next' : 'Next'}: ${status.next.command} — ${status.next.reason}`);
  } else {
    lines.push('Next: no action needed — the assessment is up to date.');
  }
  return lines.join('\n');
}

function chooseNext(status) {
  if (status.ingest.status !== 'complete') {
    return { command: 'csf-tool ingest', reason: 'ingest the source documents', optional: false };
  }
  if (status.analysis.status !== 'complete') {
    return {
      command: 'csf-tool analyze',
      reason:
        status.analysis.status === 'stale'
          ? 'refresh assessments against the current evidence index and engine'
          : status.analysis.assessed > 0
            ? 'resume the incomplete analysis'
            : 'assess all CSF outcomes',
      optional: false,
    };
  }
  if (status.review.status !== 'complete') {
    const onlyStale = status.review.stale > 0 && status.review.unreviewed === 0;
    const everyUnreviewedIsQueued =
      status.review.unreviewed > 0 && status.review.unreviewed === status.review.unreviewedFlagged;
    const command = onlyStale || everyUnreviewedIsQueued ? 'csf-tool review' : 'csf-tool review --all';
    const reason =
      status.review.stale > 0
        ? `${status.review.stale} stale and ${status.review.unreviewed} unreviewed outcome(s) need validation`
        : `${status.review.unreviewed} outcome(s) still need human validation`;
    return { command, reason, optional: false };
  }
  if (status.target.status === 'invalid') {
    return {
      command: 'csf-tool target --target-import <valid-target.json>',
      reason: 'replace the invalid target profile before generating reports',
      optional: false,
    };
  }
  if (status.report.status !== 'current') {
    return {
      command: 'csf-tool report',
      reason: status.report.status === 'stale' ? 'regenerate the stale deliverables' : 'generate the deliverables',
      optional: false,
    };
  }
  if (status.target.status !== 'configured') {
    return {
      command: 'csf-tool target',
      reason: 'define optional goals and unlock a prioritized remediation plan',
      optional: true,
    };
  }
  return null;
}

function resolveIds(subcategoryIds, assessments, profile) {
  const ids =
    subcategoryIds.length > 0
      ? subcategoryIds
      : [
          ...(profile?.subcategories ?? []).map((entry) => entry?.subcategory_id),
          ...Object.keys(assessments ?? {}),
        ];
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
}

function reviewSnapshotDiffers(profile, ids, reviewStates, counts) {
  const summary = profile?.summary ?? {};
  for (const field of ['reviewed', 'stale', 'unreviewed']) {
    if (typeof summary[field] === 'number' && summary[field] !== counts[field]) return true;
  }
  if (typeof summary.totalSubcategories === 'number' && summary.totalSubcategories !== counts.total) return true;

  if (!Array.isArray(profile?.subcategories)) return false;
  const profileById = new Map(
    profile.subcategories.map((entry) => [entry?.subcategory_id, entry?.review_status]),
  );
  return ids.some((id, index) => profileById.get(id) !== reviewStates[index]);
}

function reportArtifactMismatches(artifacts, targetConfigured) {
  if (!artifacts || typeof artifacts !== 'object') return [];
  const mismatches = [];
  const current = [
    ['gapReport', 'gap-analysis.md'],
    ['evidenceMap', 'evidence-map.csv'],
    ['dashboard', 'dashboard.html'],
  ];
  for (const [key, label] of current) {
    if (artifacts[key] === false) mismatches.push(`missing ${label}`);
  }

  const targetFiles = [
    ['targetProfile', 'target-profile.json'],
    ['remediationPlan', 'remediation-plan.md'],
  ];
  for (const [key, label] of targetFiles) {
    if (targetConfigured && artifacts[key] === false) mismatches.push(`missing ${label}`);
    if (!targetConfigured && artifacts[key] === true) mismatches.push(`obsolete ${label}`);
  }
  return mismatches;
}

function latestTimestamp(values) {
  let latest = null;
  let latestTime = null;
  for (const value of values) {
    const time = timestampValue(value);
    if (time != null && (latestTime == null || time > latestTime)) {
      latest = value;
      latestTime = time;
    }
  }
  return latest;
}

function validTimestamp(value) {
  return timestampValue(value) == null ? null : value;
}

function timestampValue(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function stringOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stageIcon(status) {
  if (status === 'complete' || status === 'current') return '✓';
  if (status === 'in-progress') return '◔';
  if (status === 'stale' || status === 'warning' || status === 'invalid') return '!';
  return '—';
}

function stageLabel(status) {
  if (status === 'not-started') return 'not started';
  if (status === 'in-progress') return 'in progress';
  return status;
}

function atSuffix(value) {
  return value ? ` · ${formatTimestamp(value)}` : '';
}

function formatTimestamp(value) {
  const time = timestampValue(value);
  return time == null ? String(value ?? 'unknown') : new Date(time).toISOString();
}
