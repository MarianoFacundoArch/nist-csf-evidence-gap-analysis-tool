import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { buildProfile } from '../src/report/profile.js';
import { buildDocumentView, documentViewNotes } from '../src/report/documentView.js';
import { renderDocumentsMarkdown } from '../src/report/documentsMarkdown.js';
import { renderDashboardHtml } from '../src/report/htmlDashboard.js';
import { mdCode, mdCell, mdLine } from '../src/report/markdownText.js';
import { compareText } from '../src/util/compare.js';
import { buildContext } from '../src/core/context.js';
import { ingest } from '../src/actions/ingest.js';
import { readJsonSafe } from '../src/util/fsx.js';
import { hashAssessment } from '../src/util/hash.js';

const NOW = '2026-01-01T00:00:00.000Z';

const CSF = {
  frameworkVersion: 'CSF 2.0',
  sample: false,
  functions: [
    { id: 'GV', name: 'GOVERN' },
    { id: 'ID', name: 'IDENTIFY' },
    { id: 'PR', name: 'PROTECT' },
  ],
  // Deliberately not in id order: GV.RM before GV.OC, as a CSF export may be.
  subcategories: [
    sub('GV.RM-01', 'Risk objectives agreed', 'GOVERN', 'Risk Management Strategy (GV.RM)'),
    sub('GV.OC-01', 'Mission understood', 'GOVERN', 'Organizational Context (GV.OC)'),
    sub('ID.AM-01', 'Hardware inventoried', 'IDENTIFY', 'Asset Management (ID.AM)'),
    sub('PR.AA-01', 'Identities managed', 'PROTECT', 'Identity Management (PR.AA)'),
    sub('PR.AA-05', 'Access enforced', 'PROTECT', 'Identity Management (PR.AA)'),
  ],
};

function sub(id, outcome, fnName, category) {
  return {
    id,
    outcome,
    function: fnName,
    category,
    functionId: id.split('.')[0],
    functionName: fnName,
    categoryId: id.split('-')[0],
    implementationExamples: [],
  };
}

/** quotes: [[file, page?], ...]; retrieved: file names (repeats allowed). */
function assessment(id, coverage, quotes = [], retrieved = []) {
  return {
    subcategory_id: id,
    coverage,
    confidence: 0.8,
    evidence: quotes.map(([file, page = null], i) => ({
      source_file: file,
      page,
      score: 0.5,
      quote: `verbatim quote ${i + 1} for ${id}`,
      verified: true,
    })),
    rationale: `rationale for ${id}`,
    needs_review: false,
    verification: { quotes_checked: quotes.length, quotes_verified: quotes.length, downgraded: false },
    retrieved: retrieved.map((file, i) => ({ chunk_id: `${file}#c${i}`, source_file: file, page: null, score: 0.4 })),
  };
}

const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' } },
  now: () => NOW,
};

const META = {
  ingest_report: { parsed: 4, skipped: 0, failed: 0 },
  // Out of order on purpose: the view must not depend on the order in meta.
  documents: [
    { source_file: 'unused-memo.txt', path: 'unused-memo.txt', chunks: 1 },
    { source_file: 'policy.md', path: 'policy.md', chunks: 3 },
    { source_file: 'never-retrieved.md', path: 'archive/never-retrieved.md', chunks: 2 },
    { source_file: 'access-standard.pdf', path: 'standards/access-standard.pdf', chunks: 4 },
  ],
};

function baseAssessments() {
  return {
    'GV.RM-01': assessment('GV.RM-01', 'partial', [['policy.md']], ['policy.md', 'policy.md', 'unused-memo.txt']),
    'GV.OC-01': assessment('GV.OC-01', 'substantial', [['policy.md'], ['policy.md']], ['policy.md']),
    'ID.AM-01': assessment('ID.AM-01', 'none', [], ['policy.md', 'access-standard.pdf']),
    'PR.AA-01': assessment(
      'PR.AA-01',
      'full',
      [['access-standard.pdf', 2], ['policy.md'], ['access-standard.pdf', 5]],
      ['access-standard.pdf', 'policy.md'],
    ),
    'PR.AA-05': assessment('PR.AA-05', 'partial', [['access-standard.pdf', 2]], ['access-standard.pdf']),
  };
}

function build({ assessments = baseAssessments(), reviews = {}, meta = META } = {}) {
  const profile = buildProfile(CTX, { csf: CSF, assessments, reviews, meta });
  return { profile, view: buildDocumentView(profile, { assessments, meta }) };
}

const row = (view, name) => view.documents.find((d) => d.source_file === name);

test('document view: chunks, retrievals and verified quotes per document', () => {
  const { view } = build();

  assert.equal(view.documentList, 'ingest');
  // Most outcomes cited first; ties (0 cited) by name.
  assert.deepEqual(
    view.documents.map((d) => d.source_file),
    ['policy.md', 'access-standard.pdf', 'never-retrieved.md', 'unused-memo.txt'],
  );

  const policy = row(view, 'policy.md');
  assert.equal(policy.chunks, 3);
  assert.equal(policy.files, 1);
  // Two chunks retrieved for the same outcome count that outcome once.
  assert.equal(policy.retrieved_for, 4);
  // CSF order (GV.RM-01 precedes GV.OC-01 in this core), not id order.
  assert.deepEqual(policy.cited_in, ['GV.RM-01', 'GV.OC-01', 'PR.AA-01']);
  // Two quotes for GV.OC-01: one outcome, two quotes.
  assert.equal(policy.quotes, 4);
  assert.deepEqual(policy.cited_by_coverage, { none: 0, partial: 1, substantial: 1, full: 1 });
  assert.deepEqual(policy.functions, ['GOVERN', 'PROTECT']);

  const standard = row(view, 'access-standard.pdf');
  assert.deepEqual(standard.cited_in, ['PR.AA-01', 'PR.AA-05']);
  assert.equal(standard.quotes, 3);
  assert.equal(standard.retrieved_for, 3);
  assert.deepEqual(standard.citations[0], {
    subcategory_id: 'PR.AA-01',
    function: 'PROTECT',
    coverage: 'full',
    review_status: 'unreviewed',
    quotes: 2,
    pages: [2, 5],
  });

  // Retrieved once, never quoted — and one that was never even retrieved.
  assert.equal(row(view, 'unused-memo.txt').retrieved_for, 1);
  assert.equal(row(view, 'unused-memo.txt').quotes, 0);
  assert.equal(row(view, 'never-retrieved.md').retrieved_for, 0);
  assert.deepEqual(row(view, 'never-retrieved.md').cited_in, []);

  assert.deepEqual(view.summary, {
    documents: 4,
    documentsIngested: 4,
    documentNames: 4,
    documentsQuoted: 2,
    documentsNeverQuoted: 2,
    documentsUnlisted: 0,
    outcomes: 5,
    outcomesWithQuotes: 4,
    quotes: 7,
    concentration: { documents: 1, outcomes: 3 },
    notIngested: null,
  });
  assert.deepEqual(view.notes, []);
  assert.deepEqual(view.sharedNames, []);
  assert.deepEqual(view.unlisted, []);
});

test('document view: a reviewer override to "none" keeps the quotes listed, under none', () => {
  const assessments = baseAssessments();
  const reviews = {
    'GV.RM-01': {
      decision: 'override',
      final_coverage: 'none',
      note: 'The quoted sentence is intent only.',
      reviewed_by: 'reviewer@example.org',
      reviewed_at: NOW,
      reviewed_against: hashAssessment(assessments['GV.RM-01']),
    },
  };
  const { profile, view } = build({ assessments, reviews });

  const policy = row(view, 'policy.md');
  assert.deepEqual(policy.cited_in, ['GV.RM-01', 'GV.OC-01', 'PR.AA-01']);
  assert.deepEqual(policy.cited_by_coverage, { none: 1, partial: 0, substantial: 1, full: 1 });
  assert.equal(policy.citations[0].coverage, 'none');
  assert.equal(policy.citations[0].review_status, 'reviewed');
  // The outcome still counts as one that has a verified quote.
  assert.equal(view.summary.outcomesWithQuotes, 4);

  const md = renderDocumentsMarkdown(profile, view);
  assert.match(md, /\*\*GV\.RM-01\*\* — _none_ _\(reviewer override: partial → none\)_ — 1 quote: Risk objectives agreed/);
  // The report explains the apparent contradiction where it occurs — and only there.
  assert.match(md, /An outcome listed below with coverage "none" was set to that level by a reviewer/);
  const plain = build();
  assert.ok(!renderDocumentsMarkdown(plain.profile, plain.view).includes('was set to that level by a reviewer'));
});

test('document view: concentration is counted on the union of outcomes, not the sum', () => {
  // A cites 4 outcomes, B cites 3 of the same 4, C and D cite 3 others each:
  // 10 outcomes have a quote. Top-2 by outcomes cited (A, B) add up to 7 but
  // cover only 4 distinct outcomes; half (5) is first reached with C.
  const ids = Array.from({ length: 10 }, (_, i) => `GV.OC-${String(i + 1).padStart(2, '0')}`);
  const csf = { ...CSF, subcategories: ids.map((id) => sub(id, `outcome ${id}`, 'GOVERN', 'Organizational Context (GV.OC)')) };
  const citing = {
    'a.md': ids.slice(0, 4),
    'b.md': ids.slice(0, 3),
    'c.md': ids.slice(4, 7),
    'd.md': ids.slice(7, 10),
  };
  const assessments = {};
  for (const id of ids) {
    const files = Object.keys(citing).filter((file) => citing[file].includes(id));
    assessments[id] = assessment(id, 'partial', files.map((file) => [file]), files);
  }
  const meta = { documents: Object.keys(citing).map((file) => ({ source_file: file, path: file, chunks: 1 })) };
  const profile = buildProfile(CTX, { csf, assessments, reviews: {}, meta });
  const view = buildDocumentView(profile, { assessments, meta });

  assert.deepEqual(view.documents.map((d) => d.source_file), ['a.md', 'b.md', 'c.md', 'd.md']);
  assert.equal(view.summary.outcomesWithQuotes, 10);
  assert.deepEqual(view.summary.concentration, { documents: 3, outcomes: 7 });
  assert.match(
    renderDocumentsMarkdown(profile, view),
    /- Evidence concentration: the first 3 documents in the table below are together quoted for 7 of the 10 outcomes that have a quote — the point in the table at which half is first reached\n/,
  );
});

/** Documents citing the given outcome ids, as a profile + view (all coverage partial). */
function citing(byDocument) {
  const ids = [...new Set(Object.values(byDocument).flat())].sort();
  const csf = { ...CSF, subcategories: ids.map((id) => sub(id, `outcome ${id}`, 'GOVERN', 'Organizational Context (GV.OC)')) };
  const assessments = {};
  for (const id of ids) {
    const files = Object.keys(byDocument).filter((file) => byDocument[file].includes(id));
    assessments[id] = assessment(id, 'partial', files.map((file) => [file]), files);
  }
  const meta = { documents: Object.keys(byDocument).map((file) => ({ source_file: file, path: file, chunks: 1 })) };
  const profile = buildProfile(CTX, { csf, assessments, reviews: {}, meta });
  return { profile, view: buildDocumentView(profile, { assessments, meta }) };
}

test('document view: concentration counts exactly half as reaching half', () => {
  // Two documents, two distinct outcomes each: the first row alone is 2 of 4.
  const { profile, view } = citing({ 'a.md': ['GV.OC-01', 'GV.OC-02'], 'b.md': ['GV.OC-03', 'GV.OC-04'] });
  assert.deepEqual(view.summary.concentration, { documents: 1, outcomes: 2 });
  assert.match(
    renderDocumentsMarkdown(profile, view),
    /- Evidence concentration: the first document in the table below is quoted for 2 of the 4 outcomes that have a quote — at least half\n/,
  );
});

test('document view: with ties the concentration figure is a statement about the table, and says so', () => {
  // Four documents quoted for two outcomes each; a and b overlap fully. Which
  // of the tied documents come first is decided by name, and so is the figure:
  // the report must not present it as the smallest possible set of documents.
  const overlap = ['GV.OC-01', 'GV.OC-02'];
  const first = citing({ 'a.md': overlap, 'b.md': overlap, 'c.md': ['GV.OC-03', 'GV.OC-04'], 'd.md': ['GV.OC-05', 'GV.OC-06'] });
  const renamed = citing({ 'a.md': overlap, 'z.md': overlap, 'c.md': ['GV.OC-03', 'GV.OC-04'], 'd.md': ['GV.OC-05', 'GV.OC-06'] });
  assert.deepEqual(first.view.summary.concentration, { documents: 3, outcomes: 4 });
  assert.deepEqual(renamed.view.summary.concentration, { documents: 2, outcomes: 4 });

  for (const { profile, view } of [first, renamed]) {
    const { documents: n, outcomes } = view.summary.concentration;
    const union = (rows) => new Set(rows.flatMap((d) => d.cited_in)).size;
    // The figure is exactly what the first n rows of the table give...
    assert.equal(union(view.documents.slice(0, n)), outcomes);
    assert.ok(outcomes * 2 >= view.summary.outcomesWithQuotes);
    assert.ok(union(view.documents.slice(0, n - 1)) * 2 < view.summary.outcomesWithQuotes);
    // ...and the sentence claims no more than that.
    const md = renderDocumentsMarkdown(profile, view);
    assert.ok(md.includes(`the first ${n} documents in the table below are together quoted for ${outcomes} of the 6 outcomes`));
    assert.ok(!/fewest|smallest|minimum/i.test(md));
    assert.match(md, /Ordered by the number of outcomes a document is quoted for, then by name\./);
  }
});

test('document view: no quotes at all means no concentration figure and an explicit empty state', () => {
  const assessments = {};
  for (const s of CSF.subcategories) assessments[s.id] = assessment(s.id, 'none', [], ['policy.md']);
  const { profile, view } = build({ assessments });

  assert.equal(view.summary.concentration, null);
  assert.equal(view.summary.documentsQuoted, 0);
  assert.equal(view.summary.documentsNeverQuoted, 4);
  const md = renderDocumentsMarkdown(profile, view);
  assert.match(md, /Evidence concentration: not applicable \(no outcome has a verified quote\)/);
  assert.match(md, /_No document is quoted: no outcome has a verified quote in this assessment\._/);
});

test('document view: an assessment with no documents at all renders plain empty states', () => {
  // Nothing ingested is recorded and nothing was assessed: no row can be built.
  const { profile, view } = build({ assessments: {}, meta: {} });

  assert.deepEqual(view.documents, []);
  assert.equal(view.summary.documents, 0);
  assert.equal(view.summary.concentration, null);
  const md = renderDocumentsMarkdown(profile, view);
  assert.equal(md.split('_No document is recorded for this assessment._').length - 1, 2);
  assert.ok(!md.includes('Every document seen in the assessment is quoted')); // vacuously true, so not said
  assert.ok(!md.includes('| Document |'));
});

test('document view: every ingested document quoted is said in so many words', () => {
  const meta = { documents: META.documents.filter((d) => ['policy.md', 'access-standard.pdf'].includes(d.source_file)) };
  const assessments = baseAssessments();
  assessments['GV.RM-01'].retrieved = [{ chunk_id: 'policy.md#c0', source_file: 'policy.md', page: null, score: 0.4 }];
  const { profile, view } = build({ assessments, meta });
  assert.equal(view.summary.documentsNeverQuoted, 0);
  assert.match(renderDocumentsMarkdown(profile, view), /_Every ingested document is quoted for at least one outcome\._/);
});

test('document view: without an ingest record the list is reconstructed and says so', () => {
  const meta = { ingest_report: { parsed: 4, skipped: 0, failed: 0 } }; // an older work dir: no `documents`
  const { profile, view } = build({ meta });

  assert.equal(view.documentList, 'reconstructed');
  assert.equal(view.summary.documentsIngested, null);
  // Only documents the assessment saw; never-retrieved.md cannot be known.
  assert.deepEqual(
    view.documents.map((d) => d.source_file),
    ['policy.md', 'access-standard.pdf', 'unused-memo.txt'],
  );
  assert.ok(view.documents.every((d) => d.chunks === null && d.files === null && d.listed === true));
  assert.equal(view.summary.documentsNeverQuoted, 1);
  assert.equal(view.notes.length, 1);
  assert.match(view.notes[0], /^Document list reconstructed from the assessment/);
  assert.match(view.notes[0], /chunk counts are unavailable/);
  assert.match(view.notes[0], /Re-run the ingest stage/);

  const md = renderDocumentsMarkdown(profile, view);
  assert.match(md, /- Documents ingested: not recorded — 3 seen in the assessment/);
  assert.match(md, /> \*\*Note\.\*\* Document list reconstructed from the assessment/);
  assert.match(md, /## Retrieved but never quoted/);
  assert.match(md, /a document that was never retrieved for any outcome is missing from this section/);
  // Unknown chunk counts are shown as unknown, never as 0.
  assert.match(md, /\| `policy\.md` \| — \| 4 \|/);
  assert.match(md, /- Chunks indexed: not recorded/);
});

test('document view: an emptied or malformed meta.documents is treated as no record, not as "no documents"', () => {
  for (const documents of [[], [null, { path: 'x.md' }], 'policy.md']) {
    const { view } = build({ meta: { documents } });
    assert.equal(view.documentList, 'reconstructed');
    assert.equal(view.documents.length, 3);
  }
});

test('document view: two ingested files with the same base name share one row, and the view says so', () => {
  const meta = {
    documents: [
      ...META.documents,
      { source_file: 'policy.md', path: 'legacy/policy.md', chunks: 5 },
    ],
  };
  const { profile, view } = build({ meta });

  const policy = row(view, 'policy.md');
  assert.equal(policy.files, 2);
  assert.equal(policy.chunks, 8); // 3 + 5: counted together, never guessed apart
  assert.equal(view.summary.documentsIngested, 5);
  assert.equal(view.summary.documents, 4);
  assert.deepEqual(view.sharedNames, [{ source_file: 'policy.md', paths: ['legacy/policy.md', 'policy.md'] }]);
  assert.equal(view.notes.length, 1);
  assert.match(view.notes[0], /^2 ingested files share the name policy\.md: legacy\/policy\.md, policy\.md\./);
  assert.match(view.notes[0], /cannot be attributed to one file or another/);

  const md = renderDocumentsMarkdown(profile, view);
  assert.match(md, /- Documents ingested: 5 files under 4 distinct file names/);
  assert.match(md, /> \*\*Note\.\*\* 2 ingested files share the name `policy\.md`: `legacy\/policy\.md`, `policy\.md`\./);
  assert.match(md, /- 2 ingested files share this name; their figures are combined/);
});

test('document view: a document cited by the assessment but absent from the ingest record is kept and flagged', () => {
  // Re-ingest with a different folder, without re-running analyze.
  const meta = { documents: META.documents.filter((d) => d.source_file !== 'access-standard.pdf') };
  const { profile, view } = build({ meta });

  const standard = row(view, 'access-standard.pdf');
  assert.equal(standard.listed, false);
  assert.equal(standard.chunks, null);
  assert.equal(standard.quotes, 3); // its quotes are not silently dropped
  assert.deepEqual(view.unlisted, ['access-standard.pdf']);
  assert.equal(view.summary.documentsIngested, 3);
  assert.match(view.notes[0], /^1 document appears in the assessment but not in the latest ingest record: access-standard\.pdf\./);
  assert.match(view.notes[0], /re-run the analyze stage/);

  const md = renderDocumentsMarkdown(profile, view);
  assert.match(md, /- Not in the latest ingest record/);
});

test('document view: the headline counts keep their populations apart, so they add up', () => {
  // The ingest record lists only never-retrieved.md; the assessment still cites
  // policy.md and access-standard.pdf and retrieved unused-memo.txt.
  const meta = { documents: META.documents.filter((d) => d.source_file === 'never-retrieved.md') };
  const { profile, view } = build({ meta });
  const s = view.summary;

  assert.equal(s.documentsIngested, 1);
  assert.equal(s.documentNames, 1);
  // "Quoted" and "never quoted" are about the ingested list only...
  assert.equal(s.documentsQuoted, 0);
  assert.equal(s.documentsNeverQuoted, 1);
  assert.equal(s.documentsQuoted + s.documentsNeverQuoted, s.documentNames);
  // ...and what the assessment mentions beyond it is counted apart.
  assert.equal(s.documentsUnlisted, 3);
  assert.equal(s.documentNames + s.documentsUnlisted, s.documents);
  assert.deepEqual(view.unlisted, ['access-standard.pdf', 'policy.md', 'unused-memo.txt']);

  const md = renderDocumentsMarkdown(profile, view);
  assert.match(md, /- Documents ingested: 1\n- Quoted at least once: 0\n- Ingested but never quoted: 1\n- In the assessment but not in the latest ingest record: 3 \(see the note below\)\n/);
  // A document outside the ingest record that was never quoted is not "ingested but never quoted".
  const never = md.slice(md.indexOf('## Ingested but never quoted'));
  assert.ok(never.includes('`never-retrieved.md`'));
  assert.ok(!never.includes('`unused-memo.txt`'));
});

test('document view: an analysis that is behind the document index is called out', () => {
  // Documents were added and re-ingested, but analyze was not run again: the
  // new files show up as "never quoted" only because nothing examined them.
  const meta = {
    ...META,
    index_id: 'index-after-adding-documents',
    analyzed_index_id: 'index-at-analysis-time',
    documents: [...META.documents, { source_file: 'added-later.md', path: 'added-later.md', chunks: 3 }],
  };
  const { profile, view } = build({ meta });

  assert.equal(profile.activity.analysis.status, 'stale');
  assert.equal(view.analysis.status, 'stale');
  assert.equal(row(view, 'added-later.md').retrieved_for, 0);
  const note = view.notes.at(-1);
  assert.match(note, /^The assessment is out of date with its inputs \(evidence index changed since analysis\)\./);
  assert.match(note, /has not been assessed and appears here as never quoted; re-run the analyze stage\./);
  assert.ok(renderDocumentsMarkdown(profile, view).includes(`> **Note.** ${note}`));

  // An up-to-date analysis carries no such note.
  assert.deepEqual(build().view.notes, []);
});

test('document view: an unfinished analysis is called out', () => {
  const assessments = baseAssessments();
  delete assessments['PR.AA-01'];
  delete assessments['PR.AA-05'];
  const { view } = build({ assessments });
  assert.equal(view.analysis.assessed, 3);
  assert.match(view.notes.at(-1), /^The analysis is incomplete: 3 of 5 outcomes have been assessed\. The figures here cover only those outcomes/);
});

test('document view: a profile without an activity record gets no analysis note', () => {
  const { profile } = build();
  delete profile.activity;
  const view = buildDocumentView(profile, { assessments: baseAssessments(), meta: META });
  assert.equal(view.analysis, null);
  assert.deepEqual(view.notes, []);
});

test('document view: "retrieved for" is unknown, not zero, when no assessment records retrieval', () => {
  const assessments = baseAssessments();
  for (const a of Object.values(assessments)) delete a.retrieved;
  const { profile, view } = build({ assessments });

  assert.equal(view.retrievalRecorded, false);
  assert.ok(view.documents.every((d) => d.retrieved_for === null));
  assert.match(view.notes.at(-1), /"retrieved for" figures are unavailable/);
  assert.match(renderDocumentsMarkdown(profile, view), /\| `policy\.md` \| 3 \| — \| 3 \|/);
});

test('document view: unverified or unattributable evidence is not counted', () => {
  const assessments = baseAssessments();
  assessments['GV.RM-01'].evidence[0].verified = false;
  assessments['PR.AA-05'].evidence[0].source_file = '';
  const { view } = build({ assessments });

  assert.deepEqual(row(view, 'policy.md').cited_in, ['GV.OC-01', 'PR.AA-01']);
  assert.deepEqual(row(view, 'access-standard.pdf').cited_in, ['PR.AA-01']);
  assert.equal(view.summary.outcomesWithQuotes, 2);
  assert.equal(view.summary.quotes, 5);
});

test('document view: files that never reached the index are reported, not hidden', () => {
  const meta = { ...META, ingest_report: { parsed: 4, skipped: 1, failed: 2 } };
  const { profile, view } = build({ meta });

  assert.deepEqual(view.summary.notIngested, { skipped: 1, failed: 2 });
  assert.match(
    renderDocumentsMarkdown(profile, view),
    /- Not ingested: 1 skipped \(no extractable text\), 2 failed to parse — these files are not part of the assessment/,
  );
});

test('evidence-by-document.md: sections, order, and wording that does not overclaim', () => {
  const { profile, view } = build();
  const md = renderDocumentsMarkdown(profile, view);

  assert.match(md, /^# NIST CSF 2\.0 — Evidence by Document\n/);
  const sections = ['## Summary', '## Documents', '## What each document is quoted for', '## Ingested but never quoted'];
  const positions = sections.map((heading) => md.indexOf(`\n${heading}\n`));
  assert.ok(positions.every((p) => p > 0), 'every section is present');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'sections are in order');

  assert.match(md, /- Documents ingested: 4\n/);
  assert.match(md, /- Quoted at least once: 2\n/);
  assert.match(md, /- Ingested but never quoted: 2\n/);
  assert.match(md, /- Outcomes with at least one verified quote: 4 of 5\n/);
  assert.match(md, /- Verified quotes: 7\n/);
  assert.match(md, /- Evidence concentration: the first document in the table below is quoted for 3 of the 4 outcomes that have a quote — at least half\n/);

  // Table rows follow the view's order.
  assert.match(md, /\| `policy\.md` \| 3 \| 4 \| 3 \| 4 \| 0 \| 1 \| 1 \| 1 \| GOVERN, PROTECT \|\n\| `access-standard\.pdf` \| 4 \| 3 \| 2 \| 3 \| 0 \| 1 \| 0 \| 1 \| PROTECT \|/);
  // Per-document detail with pages and review state.
  assert.match(md, /### `access-standard\.pdf`\n/);
  assert.match(md, /- \*\*PR\.AA-01\*\* — _full_ _\(⚠ UNREVIEWED\)_ — 2 quotes \(p\.2, p\.5\): Identities managed/);
  // Only quoted documents get a detail block.
  assert.ok(!md.includes('### `unused-memo.txt`'));

  // "Never quoted" is a statement about this assessment, not about the document.
  const never = md.slice(md.indexOf('## Ingested but never quoted'));
  assert.match(never, /No passage from these documents was selected as verbatim evidence/);
  assert.match(never, /That alone does not make a document irrelevant or without value/);
  assert.match(never, /\| `never-retrieved\.md` \| 2 \| 0 \|\n\| `unused-memo\.txt` \| 1 \| 1 \|/);
  assert.ok(!/useless|irrelevant document|can be discarded|not needed/i.test(md));
});

test('evidence-by-document.md: DRAFT banner follows the review state, like gap-analysis.md', () => {
  const assessments = baseAssessments();
  const draft = build({ assessments });
  assert.match(renderDocumentsMarkdown(draft.profile, draft.view), /> \*\*DRAFT — not fully reviewed\.\*\* 5 unreviewed and 0 stale item\(s\) remain\./);

  const reviews = {};
  for (const [id, a] of Object.entries(assessments)) {
    reviews[id] = { decision: 'accept', final_coverage: a.coverage, reviewed_at: NOW, reviewed_against: hashAssessment(a) };
  }
  const final = build({ assessments, reviews });
  const md = renderDocumentsMarkdown(final.profile, final.view);
  assert.ok(!md.includes('DRAFT'));
  assert.ok(!md.includes('⚠ UNREVIEWED')); // no item carries the badge once reviewed
});

test('evidence-by-document.md: document names are data, never markup', () => {
  const hostile = 'q3|`report`__final__<img src=x onerror=alert(1)>.md';
  const assessments = baseAssessments();
  assessments['GV.OC-01'] = assessment('GV.OC-01', 'partial', [[hostile]], [hostile]);
  const meta = { documents: [...META.documents, { source_file: hostile, path: hostile, chunks: 1 }] };
  const { profile, view } = build({ assessments, meta });
  const md = renderDocumentsMarkdown(profile, view);

  // In the table: inside a code span that its own backticks cannot close, pipe escaped.
  assert.ok(md.includes('| ``q3\\|`report`__final__<img src=x onerror=alert(1)>.md`` | 1 |'));
  // In a heading: the same code span (no table, so the pipe is left alone).
  assert.ok(md.includes('### ``q3|`report`__final__<img src=x onerror=alert(1)>.md``\n'));
  // Every table row still has the same number of unescaped cell separators.
  const tableRows = md.split('\n').filter((line) => line.startsWith('| `'));
  for (const line of tableRows.filter((l) => l.includes('GOVERN') || l.includes('PROTECT'))) {
    assert.equal(line.replace(/\\\|/g, '').split('|').length, 12, line);
  }
});

test('document view is deterministic: same inputs, same bytes, whatever the order in meta', () => {
  // Two shared names as well, so the order of the notes is covered too.
  const documents = [
    ...META.documents,
    { source_file: 'policy.md', path: 'legacy/policy.md', chunks: 5 },
    { source_file: 'access-standard.pdf', path: 'old/access-standard.pdf', chunks: 1 },
  ];
  const a = build({ meta: { ...META, documents } });
  const b = build({ meta: { ...META, documents: [...documents].reverse() } });
  assert.deepEqual(a.view, b.view);
  assert.deepEqual(a.view.sharedNames.map((shared) => shared.source_file), ['access-standard.pdf', 'policy.md']);
  assert.equal(renderDocumentsMarkdown(a.profile, a.view), renderDocumentsMarkdown(b.profile, b.view));
});

test('documentViewNotes formats names through the renderer-supplied escaper', () => {
  const meta = { documents: [...META.documents, { source_file: 'policy.md', path: 'legacy/policy.md', chunks: 5 }] };
  const { view } = build({ meta });
  assert.match(documentViewNotes(view, (name) => `<${name}>`)[0], /share the name <policy\.md>: <legacy\/policy\.md>, <policy\.md>\./);
});

test('dashboard embeds the document view only when it is passed', () => {
  const { profile, view } = build();
  const dataOf = (html) => JSON.parse(/<script id="csf-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);

  const without = dataOf(renderDashboardHtml(profile, null));
  assert.deepEqual(Object.keys(without), ['profile', 'target', 'planOrder', 'functionOrder']);

  const withView = dataOf(renderDashboardHtml(profile, null, { documentView: view }));
  assert.deepEqual(withView.documentView, JSON.parse(JSON.stringify(view)));
  // extras is an object of optional keys: null/empty must behave like omitted.
  assert.deepEqual(Object.keys(dataOf(renderDashboardHtml(profile, null, {}))), Object.keys(without));
  assert.deepEqual(Object.keys(dataOf(renderDashboardHtml(profile, null, null))), Object.keys(without));
});

test('dashboard: a hostile document name cannot break out of the embedded data', () => {
  const hostile = '</script><script>alert(1)</script>.md';
  const assessments = baseAssessments();
  assessments['GV.OC-01'] = assessment('GV.OC-01', 'partial', [[hostile]], [hostile]);
  const meta = { documents: [...META.documents, { source_file: hostile, path: hostile, chunks: 1 }] };
  const { profile, view } = build({ assessments, meta });
  const html = renderDashboardHtml(profile, null, { documentView: view });

  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.ok(html.includes('\\u003c/script>\\u003cscript>alert(1)'));
  assert.ok(!/\.innerHTML\s*=/.test(html));
});

test('mdCode renders any text literally; mdCell keeps a table row intact', () => {
  assert.equal(mdCode('policy.md'), '`policy.md`');
  assert.equal(mdCode('__init__.md'), '`__init__.md`');
  assert.equal(mdCode('a`b.md'), '``a`b.md``');
  assert.equal(mdCode('``x``'), '``` ``x`` ```'); // padded: content starts/ends with a backtick
  assert.equal(mdCode('two\nlines'), '`two lines`');
  assert.equal(mdCode(''), '');
  assert.equal(mdCell('a|b\nc'), 'a\\|b c');
});

test('mdLine holds free text to a single line', () => {
  assert.equal(mdLine('Policy exists.\n  - [ ] Buy product X\r\n\r\n#### Fake heading'), 'Policy exists. - [ ] Buy product X #### Fake heading');
  // A single line comes back character for character.
  assert.equal(mdLine('  one line, untouched: * _ ` |  '), '  one line, untouched: * _ ` |  ');
  assert.equal(mdLine(null), '');
});

test('compareText orders names without consulting a locale', () => {
  const names = ['beta.md', 'Alpha.md', 'alpha.md', 'Zeta.md', 'alpha-2.md', '10.md', '9.md'];
  const sorted = [...names].sort(compareText);
  assert.deepEqual(sorted, ['10.md', '9.md', 'alpha-2.md', 'Alpha.md', 'alpha.md', 'beta.md', 'Zeta.md']);
  // A total order: equal only when identical.
  assert.equal(compareText('a', 'a'), 0);
  assert.ok(compareText('A', 'a') < 0 && compareText('a', 'A') > 0);
});

test('ingest records the parsed documents in meta, sorted, with paths relative to the documents folder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'csf-docview-'));
  try {
    const docs = join(root, 'docs');
    await mkdir(join(docs, 'hr'), { recursive: true });
    await mkdir(join(docs, 'it'), { recursive: true });
    const body = 'The access policy is reviewed annually by the security committee. '.repeat(4);
    await writeFile(join(docs, 'zeta-policy.md'), body);
    await writeFile(join(docs, 'it', 'handbook.md'), body);
    await writeFile(join(docs, 'hr', 'handbook.md'), body);
    await writeFile(join(docs, 'empty.txt'), '   \n');
    // Names chosen so that neither the discovery order (locale collation puts
    // "_" before "-") nor an order by path alone ("beta.md" < "it/alpha.md")
    // happens to equal the recorded one.
    await writeFile(join(docs, 'a_b.md'), body);
    await writeFile(join(docs, 'a-b.md'), body);
    await writeFile(join(docs, 'beta.md'), body);
    await writeFile(join(docs, 'it', 'alpha.md'), body);

    const ctx = await buildContext({
      docsPath: docs,
      workDir: join(root, 'work'),
      embeddings: { provider: 'mock', model: 'mock' },
      llm: { provider: 'mock', model: 'mock' },
      fixedNow: NOW,
      logLevel: 'quiet',
    });
    await ingest(ctx);
    const meta = await readJsonSafe(ctx.paths.meta, {});

    // Sorted by source_file, then path; the empty file produced no chunk and is not listed.
    assert.deepEqual(meta.documents, [
      { source_file: 'a-b.md', path: 'a-b.md', chunks: 1 },
      { source_file: 'a_b.md', path: 'a_b.md', chunks: 1 },
      { source_file: 'alpha.md', path: 'it/alpha.md', chunks: 1 },
      { source_file: 'beta.md', path: 'beta.md', chunks: 1 },
      { source_file: 'handbook.md', path: 'hr/handbook.md', chunks: 1 },
      { source_file: 'handbook.md', path: 'it/handbook.md', chunks: 1 },
      { source_file: 'zeta-policy.md', path: 'zeta-policy.md', chunks: 1 },
    ]);
    assert.ok(meta.documents.every((d) => !isAbsolute(d.path) && !d.path.includes(root)));
    assert.deepEqual(meta.ingest_report, { parsed: 7, skipped: 1, failed: 0 });

    // A single file passed as --docs is its own root.
    const single = await buildContext({
      docsPath: join(docs, 'zeta-policy.md'),
      workDir: join(root, 'work-single'),
      embeddings: { provider: 'mock', model: 'mock' },
      llm: { provider: 'mock', model: 'mock' },
      fixedNow: NOW,
      logLevel: 'quiet',
    });
    await ingest(single);
    const singleMeta = await readJsonSafe(single.paths.meta, {});
    assert.deepEqual(singleMeta.documents, [{ source_file: 'zeta-policy.md', path: 'zeta-policy.md', chunks: 1 }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
