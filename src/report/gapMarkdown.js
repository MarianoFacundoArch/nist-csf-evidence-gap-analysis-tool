/**
 * Renders the human-readable gap-analysis report (Markdown).
 *
 * Layout deliberately puts GAPS FIRST (the actionable part): a reader sees what
 * is missing before what is done. Items are grouped by Function (in canonical
 * order), with a coverage summary table up top. Unreviewed/stale items and
 * human overrides are marked inline so AI output is never mistaken for
 * validated output.
 */

import { isGap } from '../engine/coverage.js';

const FUNCTION_ORDER = ['GOVERN', 'IDENTIFY', 'PROTECT', 'DETECT', 'RESPOND', 'RECOVER'];

function orderFunctions(entries) {
  const names = [...new Set(entries.map((e) => e.function))];
  names.sort((a, b) => {
    const ia = FUNCTION_ORDER.indexOf(a);
    const ib = FUNCTION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return names;
}

function statusBadge(e) {
  const parts = [];
  if (e.review_status === 'unreviewed') parts.push('⚠ UNREVIEWED');
  else if (e.review_status === 'stale') parts.push('⚠ STALE REVIEW');
  if (e.human_coverage != null) parts.push(`reviewer override: ${e.ai_coverage} → ${e.human_coverage}`);
  if (e.verification?.downgraded) parts.push('verifier downgraded (unverifiable quote removed)');
  return parts.length ? ` _(${parts.join('; ')})_` : '';
}

function evidenceLines(e, maxChars) {
  if (!e.evidence?.length) return [];
  return e.evidence.map((ev) => {
    const where = `${ev.source_file}${ev.page ? `, p.${ev.page}` : ''}`;
    let q = ev.quote;
    if (q.length > maxChars) q = q.slice(0, maxChars).trimEnd() + '…';
    return `  - Evidence (${where}): "${q}"`;
  });
}

export function renderGapMarkdown(profile, { evidenceQuoteMaxChars = 300 } = {}) {
  const s = profile.summary;
  const entries = profile.subcategories;
  const out = [];

  out.push('# NIST CSF 2.0 — Current Profile & Gap Analysis');
  out.push('');
  out.push(`> ${profile.disclaimer}`);
  out.push('');
  if (s.unreviewed > 0 || s.stale > 0) {
    out.push(`> **DRAFT — not fully reviewed.** ${s.unreviewed} unreviewed and ${s.stale} stale item(s) remain. ` +
      'A human must validate every item before this profile is authoritative.');
    out.push('');
  }

  out.push('## Overview');
  out.push('');
  out.push(`- Framework: ${profile.framework} (${profile.frameworkVersion})`);
  out.push(`- Generated: ${profile.generatedAt}`);
  out.push(`- Providers: embeddings = \`${profile.providers.embeddings}\`, reasoning = \`${profile.providers.llm}\``);
  out.push(`- CSF source: ${profile.csfSource}`);
  out.push(`- Subcategories: ${s.totalSubcategories} — gaps (none/partial): **${s.gaps}**`);
  out.push(`- Coverage: none ${s.byCoverage.none}, partial ${s.byCoverage.partial}, substantial ${s.byCoverage.substantial}, full ${s.byCoverage.full}`);
  out.push(`- Review: reviewed ${s.reviewed}, unreviewed ${s.unreviewed}, stale ${s.stale}, overrides ${s.overridden}`);
  out.push(`- Quotes downgraded by the verifier: ${s.downgradedByVerifier}`);
  out.push('');

  // Per-function summary table.
  out.push('## Coverage by Function');
  out.push('');
  out.push('| Function | Total | None | Partial | Substantial | Full | % addressed |');
  out.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const fn of orderFunctions(entries)) {
    const es = entries.filter((e) => e.function === fn);
    const c = { none: 0, partial: 0, substantial: 0, full: 0 };
    for (const e of es) c[e.coverage]++;
    const addressed = es.length ? Math.round(((c.substantial + c.full) / es.length) * 100) : 0;
    out.push(`| ${fn} | ${es.length} | ${c.none} | ${c.partial} | ${c.substantial} | ${c.full} | ${addressed}% |`);
  }
  out.push('');

  // Gaps first.
  out.push('## Gaps and partial coverage (address these first)');
  out.push('');
  let anyGap = false;
  for (const fn of orderFunctions(entries)) {
    const gaps = entries
      .filter((e) => e.function === fn && isGap(e.coverage))
      .sort((a, b) => rank(a.coverage) - rank(b.coverage) || a.subcategory_id.localeCompare(b.subcategory_id));
    if (gaps.length === 0) continue;
    anyGap = true;
    out.push(`### ${fn}`);
    out.push('');
    for (const e of gaps) {
      out.push(`- **${e.subcategory_id}** — _${e.coverage}_${statusBadge(e)}`);
      out.push(`  - Outcome: ${e.outcome}`);
      out.push(`  - Rationale: ${e.rationale}`);
      out.push(...evidenceLines(e, evidenceQuoteMaxChars));
      if (e.reviewer_notes) out.push(`  - Reviewer note: ${e.reviewer_notes}`);
    }
    out.push('');
  }
  if (!anyGap) {
    out.push('_No gaps — every subcategory is at least substantially covered._');
    out.push('');
  }

  // Covered.
  out.push('## Substantially or fully covered');
  out.push('');
  let anyCovered = false;
  for (const fn of orderFunctions(entries)) {
    const covered = entries
      .filter((e) => e.function === fn && !isGap(e.coverage))
      .sort((a, b) => a.subcategory_id.localeCompare(b.subcategory_id));
    if (covered.length === 0) continue;
    anyCovered = true;
    out.push(`### ${fn}`);
    out.push('');
    for (const e of covered) {
      out.push(`- **${e.subcategory_id}** — _${e.coverage}_${statusBadge(e)}: ${e.outcome}`);
      const first = e.evidence?.[0];
      if (first) {
        const where = `${first.source_file}${first.page ? `, p.${first.page}` : ''}`;
        out.push(`  - Evidence (${where})`);
      }
    }
    out.push('');
  }
  if (!anyCovered) {
    out.push('_No subcategories are substantially or fully covered yet._');
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(
    'Every coverage level above "none" is supported by at least one quote that was checked verbatim ' +
      'against the retrieved source text; unverifiable quotes are removed and the item is downgraded. ' +
      'Items marked UNREVIEWED or STALE still require human validation.',
  );
  out.push('');
  return out.join('\n');
}

function rank(c) {
  return c === 'none' ? 0 : 1; // none before partial within the gaps section
}
