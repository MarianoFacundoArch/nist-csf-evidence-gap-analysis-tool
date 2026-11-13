/**
 * Renders the human-readable crosswalk report (Markdown): for each selected
 * mapping, its provenance and the reference identifiers it relates to the
 * assessed CSF 2.0 outcomes.
 *
 * The wording is the hard part of this deliverable. A table that puts a
 * control identifier next to a coverage level invites the reading "this
 * control is covered" — which the data does not support: a mapping records a
 * relationship, not equivalence, and coverage is evidence about the CSF
 * outcome only. So the report opens with how to read it, names who developed
 * each mapping (labeling third-party ones), repeats the caveat beside every
 * summary, and reports counts only — never a percentage, which would read as
 * a conformance score, and never a count of references whose related outcomes
 * are all covered, which would read as "these controls are fine".
 *
 * A mapping records each relationship at one of three levels, and the report
 * keeps them apart: one table for references related to individual
 * Subcategories, a second for references related to a whole Category or
 * Function. The second shows how the outcomes under that element are
 * distributed across coverage levels — one row per relationship, never one row
 * per Subcategory, because the mapping does not single any outcome out.
 *
 * Provenance sentences are built from the data file's own `source` and
 * `catalogUrl` rather than hardcoded, so the report says what the file says.
 *
 * Unreviewed/stale outcomes are marked inline and the report carries the same
 * DRAFT banner rule as the gap analysis, so AI output is never mistaken for
 * validated output here either.
 */

import { COVERAGE_LEVELS } from '../engine/coverage.js';

const THIRD_PARTY_LINE =
  '**Third-party mapping — not produced by the framework\'s publisher.** It is reproduced as published, ' +
  'including any entries that are non-specific or appear to be errors.';

/**
 * Escape text from the data file for inline Markdown. Labels and identifiers
 * are data, not markup: a "|" must not split a table row and "<" must not
 * start an HTML tag in whatever viewer renders the report.
 */
function esc(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\`*_[\]<>|]/g, '\\$&');
}

function howToRead(view) {
  return [
    '**Related, not equivalent.** A mapping records that a CSF 2.0 outcome and a reference in another ' +
      'framework are related. It does not say that achieving one satisfies the other.',
    '**Coverage is about the CSF outcome only.** The coverage shown beside an outcome is what this assessment ' +
      'found for that outcome. It is not a determination of conformance with the referenced control or ' +
      'requirement, and this report does not measure conformance with any other framework.',
    '**Three levels of relationship.** A mapping relates a reference to one CSF outcome (a Subcategory), to a ' +
      'whole Category, or to a whole Function. Each crosswalk below lists the first kind in one table and the ' +
      'other two in a second table. For a whole Category or Function the report shows how the outcomes under ' +
      'it are distributed across coverage levels; it does not pick one, because the mapping does not.',
    '**Identifiers only.** No control or requirement text from the referenced frameworks is reproduced here. ' +
      'Consult each framework\'s own publication for what an identifier means.',
    `**Who made each mapping.** The mappings come from: ${esc(view.source)}. Each was developed by the party ` +
      'named as its developer there — not by this project, which adds no mappings of its own. Inclusion here ' +
      'is not an endorsement by NIST or by this project.',
  ];
}

function relatedCell(reference, hasGroupTable) {
  const outcomes = reference.related
    .map((r) => {
      const marks = [r.coverage];
      if (r.review_status === 'unreviewed') marks.push('⚠ UNREVIEWED');
      else if (r.review_status === 'stale') marks.push('⚠ STALE REVIEW');
      return `${esc(r.subcategory_id)} (${marks.join(', ')})`;
    })
    .join(', ');
  return reference.groups.length > 0 && hasGroupTable
    ? `${outcomes} — also related to a whole Category or Function (next table)`
    : outcomes;
}

/** "5 outcomes: none 2, partial 3 (⚠ 1 unreviewed)" — counts, never a single level. */
function distributionCell(group) {
  const levels = COVERAGE_LEVELS.filter((level) => group.coverage[level] > 0).map((level) => `${level} ${group.coverage[level]}`);
  const pending = [];
  if (group.review.unreviewed > 0) pending.push(`${group.review.unreviewed} unreviewed`);
  if (group.review.stale > 0) pending.push(`${group.review.stale} stale`);
  return (
    `${group.outcomes} outcome${group.outcomes === 1 ? '' : 's'}: ${levels.join(', ')}` +
    (pending.length ? ` (⚠ ${pending.join(', ')})` : '')
  );
}

/**
 * @param {object} profile the Current Profile (framework, timestamps, review counts)
 * @param {ReturnType<typeof import('../crosswalk/view.js').buildCrosswalkView>} view
 * @returns {string} Markdown
 */
export function renderCrosswalkMarkdown(profile, view) {
  const s = profile.summary;
  const out = [];

  out.push('# NIST CSF 2.0 — Crosswalks to Other Frameworks (Informative References)');
  out.push('');
  out.push('> **How to read this report**');
  out.push('>');
  for (const line of howToRead(view)) out.push(`> - ${line}`);
  out.push('');
  if (s.unreviewed > 0 || s.stale > 0) {
    // The counts are assessment-wide (a narrow selection may show none of the
    // affected outcomes), so the banner says "in the assessment", not "below".
    out.push(
      `> **DRAFT — not fully reviewed.** ${s.unreviewed} unreviewed and ${s.stale} stale item(s) remain in the ` +
        'assessment; any of them that appear below are marked. A human must validate every item before these ' +
        'coverage values are relied on.',
    );
    out.push('');
  }

  out.push('## Overview');
  out.push('');
  out.push(`- Framework: ${profile.framework} (${profile.frameworkVersion})`);
  out.push(`- Generated: ${profile.generatedAt}`);
  out.push(`- CSF source: ${profile.csfSource}`);
  out.push(`- Mapping source: ${esc(view.source)} — retrieved ${esc(view.retrievedAt)}`);
  // Angle brackets make a URL an autolink: nothing inside is parsed as Markdown.
  out.push(`- Catalog where each mapping and its developer are listed: <${view.catalogUrl}>`);
  out.push(
    `- Coverage: from the Current Profile (current-profile.json) — reviewed ${s.reviewed}, ` +
      `unreviewed ${s.unreviewed}, stale ${s.stale}`,
  );
  out.push(`- Crosswalks included: ${view.crosswalks.length}`);
  out.push('');
  out.push('| Crosswalk | Framework | Mapping developer | Released | References | Subcategories mapped |');
  out.push('| --- | --- | --- | --- | ---: | ---: |');
  for (const c of view.crosswalks) {
    out.push(
      `| \`${esc(c.id)}\` | ${esc(c.framework)}${c.thirdParty ? ' — third-party mapping' : ''} | ${esc(c.developer)} | ` +
        `${esc(c.releaseDate)} | ${c.summary.references} | ${c.summary.subcategoriesMapped} of ${c.summary.totalSubcategories} |`,
    );
  }
  out.push('');

  for (const c of view.crosswalks) {
    const m = c.summary;
    out.push(`## ${esc(c.framework)}${c.thirdParty ? ' (third-party mapping)' : ''}`);
    out.push('');
    out.push(`- Crosswalk id: \`${esc(c.id)}\``);
    out.push(`- Mapping: ${esc(c.olirName)}, version ${esc(c.olirVersion)}, released ${esc(c.releaseDate)}`);
    out.push(`- Mapping developer (as listed in the mapping source): ${esc(c.developer)}`);
    out.push(`- Catalog where this mapping and its developer are listed: <${view.catalogUrl}>`);
    // Present only when NIST hosts the mapping's own document (the loader
    // accepts no other link).
    if (c.sourceUrl) out.push(`- Mapping document (hosted by NIST): <${c.sourceUrl}>`);
    if (c.thirdParty) out.push(`- ${THIRD_PARTY_LINE}`);
    out.push(
      `- Relationships recorded for: ${m.subcategoriesMapped} of ${m.totalSubcategories} Subcategories, ` +
        `${m.categoriesMapped} of ${m.totalCategories} Categories, ${m.functionsMapped} of ${m.totalFunctions} Functions`,
    );
    if (m.subcategoriesNotAssessed + m.groupsNotAssessed > 0) {
      out.push(
        `- Not shown: this mapping also covers ${m.subcategoriesNotAssessed} Subcategory(ies) and ` +
          `${m.groupsNotAssessed} Category(ies) or Function(s) that are not part of this assessment.`,
      );
    }
    out.push('');

    if (c.references.length === 0) {
      out.push('_This mapping has no reference related to an outcome in this assessment._');
      out.push('');
      continue;
    }

    out.push(
      'The counts below describe the CSF outcomes related to each reference; a reference related to a whole ' +
        'Category or Function is related to every outcome under it. They describe those outcomes: they do not ' +
        `say whether a reference is satisfied, and they are not a measure of conformance with ${esc(c.framework)}.`,
    );
    out.push('');
    out.push(`- References listed: ${m.references}`);
    out.push(`- References with at least one related outcome at none or partial: ${m.referencesWithGap}`);
    if (m.referencesPendingReview > 0) {
      out.push(`- References with at least one related outcome still unreviewed or stale: ${m.referencesPendingReview}`);
    }
    out.push('');

    const withOutcomes = c.references.filter((r) => r.related.length > 0);
    const withGroups = c.references.filter((r) => r.groups.length > 0);

    if (withOutcomes.length > 0) {
      out.push('**References related to individual outcomes (Subcategories)**');
      out.push('');
      out.push('| Reference | Related CSF 2.0 outcomes (coverage) |');
      out.push('| --- | --- |');
      for (const reference of withOutcomes) {
        out.push(`| ${esc(reference.reference_id)} | ${relatedCell(reference, withGroups.length > 0)} |`);
      }
      out.push('');
    }

    if (withGroups.length > 0) {
      out.push('**References related to a whole Category or Function**');
      out.push('');
      out.push(
        'The mapping relates each of these references to the Category or Function as a whole, not to one ' +
          'outcome in it. The last column counts the outcomes under it by coverage.',
      );
      out.push('');
      out.push('| Reference | Related Category or Function | Outcomes under it, by coverage |');
      out.push('| --- | --- | --- |');
      for (const reference of withGroups) {
        for (const group of reference.groups) {
          out.push(
            `| ${esc(reference.reference_id)} | ${group.level === 'category' ? 'Category' : 'Function'}: ${esc(group.name)} | ` +
              `${distributionCell(group)} |`,
          );
        }
      }
      out.push('');
    }
  }

  out.push('---');
  out.push('');
  out.push(
    'Coverage values come from the assessment; gap-analysis.md and current-profile.json hold the evidence, the ' +
      'rationale and the review record behind each one. Items marked UNREVIEWED or STALE still require human ' +
      'validation. Reference identifiers come from the mappings as retrieved on the date above; this tool adds ' +
      'no mappings of its own.',
  );
  out.push('');
  return out.join('\n');
}
