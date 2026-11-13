/**
 * Renders evidence-by-document.md — the reverse view of the assessment: for
 * each of the organization's documents, the CSF 2.0 outcomes it is quoted for,
 * and the documents that were ingested but never quoted. It is the first thing
 * an assessor shows a client: which documents carry the assessment.
 *
 * Everything here is derived from the canonical document view
 * (documentView.js), so this report and the dashboard card cannot disagree.
 *
 * Wording is deliberately narrow. "Never quoted" states only what the tool
 * knows — no passage of the document was selected as verbatim evidence for a
 * CSF outcome in this assessment — and never that the document is irrelevant:
 * it may be outside the framework's scope, duplicate what another document was
 * quoted for, or simply not have been retrieved. Document names are untrusted
 * text and are always emitted as code spans.
 *
 * The wording comes from the message catalog through a report locale
 * (src/i18n/locale.js): English when none is given, as always; otherwise the
 * tool's sentences in that language, with Function names and outcomes from the
 * published translation of the Core.
 */

import { documentViewNotes } from './documentView.js';
import { mdCode, mdCell } from './markdownText.js';
import { COVERAGE_LEVELS } from '../engine/coverage.js';
import { asLocale, frameworkNoteLines } from '../i18n/locale.js';

/**
 * @param {object} profile the Current Profile from buildProfile()
 * @param {object} view the document view from buildDocumentView()
 * @param {object} [options]
 * @param {ReturnType<typeof import('../i18n/locale.js').createReportLocale>} [options.locale]
 *   report locale; English when omitted
 * @returns {string} Markdown
 */
export function renderDocumentsMarkdown(profile, view, options) {
  const locale = asLocale(options?.locale);
  const { t } = locale;
  const s = view.summary;
  const reconstructed = view.documentList === 'reconstructed';
  const byId = new Map(profile.subcategories.map((e) => [e.subcategory_id, e]));
  const functionName = locale.functionNames(profile.subcategories);
  const functionList = (names) => names.map(functionName).join(', ');
  const out = [];

  out.push(`# ${t('docs.title')}`);
  out.push('');
  out.push(`> ${t('docs.note')}`);
  out.push('');
  if (profile.summary.unreviewed > 0 || profile.summary.stale > 0) {
    out.push(`> ${t('docs.draft', { unreviewed: profile.summary.unreviewed, stale: profile.summary.stale })}`);
    out.push('');
  }
  out.push(...frameworkNoteLines(locale, profile.subcategories));

  out.push(`## ${t('docs.heading.summary')}`);
  out.push('');
  out.push(`- ${t('common.overview.generated', { date: profile.generatedAt })}`);
  out.push(`- ${t('docs.summary.ingested', { value: ingestedLine(view, locale) })}`);
  if (s.notIngested) {
    out.push(`- ${t('docs.summary.notIngested', { skipped: s.notIngested.skipped, failed: s.notIngested.failed })}`);
  }
  out.push(`- ${t('docs.summary.quoted', { count: s.documentsQuoted })}`);
  out.push(
    `- ${t(reconstructed ? 'docs.summary.neverQuoted.retrieved' : 'docs.summary.neverQuoted.ingested', { count: s.documentsNeverQuoted })}`,
  );
  if (s.documentsUnlisted > 0) {
    out.push(`- ${t('docs.summary.unlisted', { count: s.documentsUnlisted })}`);
  }
  out.push(`- ${t('docs.summary.outcomesWithQuotes', { count: s.outcomesWithQuotes, total: s.outcomes })}`);
  out.push(`- ${t('docs.summary.quotes', { count: s.quotes })}`);
  out.push(`- ${t('docs.summary.concentration', { value: concentrationLine(s, locale) })}`);
  out.push('');
  for (const note of documentViewNotes(view, mdCode, locale)) {
    out.push(`> ${t('common.note', { note })}`);
    out.push('');
  }

  out.push(`## ${t('docs.heading.documents')}`);
  out.push('');
  if (view.documents.length === 0) {
    out.push(t('docs.noDocuments'));
    out.push('');
  } else {
    out.push(t('docs.documents.intro'));
    out.push('');
    out.push(t('docs.table.documents.header'));
    out.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const d of view.documents) {
      const c = d.cited_by_coverage;
      out.push(
        `| ${mdCell(mdCode(d.source_file))} | ${orDash(d.chunks)} | ${orDash(d.retrieved_for)} | ${d.cited_in.length} | ` +
          `${d.quotes} | ${c.none} | ${c.partial} | ${c.substantial} | ${c.full} | ${functionList(d.functions) || '—'} |`,
      );
    }
    out.push('');
  }

  const quoted = view.documents.filter((d) => d.quotes > 0);
  out.push(`## ${t('docs.heading.quotedFor')}`);
  out.push('');
  if (quoted.length === 0) {
    out.push(t('docs.noneQuoted'));
    out.push('');
  } else if (quoted.some((d) => d.cited_by_coverage.none > 0)) {
    // Only possible through a human override; explain it where it occurs.
    out.push(t('docs.quotedFor.noneOverride'));
    out.push('');
  }
  for (const d of quoted) {
    out.push(`### ${mdCode(d.source_file)}`);
    out.push('');
    if (d.files > 1) out.push(`- ${t('docs.doc.sharedName', { files: d.files })}`);
    if (!d.listed) out.push(`- ${t('docs.doc.unlisted')}`);
    out.push(`- ${t('docs.doc.chunks', { chunks: d.chunks ?? t('docs.notRecorded') })}`);
    if (d.retrieved_for != null) {
      out.push(`- ${t('docs.doc.retrievedFor', { count: d.retrieved_for, total: s.outcomes })}`);
    }
    out.push(
      `- ${t('docs.doc.quotedFor', {
        outcomes: locale.plural('common.count.outcome', d.cited_in.length),
        quotes: locale.plural('docs.count.verifiedQuote', d.quotes),
        functions: functionList(d.functions),
      })}`,
    );
    out.push(
      `- ${t('docs.doc.coverage', {
        distribution: COVERAGE_LEVELS.map((level) => `${locale.coverage(level)} ${d.cited_by_coverage[level]}`).join(', '),
      })}`,
    );
    out.push('');
    for (const c of d.citations) {
      const e = byId.get(c.subcategory_id);
      const pages = c.pages.length ? ` (${c.pages.map((page) => t('common.page', { page })).join(', ')})` : '';
      out.push(
        `- **${c.subcategory_id}** — _${locale.coverage(c.coverage)}_${statusBadge(c, e, locale)} — ` +
          `${locale.plural('common.count.quote', c.quotes)}${pages}${e ? `: ${locale.outcome(e)}` : ''}`,
      );
    }
    out.push('');
  }

  const neverQuoted = view.documents.filter((d) => d.quotes === 0 && d.listed);
  out.push(`## ${t(reconstructed ? 'docs.heading.neverQuoted.retrieved' : 'docs.heading.neverQuoted.ingested')}`);
  out.push('');
  if (view.documents.length === 0) {
    out.push(t('docs.noDocuments'));
    out.push('');
  } else if (neverQuoted.length === 0) {
    out.push(t(reconstructed ? 'docs.neverQuoted.none.retrieved' : 'docs.neverQuoted.none.ingested'));
    out.push('');
  } else {
    out.push(t('docs.neverQuoted.note'));
    out.push('');
    out.push(t('docs.table.neverQuoted.header'));
    out.push('| --- | ---: | ---: |');
    for (const d of neverQuoted) {
      out.push(`| ${mdCell(mdCode(d.source_file))} | ${orDash(d.chunks)} | ${orDash(d.retrieved_for)} |`);
    }
    out.push('');
  }
  if (reconstructed) {
    out.push(t('docs.neverQuoted.reconstructed'));
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(t('docs.footer'));
  out.push('');
  return out.join('\n');
}

function ingestedLine(view, locale) {
  const s = view.summary;
  if (s.documentsIngested == null) {
    return locale.t('docs.summary.ingested.notRecorded', { count: s.documents });
  }
  return s.documentNames === s.documentsIngested
    ? String(s.documentsIngested)
    : locale.t('docs.summary.ingested.sharedNames', { files: s.documentsIngested, names: s.documentNames });
}

/**
 * Says what is computed and no more: the figure is read off the table's own
 * order, in which documents quoted for the same number of outcomes are ranked
 * by name — so it is "where half is first reached in this table", not a claim
 * about the smallest possible set of documents.
 */
function concentrationLine(s, locale) {
  if (!s.concentration) return locale.t('docs.concentration.none');
  const { documents, outcomes } = s.concentration;
  return documents === 1
    ? locale.t('docs.concentration.single', { outcomes, total: s.outcomesWithQuotes })
    : locale.t('docs.concentration.several', { documents, outcomes, total: s.outcomesWithQuotes });
}

/** Review state of the cited outcome; AI output is never shown as validated. */
function statusBadge(citation, entry, locale) {
  const { t } = locale;
  const parts = [];
  if (citation.review_status === 'unreviewed') parts.push(t('badge.unreviewed'));
  else if (citation.review_status === 'stale') parts.push(t('badge.stale'));
  if (entry?.human_coverage != null) {
    parts.push(t('badge.override', { from: locale.coverage(entry.ai_coverage), to: locale.coverage(entry.human_coverage) }));
  }
  return parts.length ? ` _(${parts.join('; ')})_` : '';
}

function orDash(value) {
  return value == null ? '—' : String(value);
}
