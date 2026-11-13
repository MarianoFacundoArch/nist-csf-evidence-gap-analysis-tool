/**
 * Builds the canonical "evidence by document" view — the reverse of every other
 * deliverable. The reports answer "Subcategory -> which evidence supports it";
 * this answers "document -> what does it contribute": which of the
 * organization's documents carry the assessment, and which were ingested but
 * never quoted.
 *
 * Like buildProfile() and buildTargetView(), this is the ONE object that every
 * renderer of the view uses (evidence-by-document.md and the dashboard card),
 * so the two can never disagree.
 *
 * Three inputs, each used only for what it can honestly support:
 *  - meta.documents (written by ingest): the document universe and the chunk
 *    counts. A work directory ingested by an earlier version lacks it; the list
 *    is then RECONSTRUCTED from the assessment and flagged, because a document
 *    that was never retrieved leaves no trace there.
 *  - assessments[id].retrieved: which documents had a passage among those
 *    retrieved for each Subcategory.
 *  - the PROFILE's evidence: the quotes that survived the verbatim verifier,
 *    with the EFFECTIVE coverage of the outcome they are attached to. A
 *    reviewer may override an outcome to "none" while the quotes the assessment
 *    selected stay listed, so all four coverage levels can occur here.
 *
 * Known limitation, stated rather than guessed around: evidence is keyed by
 * `source_file`, a base name. Two ingested files with the same base name in
 * different folders cannot be told apart in the evidence, so they share one
 * row and the view says so.
 */

import { COVERAGE_LEVELS } from '../engine/coverage.js';
import { orderFunctions } from '../csf/order.js';
import { compareText } from '../util/compare.js';

/** Names listed inline in a note before it switches to "and N more". */
const NOTE_NAME_LIMIT = 10;

/**
 * @param {object} profile the Current Profile from buildProfile()
 * @param {object} [inputs]
 * @param {Record<string, object>} [inputs.assessments] assessments.json (for the `retrieved` lists)
 * @param {object} [inputs.meta] meta.json (for `documents` and `ingest_report`)
 * @returns {{
 *   documentList: 'ingest' | 'reconstructed',
 *   retrievalRecorded: boolean,
 *   analysis: { status: string, assessed: number, total: number, reasons: string[] } | null,
 *   summary: {
 *     documents: number, documentsIngested: number | null, documentNames: number,
 *     documentsQuoted: number, documentsNeverQuoted: number, documentsUnlisted: number,
 *     outcomes: number, outcomesWithQuotes: number, quotes: number,
 *     concentration: { documents: number, outcomes: number } | null,
 *     notIngested: { skipped: number, failed: number } | null,
 *   },
 *   sharedNames: Array<{ source_file: string, paths: string[] }>,
 *   unlisted: string[],
 *   notes: string[],
 *   documents: Array<{
 *     source_file: string, files: number | null, chunks: number | null, listed: boolean,
 *     retrieved_for: number | null, cited_in: string[], quotes: number,
 *     cited_by_coverage: { none: number, partial: number, substantial: number, full: number },
 *     functions: string[],
 *     citations: Array<{ subcategory_id: string, function: string, coverage: string,
 *       review_status: string, quotes: number, pages: number[] }>,
 *   }>,
 * }}
 */
export function buildDocumentView(profile, { assessments = {}, meta = {} } = {}) {
  const entries = profile?.subcategories ?? [];
  const record = ingestRecord(meta);

  const rows = new Map();
  const rowFor = (name) => {
    let row = rows.get(name);
    if (!row) {
      // Without an ingest record every row belongs to the (reconstructed)
      // list; with one, a name first seen in the assessment is NOT in it.
      row = { source_file: name, files: null, chunks: null, listed: record == null, retrieved_for: 0, citations: [] };
      rows.set(name, row);
    }
    return row;
  };

  // 1) The document universe as ingest recorded it. Evidence can only be
  //    attributed to a file NAME, so files that share one are a single row.
  const sharedNames = [];
  for (const [name, files] of groupByName(record ?? [])) {
    const row = rowFor(name);
    row.listed = true;
    row.files = files.length;
    row.chunks = files.every((f) => isCount(f.chunks)) ? files.reduce((n, f) => n + f.chunks, 0) : null;
    if (files.length > 1) {
      sharedNames.push({ source_file: name, paths: files.map((f) => f.path).sort(compareText) });
    }
  }
  sharedNames.sort((a, b) => compareText(a.source_file, b.source_file));

  // 2) Retrieval: for how many outcomes was a passage of the document among
  //    those the assessment looked at.
  let retrievalRecorded = false;
  for (const e of entries) {
    const retrieved = assessments?.[e.subcategory_id]?.retrieved;
    if (!Array.isArray(retrieved)) continue;
    retrievalRecorded = true;
    const names = new Set(retrieved.map((r) => r?.source_file).filter(isName));
    for (const name of names) rowFor(name).retrieved_for++;
  }

  // 3) Citations: the profile's evidence, i.e. what survived the verifier.
  //    Entries are walked in CSF order, so each row's citations are too.
  const quotedOutcomes = new Set();
  for (const e of entries) {
    const perDocument = new Map();
    for (const ev of e.evidence ?? []) {
      if (ev?.verified === false || !isName(ev?.source_file)) continue;
      const cited = perDocument.get(ev.source_file) ?? { quotes: 0, pages: new Set() };
      cited.quotes++;
      if (Number.isInteger(ev.page)) cited.pages.add(ev.page);
      perDocument.set(ev.source_file, cited);
    }
    for (const [name, cited] of perDocument) {
      rowFor(name).citations.push({
        subcategory_id: e.subcategory_id,
        function: e.function,
        coverage: e.coverage,
        review_status: e.review_status,
        quotes: cited.quotes,
        pages: [...cited.pages].sort((a, b) => a - b),
      });
      quotedOutcomes.add(e.subcategory_id);
    }
  }

  const documents = [...rows.values()]
    .map((row) => {
      const byCoverage = Object.fromEntries(COVERAGE_LEVELS.map((level) => [level, 0]));
      for (const c of row.citations) if (Object.hasOwn(byCoverage, c.coverage)) byCoverage[c.coverage]++;
      return {
        source_file: row.source_file,
        files: row.files,
        chunks: row.chunks,
        listed: row.listed,
        // null = unknown, which is not the same statement as "retrieved for 0".
        retrieved_for: retrievalRecorded ? row.retrieved_for : null,
        cited_in: row.citations.map((c) => c.subcategory_id),
        quotes: row.citations.reduce((n, c) => n + c.quotes, 0),
        cited_by_coverage: byCoverage,
        functions: orderFunctions(row.citations),
        citations: row.citations,
      };
    })
    // The order of the deliverable: most outcomes cited first, then by name.
    .sort((a, b) => b.cited_in.length - a.cited_in.length || compareText(a.source_file, b.source_file));

  // Counts are kept per population so they add up: `documentsIngested` counts
  // FILES; the list itself has one row per file NAME (`documentNames`), each
  // either quoted or never quoted; rows the assessment mentions but the ingest
  // record does not (`documentsUnlisted`) are counted apart — as far as this
  // work directory knows they were not ingested, so they are neither.
  const listed = documents.filter((d) => d.listed);
  const view = {
    documentList: record ? 'ingest' : 'reconstructed',
    retrievalRecorded,
    analysis: analysisState(profile),
    summary: {
      documents: documents.length,
      documentsIngested: record ? record.length : null,
      documentNames: listed.length,
      documentsQuoted: listed.filter((d) => d.quotes > 0).length,
      documentsNeverQuoted: listed.filter((d) => d.quotes === 0).length,
      documentsUnlisted: documents.length - listed.length,
      outcomes: entries.length,
      outcomesWithQuotes: quotedOutcomes.size,
      quotes: documents.reduce((n, d) => n + d.quotes, 0),
      concentration: concentration(documents, quotedOutcomes.size),
      notIngested: notIngested(meta?.ingest_report),
    },
    sharedNames,
    unlisted: documents.filter((d) => !d.listed).map((d) => d.source_file).sort(compareText),
    notes: [],
    documents,
  };
  view.notes = documentViewNotes(view);
  return view;
}

/**
 * The caveats that apply to a view, as fixed sentences. One function so the
 * Markdown report and the dashboard word them identically; `formatName` lets a
 * renderer escape document names for its own medium (they are untrusted text).
 * @param {object} view a view from buildDocumentView()
 * @param {(name: string) => string} [formatName]
 * @returns {string[]}
 */
export function documentViewNotes(view, formatName = (name) => name) {
  const notes = [];
  const list = (names) => {
    const shown = names.slice(0, NOTE_NAME_LIMIT).map(formatName).join(', ');
    return names.length > NOTE_NAME_LIMIT ? `${shown}, and ${names.length - NOTE_NAME_LIMIT} more` : shown;
  };

  if (view.documentList === 'reconstructed') {
    notes.push(
      'Document list reconstructed from the assessment: this work directory has no ingest record of its ' +
        'documents (it was ingested by an earlier version of the tool). Only documents that were retrieved or ' +
        'quoted for at least one outcome are listed, chunk counts are unavailable, and files that share a name ' +
        'cannot be detected. Re-run the ingest stage to record the full list.',
    );
  }
  for (const shared of view.sharedNames) {
    notes.push(
      `${shared.paths.length} ingested files share the name ${formatName(shared.source_file)}: ${list(shared.paths)}. ` +
        'Evidence is recorded by file name, so their quotes and retrievals cannot be attributed to one file or ' +
        'another and are counted together in a single row.',
    );
  }
  if (view.unlisted.length > 0) {
    const n = view.unlisted.length;
    notes.push(
      `${n} document${n === 1 ? ' appears' : 's appear'} in the assessment but not in the latest ingest record: ` +
        `${list(view.unlisted)}. The assessment was made against an earlier set of documents; re-run the analyze ` +
        'stage to bring it up to date.',
    );
  }
  if (!view.retrievalRecorded) {
    notes.push(
      'The assessment does not record which passages were retrieved for each outcome, so the "retrieved for" ' +
        'figures are unavailable.',
    );
  }
  // This view can only show what the analysis looked at. When the analysis is
  // behind the document index, or unfinished, "never quoted" would otherwise
  // read as a finding about documents that were never examined.
  const analysis = view.analysis;
  if (analysis?.status === 'stale') {
    notes.push(
      `The assessment is out of date with its inputs (${analysis.reasons.join('; ')}). A document ingested or ` +
        'changed after the analysis has not been assessed and appears here as never quoted; re-run the analyze ' +
        'stage.',
    );
  } else if (analysis && analysis.assessed < analysis.total) {
    notes.push(
      `The analysis is incomplete: ${analysis.assessed} of ${analysis.total} outcomes have been assessed. The ` +
        'figures here cover only those outcomes; run the analyze stage to complete it.',
    );
  }
  return notes;
}

/* -------------------------------- helpers --------------------------------- */

function isName(value) {
  return typeof value === 'string' && value.length > 0;
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

/**
 * The usable entries of meta.documents, or null when ingest recorded none (an
 * older work directory, or a list emptied by hand) — in which case the caller
 * reconstructs the list instead of presenting an empty one as fact.
 */
function ingestRecord(meta) {
  if (!Array.isArray(meta?.documents)) return null;
  const valid = meta.documents
    .filter((d) => d && typeof d === 'object' && isName(d.source_file))
    .map((d) => ({ source_file: d.source_file, path: isName(d.path) ? d.path : d.source_file, chunks: d.chunks }));
  return valid.length > 0 ? valid : null;
}

function groupByName(record) {
  const groups = new Map();
  for (const doc of record) {
    if (!groups.has(doc.source_file)) groups.set(doc.source_file, []);
    groups.get(doc.source_file).push(doc);
  }
  return groups;
}

/**
 * How concentrated the evidence is: the smallest N such that the top-N
 * documents (in the view's order, i.e. by outcomes cited) are together quoted
 * for at least half of the outcomes that have any quote. Counted on the UNION
 * of outcomes — several documents can support the same outcome, so adding up
 * per-document counts would overstate what the top documents cover.
 */
function concentration(documents, outcomesWithQuotes) {
  if (outcomesWithQuotes === 0) return null;
  const covered = new Set();
  for (let i = 0; i < documents.length; i++) {
    for (const id of documents[i].cited_in) covered.add(id);
    if (covered.size * 2 >= outcomesWithQuotes) return { documents: i + 1, outcomes: covered.size };
  }
  return null; // unreachable: every quoted outcome is cited by some document
}

/**
 * How far the analysis got, as the profile records it (null for a profile
 * that carries no such record). Only the fields the notes need.
 */
function analysisState(profile) {
  const analysis = profile?.activity?.analysis;
  if (!analysis || typeof analysis !== 'object') return null;
  return {
    status: String(analysis.status ?? ''),
    assessed: isCount(analysis.assessed) ? analysis.assessed : 0,
    total: isCount(analysis.total) ? analysis.total : 0,
    reasons: Array.isArray(analysis.reasons) ? analysis.reasons.map(String) : [],
  };
}

/** Files that ingest could not turn into chunks; they are not in the index. */
function notIngested(report) {
  const skipped = isCount(report?.skipped) ? report.skipped : 0;
  const failed = isCount(report?.failed) ? report.failed : 0;
  return skipped + failed > 0 ? { skipped, failed } : null;
}
