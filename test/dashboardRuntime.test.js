/**
 * Runs the dashboard's embedded script — not just parses it.
 *
 * The script is one function: an exception anywhere stops everything after it
 * from rendering, and `new Function(source)` (the parse check in
 * targetReports.test.js) cannot see a runtime error. So these tests execute the
 * real script against a minimal stand-in for the DOM and inspect the tree it
 * builds. The stand-in has no HTML parser on purpose: text can only arrive as
 * text, which is exactly the property the dashboard relies on for untrusted
 * document names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../src/report/profile.js';
import { buildDocumentView } from '../src/report/documentView.js';
import { renderDashboardHtml } from '../src/report/htmlDashboard.js';

/* ------------------------------ DOM stand-in ------------------------------ */

class FakeNode {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.value = '';
    this.hidden = false;
    this.text = '';
    this.classList = { add() {}, remove() {} };
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  set textContent(value) {
    this.children = [];
    this.text = String(value);
  }
  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join('');
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  dispatch(type, event = {}) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }
  click() {
    this.dispatch('click');
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
}

/** Execute a rendered dashboard and return the root of the tree it built. */
function runDashboard(html) {
  const data = /<script id="csf-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1];
  const script = /<script>([\s\S]*?)<\/script>\s*<\/body>/.exec(html)[1];
  const app = new FakeNode('div');
  const documentElement = new FakeNode('html');
  const byId = { 'csf-data': { textContent: data }, app };
  const document = {
    documentElement,
    getElementById: (id) => byId[id],
    createElement: (tag) => new FakeNode(tag),
    createElementNS: (ns, tag) => new FakeNode(tag),
    createTextNode: (text) => {
      const node = new FakeNode('#text');
      node.text = String(text);
      return node;
    },
  };
  const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const getComputedStyle = () => ({ getPropertyValue: () => '' });
  new Function('document', 'localStorage', 'getComputedStyle', script)(document, localStorage, getComputedStyle);
  return app;
}

function all(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const child of node.children) all(child, predicate, found);
  return found;
}

const headings = (root) => all(root, (n) => n.tagName === 'h2').map((n) => n.textContent);

function cardTitled(root, title) {
  return all(root, (n) => n.tagName === 'section').find((section) =>
    all(section, (n) => n.tagName === 'h2').some((h) => h.textContent === title),
  );
}

/** Table rows of a card as arrays of cell text (header row included). */
function tableRows(card) {
  return all(card, (n) => n.tagName === 'tr').map((tr) => tr.children.map((cell) => cell.textContent));
}

/* -------------------------------- fixtures -------------------------------- */

const NOW = '2026-01-01T00:00:00.000Z';
const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' } },
  now: () => NOW,
};
const CSF = {
  frameworkVersion: 'CSF 2.0',
  sample: false,
  functions: [{ id: 'GV', name: 'GOVERN' }, { id: 'PR', name: 'PROTECT' }],
  subcategories: [
    sub('GV.OC-01', 'Mission understood', 'GOVERN', 'Organizational Context (GV.OC)'),
    sub('PR.AA-01', 'Identities managed', 'PROTECT', 'Identity Management (PR.AA)'),
  ],
};

function sub(id, outcome, fnName, category) {
  return {
    id, outcome, function: fnName, category,
    functionId: id.split('.')[0], functionName: fnName, categoryId: id.split('-')[0],
    implementationExamples: ['Example action'],
  };
}

function assessment(id, coverage, files) {
  return {
    subcategory_id: id,
    coverage,
    confidence: 0.8,
    evidence: files.map((file) => ({ source_file: file, page: null, score: 0.5, quote: `quote from ${file}`, verified: true })),
    rationale: `rationale for ${id}`,
    needs_review: false,
    verification: { quotes_checked: files.length, quotes_verified: files.length, downgraded: false },
    retrieved: files.map((file) => ({ chunk_id: `${file}#c0`, source_file: file, page: null, score: 0.4 })),
  };
}

function fixture({ documents, quoted = ['policy.md'] } = {}) {
  const assessments = {
    'GV.OC-01': assessment('GV.OC-01', 'partial', quoted),
    'PR.AA-01': assessment('PR.AA-01', 'none', []),
  };
  const meta = documents === null ? {} : { documents: documents ?? [{ source_file: 'policy.md', path: 'policy.md', chunks: 3 }] };
  const profile = buildProfile(CTX, { csf: CSF, assessments, reviews: {}, meta });
  return { profile, documentView: buildDocumentView(profile, { assessments, meta }) };
}

/* ---------------------------------- tests --------------------------------- */

test('dashboard script runs to completion without the optional sections', () => {
  const { profile } = fixture();
  const root = runDashboard(renderDashboardHtml(profile, null));
  assert.deepEqual(headings(root), ['Assessment activity', 'Coverage by Function', 'All subcategories']);
  assert.equal(all(root, (n) => n.tagName === 'footer').length, 1);
});

test('dashboard renders the evidence-by-document table from the document view', () => {
  const { profile, documentView } = fixture({
    documents: [
      { source_file: 'policy.md', path: 'policy.md', chunks: 3 },
      { source_file: 'unused-memo.txt', path: 'unused-memo.txt', chunks: 1 },
    ],
  });
  const root = runDashboard(renderDashboardHtml(profile, null, { documentView }));

  // The card sits before the explorer, and the script kept going after it.
  assert.deepEqual(headings(root), ['Assessment activity', 'Coverage by Function', 'Evidence by document', 'All subcategories']);
  const card = cardTitled(root, 'Evidence by document');
  assert.match(
    card.textContent,
    /2 documents ingested · 1 quoted at least once · 1 never quoted · 1 of 2 outcomes have a verified quote\./,
  );
  assert.match(card.textContent, /A document that is never quoted is not thereby irrelevant/);
  assert.deepEqual(tableRows(card), [
    ['Document', 'Chunks', 'Retrieved for', 'Quoted for', 'Quotes', 'Coverage of quoted outcomes', 'Functions'],
    ['policy.md', '3', '1', '1', '1', 'partial 1', 'GOVERN'],
    ['unused-memo.txt', '1', '0', '0', '0', '—', '—'],
  ]);
  // A plain table: no chart, and no expand control for a short list.
  assert.equal(all(card, (n) => n.tagName === 'svg').length, 0);
  assert.equal(all(card, (n) => n.tagName === 'button').length, 0);
});

test('dashboard shows a hostile document name as text', () => {
  const hostile = '<img src=x onerror=alert(1)>.md';
  const { profile, documentView } = fixture({
    documents: [{ source_file: hostile, path: hostile, chunks: 1 }],
    quoted: [hostile],
  });
  const root = runDashboard(renderDashboardHtml(profile, null, { documentView }));
  const cells = all(cardTitled(root, 'Evidence by document'), (n) => n.tagName === 'td');
  // The name is the text of a cell — it never became an element.
  assert.equal(cells[0].textContent, hostile);
  assert.equal(all(root, (n) => n.tagName === 'img').length, 0);
});

test('dashboard caps a long document list and expands it on request', () => {
  const documents = Array.from({ length: 12 }, (_, i) => ({
    source_file: `doc-${String(i + 1).padStart(2, '0')}.md`,
    path: `doc-${String(i + 1).padStart(2, '0')}.md`,
    chunks: 1,
  }));
  const { profile, documentView } = fixture({ documents, quoted: ['doc-07.md'] });
  const root = runDashboard(renderDashboardHtml(profile, null, { documentView }));
  const card = cardTitled(root, 'Evidence by document');
  const button = all(card, (n) => n.tagName === 'button')[0];

  assert.equal(tableRows(card).length, 1 + 10);
  assert.equal(tableRows(card)[1][0], 'doc-07.md'); // the quoted document leads
  assert.equal(button.textContent, 'Show all 12 documents');

  button.click();
  assert.equal(tableRows(card).length, 1 + 12);
  assert.equal(button.textContent, 'Show the first 10');
  assert.equal(button.getAttribute('aria-pressed'), 'true');

  button.click();
  assert.equal(tableRows(card).length, 1 + 10);
});

test('dashboard carries the document view caveats: reconstructed list, shared names', () => {
  const reconstructed = fixture({ documents: null });
  let card = cardTitled(
    runDashboard(renderDashboardHtml(reconstructed.profile, null, { documentView: reconstructed.documentView })),
    'Evidence by document',
  );
  assert.match(card.textContent, /1 document seen in the assessment \(list reconstructed\)/);
  assert.match(card.textContent, /Note: Document list reconstructed from the assessment/);
  assert.equal(tableRows(card)[1][1], '—'); // chunk count unknown, not 0

  const shared = fixture({
    documents: [
      { source_file: 'policy.md', path: 'a/policy.md', chunks: 3 },
      { source_file: 'policy.md', path: 'b/policy.md', chunks: 2 },
    ],
  });
  card = cardTitled(
    runDashboard(renderDashboardHtml(shared.profile, null, { documentView: shared.documentView })),
    'Evidence by document',
  );
  assert.equal(tableRows(card)[1][0], 'policy.md (2 files share this name)');
  assert.equal(tableRows(card)[1][1], '5');
  assert.match(card.textContent, /Note: 2 ingested files share the name policy\.md: a\/policy\.md, b\/policy\.md\./);
  // Files and names are not conflated in the headline either.
  assert.match(card.textContent, /2 files ingested under 1 distinct name · 1 quoted at least once · 0 never quoted · /);

  // A document the assessment cites but the ingest record does not list is marked and counted apart.
  const unlisted = fixture({ documents: [{ source_file: 'other.md', path: 'other.md', chunks: 1 }] });
  card = cardTitled(
    runDashboard(renderDashboardHtml(unlisted.profile, null, { documentView: unlisted.documentView })),
    'Evidence by document',
  );
  assert.equal(tableRows(card)[1][0], 'policy.md (not in the ingest record)');
  assert.equal(tableRows(card)[2][0], 'other.md');
  assert.match(card.textContent, /1 document ingested · 0 quoted at least once · 1 never quoted · 1 not in the ingest record · /);
});
