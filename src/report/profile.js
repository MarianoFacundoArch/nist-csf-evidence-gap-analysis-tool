/**
 * Builds the canonical Current Profile object by merging the AI assessments
 * with the human review decisions over the CSF core. ALL three deliverables
 * (profile JSON, gap Markdown, evidence CSV) are derived from this single
 * object, so they can never drift from one another.
 *
 * The profile is aligned with the CSF 2.0 "Organizational Profile" concept:
 * one entry per subcategory with an achievement-tier coverage, confidence,
 * supporting evidence, and review status. It retains both the AI value and the
 * human value so the deliverable is auditable, and it marks unreviewed/stale
 * items unmistakably (the AI never has the final word).
 */

import { readFileSync } from 'node:fs';
import { reviewStatus, effectiveCoverage } from '../review/state.js';
import { summarizeCoverage, isGap } from '../engine/coverage.js';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const DISCLAIMER =
  'AI-assisted draft. Guiding principle: AI proposes, a human validates. Coverage judgments above "none" ' +
  'are anchored to quotes verified verbatim against the source evidence. CSF 2.0 Subcategory text is in the ' +
  'public domain (source: NIST CPRT).';

export function buildProfile(ctx, { csf, assessments, reviews, meta }) {
  const entries = csf.subcategories.map((sub) => {
    const a = assessments[sub.id] ?? syntheticNone(sub);
    const r = reviews[sub.id] ?? null;
    const status = reviewStatus(a, r);
    const coverage = effectiveCoverage(a, r);
    const overridden = status === 'reviewed' && r?.decision === 'override';

    return {
      subcategory_id: sub.id,
      function: sub.functionName,
      function_id: sub.functionId,
      category: sub.category,
      outcome: sub.outcome,
      coverage, // effective (human override if resolved, else AI)
      confidence: a.confidence,
      review_status: status, // reviewed | unreviewed | stale
      ai_coverage: a.coverage,
      human_coverage: overridden ? r.final_coverage : null,
      reviewer_notes: r?.note ?? null,
      reviewer: r?.reviewed_by ?? null,
      rationale: a.rationale,
      verifier_action: a.verifier_action ?? null,
      evidence: (a.evidence ?? []).map((e) => ({
        source_file: e.source_file,
        page: e.page ?? null,
        score: e.score ?? null,
        quote: e.quote,
        verified: e.verified ?? true,
      })),
      verification: a.verification ?? { quotes_checked: 0, quotes_verified: 0, downgraded: false },
    };
  });

  const byCoverage = summarizeCoverage(entries.map((e) => e.coverage));
  const statuses = entries.map((e) => e.review_status);

  return {
    schemaVersion: '1.0',
    profileType: 'Current',
    framework: 'NIST CSF 2.0',
    frameworkVersion: csf.frameworkVersion,
    generatedAt: ctx.now(),
    tool: { name: pkg.name, version: pkg.version },
    disclaimer: DISCLAIMER,
    csfSource: csf.sample
      ? 'PARTIAL CSF subset in use — replace with the full NIST CPRT export.'
      : 'NIST CPRT — CSF 2.0 Core (public domain).',
    providers: {
      embeddings: meta?.embedder_id ?? ctx.config.embeddings.provider,
      llm: meta?.llm_id ?? ctx.config.llm.provider,
    },
    strict: !!ctx.config.analysis.strict,
    summary: {
      totalSubcategories: entries.length,
      byCoverage,
      gaps: entries.filter((e) => isGap(e.coverage)).length,
      reviewed: statuses.filter((s) => s === 'reviewed').length,
      unreviewed: statuses.filter((s) => s === 'unreviewed').length,
      stale: statuses.filter((s) => s === 'stale').length,
      overridden: entries.filter((e) => e.human_coverage != null).length,
      downgradedByVerifier: entries.filter((e) => e.verification?.downgraded).length,
    },
    subcategories: entries,
  };
}

function syntheticNone(sub) {
  return {
    subcategory_id: sub.id,
    coverage: 'none',
    confidence: 0,
    evidence: [],
    rationale: 'No assessment was produced for this subcategory.',
    needs_review: true,
    verifier_action: null,
    verification: { quotes_checked: 0, quotes_verified: 0, downgraded: false },
  };
}
