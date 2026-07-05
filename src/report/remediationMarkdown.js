/**
 * Renders the human-readable remediation plan (Markdown) — the action plan that
 * connects the Current Profile to the Target Profile, which is the artifact the
 * CSF 2.0 profile workflow exists to produce.
 *
 * Ordering is the point of this deliverable: unmet targets appear as ONE
 * numbered list ranked by human-set priority, then by distance from the goal
 * (see planOrder). Each item's "suggested actions" are the official NIST CSF
 * 2.0 Implementation Examples for that outcome, quoted verbatim from the CPRT
 * export — the same grounding rule as evidence quotes: the tool never invents
 * recommendations.
 */

import { planOrder } from '../target/targetProfile.js';
import { orderFunctions } from '../csf/order.js';
import { PRIORITY_LEVELS } from '../target/target.schema.js';

const NOTE =
  'Targets, priorities, and out-of-scope decisions are human choices recorded in the target profile — no AI ' +
  'makes them. Suggested actions are the official NIST CSF 2.0 Implementation Examples (public domain, source: ' +
  'NIST CPRT): illustrative starting points, not an exhaustive or mandatory list.';

export function renderRemediationMarkdown(profile, view) {
  const s = view.summary;
  const out = [];

  out.push('# NIST CSF 2.0 — Remediation Plan (Current → Target)');
  out.push('');
  out.push(`> ${NOTE}`);
  out.push('');
  if (profile.summary.unreviewed > 0 || profile.summary.stale > 0) {
    out.push(
      `> **DRAFT — not fully reviewed.** The current-coverage side of this plan contains ` +
        `${profile.summary.unreviewed} unreviewed and ${profile.summary.stale} stale item(s). ` +
        'A human must validate every item before this plan is authoritative.',
    );
    out.push('');
  }

  out.push('## Overview');
  out.push('');
  out.push(`- Framework: ${profile.framework} (${profile.frameworkVersion})`);
  out.push(`- Generated: ${profile.generatedAt}`);
  out.push(`- Target baseline: **${view.baseline}** for every outcome, plus any overrides recorded in the target profile`);
  if (view.description) out.push(`- Target description: ${view.description}`);
  out.push(
    `- Applicable outcomes: ${s.applicable} of ${s.total}` +
      (s.notApplicable ? ` (${s.notApplicable} scoped out as not-applicable)` : ''),
  );
  out.push(`- Target met: **${s.met}/${s.applicable} (${s.pctMet}%)** — unmet: **${s.unmet}**` +
    ` (high ${s.unmetByPriority.high}, medium ${s.unmetByPriority.medium}, low ${s.unmetByPriority.low})`);
  out.push('');

  out.push('## Current vs target by Function');
  out.push('');
  out.push('| Function | Applicable | Met | Unmet | Out of scope | % met |');
  out.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const f of s.byFunction) {
    out.push(`| ${f.function} | ${f.applicable} | ${f.met} | ${f.unmet} | ${f.notApplicable} | ${f.pctMet}% |`);
  }
  out.push('');

  const unmet = planOrder(view.entries.filter((e) => !e.not_applicable && !e.met));

  out.push('## Prioritized action plan');
  out.push('');
  if (unmet.length === 0) {
    out.push('_No unmet targets — the current posture meets or exceeds the target everywhere it applies._');
    out.push('');
  } else {
    out.push(
      'Ranked by remediation priority, then by distance from the target. Work the list top-down; ' +
        'each item lists what the outcome requires, where the assessment stands, and NIST\'s example actions.',
    );
    out.push('');
    let n = 0;
    for (const prio of PRIORITY_LEVELS) {
      const items = unmet.filter((e) => e.priority === prio);
      if (items.length === 0) continue;
      out.push(`### ${prio.charAt(0).toUpperCase()}${prio.slice(1)} priority (${items.length})`);
      out.push('');
      for (const e of items) {
        n++;
        out.push(`#### ${n}. ${e.subcategory_id} — ${e.current_coverage} → ${e.target_coverage}${levelsToClose(e.gap)}${statusBadge(e)}`);
        out.push('');
        out.push(`- Function / Category: ${e.function} / ${e.category}`);
        out.push(`- Outcome: ${e.outcome}`);
        out.push(`- Assessment rationale: ${e.rationale}`);
        if (e.note) out.push(`- Target note: ${e.note}`);
        if (e.implementation_examples.length > 0) {
          out.push('- Suggested actions (NIST CSF 2.0 Implementation Examples):');
          e.implementation_examples.forEach((ex, i) => out.push(`  ${i + 1}. ${ex}`));
        } else {
          out.push('- Suggested actions: (none provided by this CSF core export)');
        }
        out.push('');
      }
    }
  }

  const met = view.entries.filter((e) => e.met);
  out.push(`## At or above target (${met.length})`);
  out.push('');
  if (met.length === 0) {
    out.push('_No outcome meets its target yet._');
    out.push('');
  } else {
    for (const fn of orderFunctions(met)) {
      const es = met
        .filter((e) => e.function === fn)
        .sort((a, b) => a.subcategory_id.localeCompare(b.subcategory_id));
      out.push(`### ${fn}`);
      out.push('');
      for (const e of es) {
        out.push(`- **${e.subcategory_id}** — ${e.current_coverage} (target: ${e.target_coverage})${statusBadge(e)}`);
      }
      out.push('');
    }
  }

  const na = view.entries.filter((e) => e.not_applicable);
  if (na.length > 0) {
    out.push(`## Out of scope — not-applicable (${na.length})`);
    out.push('');
    out.push('Marked not-applicable in the target profile; excluded from the met/unmet figures above.');
    out.push('');
    for (const e of na.sort((a, b) => a.subcategory_id.localeCompare(b.subcategory_id))) {
      out.push(`- **${e.subcategory_id}** — ${e.outcome}${e.note ? ` _(reason: ${e.note})_` : ''}`);
    }
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(
    'The current-coverage side of this plan comes from the reviewed assessment (see gap-analysis.md and ' +
      'current-profile.json); every coverage level above "none" is anchored to quotes verified verbatim ' +
      'against the source documents. Items marked UNREVIEWED or STALE still require human validation.',
  );
  out.push('');
  return out.join('\n');
}

function levelsToClose(gap) {
  return gap > 0 ? ` (${gap} level${gap > 1 ? 's' : ''} to close)` : '';
}

function statusBadge(e) {
  if (e.review_status === 'unreviewed') return ' _(⚠ UNREVIEWED)_';
  if (e.review_status === 'stale') return ' _(⚠ STALE REVIEW)_';
  return '';
}
