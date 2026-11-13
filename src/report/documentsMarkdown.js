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
 */

import { documentViewNotes } from './documentView.js';
import { mdCode, mdCell } from './markdownText.js';
import { COVERAGE_LEVELS } from '../engine/coverage.js';

const NOTE =
  'The reverse view of the assessment: for each of the organization\'s documents, the CSF 2.0 outcomes it is ' +
  'quoted for. Every quote counted here was verified verbatim against the document text. Coverage levels are ' +
  'those of the Current Profile (see gap-analysis.md): AI proposes, a human validates.';

const NEVER_QUOTED_NOTE =
  'No passage from these documents was selected as verbatim evidence for a CSF 2.0 outcome in this assessment. ' +
  'That alone does not make a document irrelevant or without value: its content may be outside the scope of ' +
  'the framework, may duplicate what another document was quoted for, or may simply not have been among the ' +
  'passages retrieved for an outcome.';

/**
 * @param {object} profile the Current Profile from buildProfile()
 * @param {object} view the document view from buildDocumentView()
 * @returns {string} Markdown
 */
export function renderDocumentsMarkdown(profile, view) {
  const s = view.summary;
  const reconstructed = view.documentList === 'reconstructed';
  const byId = new Map(profile.subcategories.map((e) => [e.subcategory_id, e]));
  const out = [];

  out.push('# NIST CSF 2.0 — Evidence by Document');
  out.push('');
  out.push(`> ${NOTE}`);
  out.push('');
  if (profile.summary.unreviewed > 0 || profile.summary.stale > 0) {
    out.push(
      `> **DRAFT — not fully reviewed.** ${profile.summary.unreviewed} unreviewed and ${profile.summary.stale} ` +
        'stale item(s) remain. A human must validate every item before the coverage levels shown here are ' +
        'authoritative.',
    );
    out.push('');
  }

  out.push('## Summary');
  out.push('');
  out.push(`- Generated: ${profile.generatedAt}`);
  out.push(`- Documents ingested: ${ingestedLine(view)}`);
  if (s.notIngested) {
    out.push(
      `- Not ingested: ${s.notIngested.skipped} skipped (no extractable text), ${s.notIngested.failed} failed to ` +
        'parse — these files are not part of the assessment and are not listed here',
    );
  }
  out.push(`- Quoted at least once: ${s.documentsQuoted}`);
  out.push(`- ${reconstructed ? 'Retrieved' : 'Ingested'} but never quoted: ${s.documentsNeverQuoted}`);
  if (s.documentsUnlisted > 0) {
    out.push(`- In the assessment but not in the latest ingest record: ${s.documentsUnlisted} (see the note below)`);
  }
  out.push(`- Outcomes with at least one verified quote: ${s.outcomesWithQuotes} of ${s.outcomes}`);
  out.push(`- Verified quotes: ${s.quotes}`);
  out.push(`- Evidence concentration: ${concentrationLine(s)}`);
  out.push('');
  for (const note of documentViewNotes(view, mdCode)) {
    out.push(`> **Note.** ${note}`);
    out.push('');
  }

  out.push('## Documents');
  out.push('');
  if (view.documents.length === 0) {
    out.push('_No document is recorded for this assessment._');
    out.push('');
  } else {
    out.push(
      'Ordered by the number of outcomes a document is quoted for, then by name. "Retrieved for" counts the ' +
        'outcomes for which at least one passage of the document was among those retrieved for the assessment; ' +
        '"Quoted for" counts the outcomes with at least one verified quote from it. The last four numeric ' +
        'columns break those outcomes down by their current coverage.',
    );
    out.push('');
    out.push('| Document | Chunks | Retrieved for | Quoted for | Verified quotes | None | Partial | Substantial | Full | Functions |');
    out.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const d of view.documents) {
      const c = d.cited_by_coverage;
      out.push(
        `| ${mdCell(mdCode(d.source_file))} | ${orDash(d.chunks)} | ${orDash(d.retrieved_for)} | ${d.cited_in.length} | ` +
          `${d.quotes} | ${c.none} | ${c.partial} | ${c.substantial} | ${c.full} | ${d.functions.join(', ') || '—'} |`,
      );
    }
    out.push('');
  }

  const quoted = view.documents.filter((d) => d.quotes > 0);
  out.push('## What each document is quoted for');
  out.push('');
  if (quoted.length === 0) {
    out.push('_No document is quoted: no outcome has a verified quote in this assessment._');
    out.push('');
  } else if (quoted.some((d) => d.cited_by_coverage.none > 0)) {
    // Only possible through a human override; explain it where it occurs.
    out.push(
      'An outcome listed below with coverage "none" was set to that level by a reviewer: the quotes the ' +
        'assessment selected stay listed so the decision remains traceable.',
    );
    out.push('');
  }
  for (const d of quoted) {
    out.push(`### ${mdCode(d.source_file)}`);
    out.push('');
    if (d.files > 1) out.push(`- ${d.files} ingested files share this name; their figures are combined (see the note above)`);
    if (!d.listed) out.push('- Not in the latest ingest record (see the note above)');
    out.push(`- Chunks indexed: ${d.chunks ?? 'not recorded'}`);
    if (d.retrieved_for != null) out.push(`- Retrieved for: ${d.retrieved_for} of ${s.outcomes} outcomes`);
    out.push(
      `- Quoted for: ${count(d.cited_in.length, 'outcome')} (${count(d.quotes, 'verified quote')}) in ${d.functions.join(', ')}`,
    );
    out.push(
      `- Current coverage of those outcomes: ${COVERAGE_LEVELS.map((level) => `${level} ${d.cited_by_coverage[level]}`).join(', ')}`,
    );
    out.push('');
    for (const c of d.citations) {
      const e = byId.get(c.subcategory_id);
      const pages = c.pages.length ? ` (${c.pages.map((p) => `p.${p}`).join(', ')})` : '';
      out.push(
        `- **${c.subcategory_id}** — _${c.coverage}_${statusBadge(c, e)} — ${count(c.quotes, 'quote')}${pages}` +
          `${e ? `: ${e.outcome}` : ''}`,
      );
    }
    out.push('');
  }

  const neverQuoted = view.documents.filter((d) => d.quotes === 0 && d.listed);
  out.push(`## ${reconstructed ? 'Retrieved' : 'Ingested'} but never quoted`);
  out.push('');
  if (view.documents.length === 0) {
    out.push('_No document is recorded for this assessment._');
    out.push('');
  } else if (neverQuoted.length === 0) {
    out.push(
      reconstructed
        ? '_Every document seen in the assessment is quoted for at least one outcome._'
        : '_Every ingested document is quoted for at least one outcome._',
    );
    out.push('');
  } else {
    out.push(NEVER_QUOTED_NOTE);
    out.push('');
    out.push('| Document | Chunks | Retrieved for |');
    out.push('| --- | ---: | ---: |');
    for (const d of neverQuoted) {
      out.push(`| ${mdCell(mdCode(d.source_file))} | ${orDash(d.chunks)} | ${orDash(d.retrieved_for)} |`);
    }
    out.push('');
  }
  if (reconstructed) {
    out.push(
      'The document list was reconstructed, so a document that was never retrieved for any outcome is missing ' +
        'from this section.',
    );
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(
    'Derived from the same Current Profile as gap-analysis.md and evidence-map.csv, which lists every quote with ' +
      'its text. Documents are identified by file name. Items marked UNREVIEWED or STALE still require human ' +
      'validation.',
  );
  out.push('');
  return out.join('\n');
}

function ingestedLine(view) {
  const s = view.summary;
  if (s.documentsIngested == null) {
    return `not recorded — ${s.documents} seen in the assessment (see the note below)`;
  }
  return s.documentNames === s.documentsIngested
    ? String(s.documentsIngested)
    : `${s.documentsIngested} files under ${s.documentNames} distinct file names (see the note below)`;
}

/**
 * Says what is computed and no more: the figure is read off the table's own
 * order, in which documents quoted for the same number of outcomes are ranked
 * by name — so it is "where half is first reached in this table", not a claim
 * about the smallest possible set of documents.
 */
function concentrationLine(s) {
  if (!s.concentration) return 'not applicable (no outcome has a verified quote)';
  const { documents, outcomes } = s.concentration;
  const share = `${outcomes} of the ${s.outcomesWithQuotes} outcomes that have a quote`;
  return documents === 1
    ? `the first document in the table below is quoted for ${share} — at least half`
    : `the first ${documents} documents in the table below are together quoted for ${share} — the point in ` +
        'the table at which half is first reached';
}

/** Review state of the cited outcome; AI output is never shown as validated. */
function statusBadge(citation, entry) {
  const parts = [];
  if (citation.review_status === 'unreviewed') parts.push('⚠ UNREVIEWED');
  else if (citation.review_status === 'stale') parts.push('⚠ STALE REVIEW');
  if (entry?.human_coverage != null) parts.push(`reviewer override: ${entry.ai_coverage} → ${entry.human_coverage}`);
  return parts.length ? ` _(${parts.join('; ')})_` : '';
}

function count(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function orDash(value) {
  return value == null ? '—' : String(value);
}
