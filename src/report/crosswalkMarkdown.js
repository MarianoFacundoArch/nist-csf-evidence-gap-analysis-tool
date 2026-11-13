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
 *
 * In another report language (a locale from src/i18n/locale.js) the same
 * statements are made in that language — the caveats above are the reason this
 * deliverable exists, so every one of them has a translated counterpart — and
 * a related Category or Function is named as the published translation of the
 * Core names it. What comes from the mapping data (framework names, developer
 * names, identifiers) is never translated.
 */

import { COVERAGE_LEVELS } from '../engine/coverage.js';
import { asLocale, frameworkNoteLines } from '../i18n/locale.js';

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

function howToRead(view, t) {
  return [
    t('crosswalk.howToRead.related'),
    t('crosswalk.howToRead.coverage'),
    t('crosswalk.howToRead.levels'),
    t('crosswalk.howToRead.identifiers'),
    t('crosswalk.howToRead.who', { source: esc(view.source) }),
  ];
}

function relatedCell(reference, hasGroupTable, locale) {
  const { t } = locale;
  const outcomes = reference.related
    .map((r) => {
      const marks = [locale.coverage(r.coverage)];
      if (r.review_status === 'unreviewed') marks.push(t('badge.unreviewed'));
      else if (r.review_status === 'stale') marks.push(t('badge.stale'));
      return `${esc(r.subcategory_id)} (${marks.join(', ')})`;
    })
    .join(', ');
  return reference.groups.length > 0 && hasGroupTable ? t('crosswalk.related.alsoGroup', { outcomes }) : outcomes;
}

/** "5 outcomes: none 2, partial 3 (⚠ 1 unreviewed)" — counts, never a single level. */
function distributionCell(group, locale) {
  const { t } = locale;
  const levels = COVERAGE_LEVELS.filter((level) => group.coverage[level] > 0).map(
    (level) => `${locale.coverage(level)} ${group.coverage[level]}`,
  );
  const pending = [];
  if (group.review.unreviewed > 0) pending.push(t('crosswalk.pending.unreviewed', { count: group.review.unreviewed }));
  if (group.review.stale > 0) pending.push(t('crosswalk.pending.stale', { count: group.review.stale }));
  return (
    locale.plural('crosswalk.distribution', group.outcomes, { distribution: levels.join(', ') }) +
    (pending.length ? ` (⚠ ${pending.join(', ')})` : '')
  );
}

/**
 * @param {object} profile the Current Profile (framework, timestamps, review counts)
 * @param {ReturnType<typeof import('../crosswalk/view.js').buildCrosswalkView>} view
 * @param {object} [options]
 * @param {ReturnType<typeof import('../i18n/locale.js').createReportLocale>} [options.locale]
 *   report locale; English when omitted
 * @returns {string} Markdown
 */
export function renderCrosswalkMarkdown(profile, view, options) {
  const locale = asLocale(options?.locale);
  const { t } = locale;
  const s = profile.summary;
  const out = [];

  out.push(`# ${t('crosswalk.title')}`);
  out.push('');
  out.push(`> ${t('crosswalk.howToRead.title')}`);
  out.push('>');
  for (const line of howToRead(view, t)) out.push(`> - ${line}`);
  out.push('');
  if (s.unreviewed > 0 || s.stale > 0) {
    // The counts are assessment-wide (a narrow selection may show none of the
    // affected outcomes), so the banner says "in the assessment", not "below".
    out.push(`> ${t('crosswalk.draft', { unreviewed: s.unreviewed, stale: s.stale })}`);
    out.push('');
  }
  out.push(...frameworkNoteLines(locale, profile.subcategories));

  out.push(`## ${t('common.heading.overview')}`);
  out.push('');
  out.push(`- ${t('common.overview.framework', { framework: profile.framework, version: profile.frameworkVersion })}`);
  out.push(`- ${t('common.overview.generated', { date: profile.generatedAt })}`);
  out.push(`- ${t('common.overview.csfSource', { source: locale.fixed(profile.csfSource) })}`);
  out.push(`- ${t('crosswalk.overview.mappingSource', { source: esc(view.source), date: esc(view.retrievedAt) })}`);
  // Angle brackets make a URL an autolink: nothing inside is parsed as Markdown.
  out.push(`- ${t('crosswalk.overview.catalog', { url: `<${view.catalogUrl}>` })}`);
  out.push(`- ${t('crosswalk.overview.coverage', { reviewed: s.reviewed, unreviewed: s.unreviewed, stale: s.stale })}`);
  out.push(`- ${t('crosswalk.overview.included', { count: view.crosswalks.length })}`);
  out.push('');
  out.push(t('crosswalk.table.overview.header'));
  out.push('| --- | --- | --- | --- | ---: | ---: |');
  for (const c of view.crosswalks) {
    const mapped = t('crosswalk.ofTotal', { count: c.summary.subcategoriesMapped, total: c.summary.totalSubcategories });
    out.push(
      `| \`${esc(c.id)}\` | ${esc(c.framework)}${c.thirdParty ? ` — ${t('crosswalk.thirdParty.label')}` : ''} | ` +
        `${esc(c.developer)} | ${esc(c.releaseDate)} | ${c.summary.references} | ${mapped} |`,
    );
  }
  out.push('');

  for (const c of view.crosswalks) {
    const m = c.summary;
    out.push(`## ${esc(c.framework)}${c.thirdParty ? ` (${t('crosswalk.thirdParty.label')})` : ''}`);
    out.push('');
    out.push(`- ${t('crosswalk.item.id', { id: `\`${esc(c.id)}\`` })}`);
    out.push(
      `- ${t('crosswalk.item.mapping', { name: esc(c.olirName), version: esc(c.olirVersion), date: esc(c.releaseDate) })}`,
    );
    out.push(`- ${t('crosswalk.item.developer', { developer: esc(c.developer) })}`);
    out.push(`- ${t('crosswalk.item.catalog', { url: `<${view.catalogUrl}>` })}`);
    // Present only when NIST hosts the mapping's own document (the loader
    // accepts no other link).
    if (c.sourceUrl) out.push(`- ${t('crosswalk.item.document', { url: `<${c.sourceUrl}>` })}`);
    if (c.thirdParty) out.push(`- ${t('crosswalk.thirdParty.line')}`);
    out.push(
      `- ${t('crosswalk.item.relationships', {
        subcategories: m.subcategoriesMapped,
        totalSubcategories: m.totalSubcategories,
        categories: m.categoriesMapped,
        totalCategories: m.totalCategories,
        functions: m.functionsMapped,
        totalFunctions: m.totalFunctions,
      })}`,
    );
    if (m.subcategoriesNotAssessed + m.groupsNotAssessed > 0) {
      out.push(
        `- ${t('crosswalk.item.notShown', { subcategories: m.subcategoriesNotAssessed, groups: m.groupsNotAssessed })}`,
      );
    }
    out.push('');

    if (c.references.length === 0) {
      out.push(t('crosswalk.noReferences'));
      out.push('');
      continue;
    }

    out.push(t('crosswalk.counts.intro', { framework: esc(c.framework) }));
    out.push('');
    out.push(`- ${t('crosswalk.counts.listed', { count: m.references })}`);
    out.push(`- ${t('crosswalk.counts.withGap', { count: m.referencesWithGap })}`);
    if (m.referencesPendingReview > 0) {
      out.push(`- ${t('crosswalk.counts.pending', { count: m.referencesPendingReview })}`);
    }
    out.push('');

    const withOutcomes = c.references.filter((r) => r.related.length > 0);
    const withGroups = c.references.filter((r) => r.groups.length > 0);

    if (withOutcomes.length > 0) {
      out.push(t('crosswalk.table.outcomes.title'));
      out.push('');
      out.push(t('crosswalk.table.outcomes.header'));
      out.push('| --- | --- |');
      for (const reference of withOutcomes) {
        out.push(`| ${esc(reference.reference_id)} | ${relatedCell(reference, withGroups.length > 0, locale)} |`);
      }
      out.push('');
    }

    if (withGroups.length > 0) {
      out.push(t('crosswalk.table.groups.title'));
      out.push('');
      out.push(t('crosswalk.table.groups.intro'));
      out.push('');
      out.push(t('crosswalk.table.groups.header'));
      out.push('| --- | --- | --- |');
      for (const reference of withGroups) {
        for (const group of reference.groups) {
          const name = esc(locale.groupName(group));
          const related = t(group.level === 'category' ? 'crosswalk.group.category' : 'crosswalk.group.function', { name });
          out.push(`| ${esc(reference.reference_id)} | ${related} | ${distributionCell(group, locale)} |`);
        }
      }
      out.push('');
    }
  }

  out.push('---');
  out.push('');
  out.push(t('crosswalk.footer'));
  out.push('');
  return out.join('\n');
}
