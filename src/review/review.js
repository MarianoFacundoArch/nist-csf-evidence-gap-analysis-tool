/**
 * Interactive, human-in-the-loop review loop.
 *
 * This is the step that makes the AI's output a PROPOSAL rather than a verdict.
 * For each item it shows the subcategory, the AI's judgment, and the VERIFIED
 * supporting quotes, then lets the human accept, override the coverage, add a
 * note, skip, or quit. Decisions are persisted immediately (the loop is
 * resumable — quitting loses nothing) and stored separately from AI
 * assessments so re-analysis never clobbers a human decision.
 *
 * By default only items that need a human are queued (flagged for review, or
 * unresolved/stale); `showAll` reviews every subcategory.
 */

import { reviewStatus } from './state.js';
import { hashAssessment } from '../util/hash.js';
import { COVERAGE_LEVELS } from '../engine/coverage.js';

function buildQueue(csf, assessments, reviews, showAll) {
  return csf.subcategories.filter((sub) => {
    const a = assessments[sub.id];
    const r = reviews[sub.id];
    const status = a ? reviewStatus(a, r) : 'unreviewed';
    if (showAll) return true;
    if (status === 'reviewed') return false; // a non-stale human decision exists — done
    if (status === 'stale') return true; // assessment changed since review — re-confirm
    // Unreviewed: by default surface only the items the AI flagged for review.
    return a?.needs_review === true;
  });
}

/**
 * @param {object} ctx run context (ui, config, logger, now)
 * @param {object} params
 * @param {object} params.csf loaded CSF core
 * @param {Record<string,object>} params.assessments
 * @param {Record<string,object>} params.reviews mutated in place
 * @param {() => Promise<void>} params.persist writes reviews to disk
 * @param {boolean} [params.acceptAll] non-interactive: auto-accept the queue
 * @returns {Promise<{reviewed:number, overridden:number, skipped:number, remaining:number}>}
 */
export async function runReview(ctx, { csf, assessments, reviews, persist, acceptAll = false }) {
  const { ui, config, now } = ctx;
  const showAll = config.review.showAll;
  const queue = buildQueue(csf, assessments, reviews, showAll);

  const stats = { reviewed: 0, overridden: 0, skipped: 0, remaining: queue.length };
  if (queue.length === 0) {
    ui.info('Nothing to review — all items are resolved.');
    return stats;
  }

  ui.info(`${queue.length} item(s) to review (${showAll ? 'review-all' : 'flagged/unresolved only'}).`);

  for (const sub of queue) {
    const a = assessments[sub.id] ?? syntheticNone(sub); // never crash on a gap
    const baseDecision = {
      subcategory_id: sub.id,
      decision: 'accept',
      final_coverage: a.coverage,
      note: null,
      reviewed_by: config.identity ?? null,
      reviewed_at: now(),
      reviewed_against: hashAssessment(a),
    };

    // Non-interactive bulk accept (used by CI / the worked-example regeneration).
    if (acceptAll || !ui.isInteractive) {
      reviews[sub.id] = baseDecision;
      stats.reviewed++;
      await persist();
      continue;
    }

    presentItem(ui, sub, a);
    const choice = await ui.select(`Decision for ${sub.id}`, [
      { value: 'accept', label: 'Accept the AI judgment' },
      { value: 'override', label: 'Override the coverage level' },
      { value: 'note', label: 'Accept, but add a note' },
      { value: 'skip', label: 'Skip (decide later)' },
      { value: 'quit', label: 'Save progress and quit' },
    ]);

    if (choice === 'quit') {
      ui.info('Progress saved. Re-run review to continue.');
      break;
    }
    if (choice === 'skip') {
      stats.skipped++;
      continue;
    }

    const decision = { ...baseDecision };
    if (choice === 'override') {
      decision.decision = 'override';
      decision.final_coverage = await ui.select('Final coverage', COVERAGE_LEVELS.map((c) => ({ value: c, label: c })));
      decision.note = (await ui.text('Reason for the override (recorded in the report)')) || null;
      stats.overridden++;
    } else if (choice === 'note') {
      decision.note = (await ui.text('Note (recorded in the report)')) || null;
    }
    if (choice === 'accept' || choice === 'note') stats.reviewed++;

    reviews[sub.id] = decision;
    await persist();
  }

  // "Remaining" = items still not resolved by a (non-stale) human decision,
  // independent of the show-all toggle.
  stats.remaining = csf.subcategories.filter(
    (sub) => reviewStatus(assessments[sub.id] ?? null, reviews[sub.id]) !== 'reviewed',
  ).length;
  return stats;
}

function presentItem(ui, sub, a) {
  const lines = [
    `${sub.id} — ${sub.functionName} / ${sub.category}`,
    `Outcome: ${sub.outcome}`,
    '',
    `AI coverage: ${a.coverage}    confidence: ${a.confidence}    needs_review: ${a.needs_review}`,
  ];
  if (a.verifier_action) lines.push(`Verifier: ${a.verifier_action}`);
  lines.push(`Rationale: ${a.rationale}`);
  if (a.evidence?.length) {
    lines.push('', 'Verified evidence:');
    for (const e of a.evidence) {
      lines.push(`  • [${e.source_file}${e.page ? ` p.${e.page}` : ''}] "${e.quote}"`);
    }
  } else {
    lines.push('', 'Verified evidence: (none)');
  }
  ui.note(`Review ${sub.id}`, lines.join('\n'));
}

function syntheticNone(sub) {
  return {
    subcategory_id: sub.id,
    coverage: 'none',
    confidence: 0,
    evidence: [],
    rationale: 'No assessment was produced for this subcategory.',
    needs_review: true,
  };
}
