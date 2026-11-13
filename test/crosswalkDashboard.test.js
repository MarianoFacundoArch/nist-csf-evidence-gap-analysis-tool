import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile } from '../src/report/profile.js';
import { renderDashboardHtml } from '../src/report/htmlDashboard.js';
import { buildCrosswalkView, crosswalkDashboardData } from '../src/crosswalk/view.js';

// The dashboard renders client-side, so these tests go one step further than
// inspecting the HTML string: they RUN the embedded script against a minimal
// stand-in for the DOM and look at what it builds. No browser, no dependency —
// just enough of the DOM surface for the script's own calls.

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
    sub('GV.OC-01', 'Mission understood', 'GV', 'GOVERN', 'Organizational Context (GV.OC)'),
    sub('GV.OC-02', 'Stakeholders understood', 'GV', 'GOVERN', 'Organizational Context (GV.OC)'),
    sub('PR.AA-01', 'Identities managed', 'PR', 'PROTECT', 'Identity Management (PR.AA)'),
    sub('PR.AA-05', 'Access enforced', 'PR', 'PROTECT', 'Identity Management (PR.AA)'),
  ],
};

function sub(id, outcome, functionId, functionName, category) {
  return { id, outcome, function: functionName, category, functionId, functionName, categoryId: id.split('-')[0] };
}

function profile() {
  const assessments = {};
  for (const s of CSF.subcategories) {
    assessments[s.id] = {
      subcategory_id: s.id, coverage: 'partial', confidence: 0.8,
      evidence: [{ source_file: 'policy.md', page: 1, score: 0.5, quote: `evidence quote for ${s.id}`, verified: true }],
      rationale: `rationale for ${s.id}`, needs_review: false,
      verification: { quotes_checked: 1, quotes_verified: 1, downgraded: false },
    };
  }
  return buildProfile(CTX, { csf: CSF, assessments, reviews: {}, meta: {} });
}

function crosswalks() {
  const entry = (id, framework, thirdParty, maps) => ({
    id, framework, olirName: `${id}-to-CSF`, olirVersion: '1.0.0', developer: 'Developer', releaseDate: '2025-01-01',
    sourceUrl: null, thirdParty, functionMappings: {}, categoryMappings: {}, ...maps,
  });
  return {
    frameworkVersion: 'CSF 2.0',
    source: 'Test source',
    retrievedAt: '2026-11-13',
    catalogUrl: 'https://csrc.nist.gov/projects/olir/informative-reference-catalog',
    crosswalks: [
      entry('alpha', 'Alpha Controls v1', false, {
        // IR-09 is related only to the whole Category PR.AA; FN-1 to the whole Function GV.
        functionMappings: { GV: ['FN-1'] },
        categoryMappings: { 'PR.AA': ['IR-09', 'AC-03'] },
        mappings: { 'GV.OC-01': ['AC-02', 'AC-10'], 'PR.AA-01': ['AC-02'], 'PR.AA-05': ['AC-03'] },
      }),
      entry('beta', 'Beta Standard 2022', true, { mappings: { 'PR.AA-05': ['Clause: 4.2(a)'] } }),
    ],
  };
}

function extras(p) {
  return { crosswalk: crosswalkDashboardData(buildCrosswalkView(p, crosswalks())) };
}

function parts(html) {
  const data = /<script id="csf-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  const app = /<script>([\s\S]*?)<\/script>\s*<\/body>/.exec(html);
  assert.ok(data && app, 'data block and application script present');
  return { json: data[1], script: app[1] };
}

/* --------------------------- minimal DOM stand-in -------------------------- */

class FakeNode {
  constructor(tagName, text = '') {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.classList = { add() {}, remove() {} };
    this.value = ''; // what an <input>/<select> starts with
    this.ownText = text;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, handler) {
    (this.listeners[type] ??= []).push(handler);
  }

  dispatch(type) {
    for (const handler of this.listeners[type] ?? []) handler({ preventDefault() {} });
  }

  click() {
    this.dispatch('click');
  }

  getBoundingClientRect() {
    return { left: 0, top: 0 };
  }

  get textContent() {
    return this.ownText + this.children.map((c) => c.textContent).join('');
  }

  set textContent(value) {
    this.children = [];
    this.ownText = String(value);
  }

  /** Every descendant (depth-first) matching the predicate. */
  findAll(predicate, found = []) {
    for (const child of this.children) {
      if (predicate(child)) found.push(child);
      child.findAll(predicate, found);
    }
    return found;
  }
}

/** Run the dashboard's script and return the rendered tree plus helpers. */
function runDashboard(html) {
  const { json, script } = parts(html);
  const app = new FakeNode('div');
  const dataNode = new FakeNode('script', json);
  const document = {
    documentElement: new FakeNode('html'),
    getElementById: (id) => (id === 'csf-data' ? dataNode : id === 'app' ? app : null),
    createElement: (tag) => new FakeNode(tag),
    createElementNS: (_ns, tag) => new FakeNode(tag),
    createTextNode: (text) => new FakeNode('#text', String(text)),
  };
  const getComputedStyle = () => ({ getPropertyValue: () => '#000000' });
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  // The script only reaches for these three globals.
  new Function('document', 'getComputedStyle', 'localStorage', script)(document, getComputedStyle, storage);

  const byClass = (name) => app.findAll((n) => String(n.className ?? '').split(' ').includes(name));
  const search = app.findAll((n) => n.tagName === 'input')[0];
  return {
    app,
    byClass,
    rowIds: () => byClass('mrow').map((row) => row.findAll((n) => n.tagName === 'strong')[0].textContent),
    count: () => byClass('count')[0].textContent,
    searchFor(query) {
      search.value = query;
      search.dispatch('input');
    },
  };
}

/* ---------------------------------- tests --------------------------------- */

test('dashboard: without crosswalk extras the embedded data is exactly what it was', () => {
  const p = profile();
  const base = renderDashboardHtml(p, null);
  assert.equal(renderDashboardHtml(p, null, {}), base);
  assert.equal(renderDashboardHtml(p, null, undefined), base);
  assert.equal(renderDashboardHtml(p, null, null), base);
  // It reads only its own key from extras.
  assert.equal(renderDashboardHtml(p, null, { somethingElse: { a: 1 } }), base);
  assert.deepEqual(Object.keys(JSON.parse(parts(base).json)), ['profile', 'target', 'planOrder', 'functionOrder']);

  const page = runDashboard(base);
  assert.equal(page.count(), '4 of 4');
  assert.ok(!page.app.textContent.includes('Related references'), 'no crosswalk block without crosswalk data');
});

test('dashboard: the crosswalk payload is compact, embedded once, and escaped like the rest', () => {
  const p = profile();
  const x = extras(p);
  x.crosswalk.crosswalks[0].map['GV.OC-01'].push('</script><script>alert(1)</script>');
  const html = renderDashboardHtml(p, null, x);
  const { json, script } = parts(html);

  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.ok(json.includes('\\u003c/script>\\u003cscript>alert(1)'));
  const data = JSON.parse(json);
  assert.deepEqual(Object.keys(data), ['profile', 'target', 'planOrder', 'functionOrder', 'crosswalk']);
  assert.deepEqual(Object.keys(data.crosswalk), ['source', 'retrievedAt', 'crosswalks']);
  assert.equal(data.crosswalk.source, 'Test source');
  assert.equal(data.crosswalk.retrievedAt, '2026-11-13');
  const keys = ['id', 'framework', 'thirdParty', 'map', 'categories', 'functions'];
  assert.deepEqual(data.crosswalk.crosswalks.map((c) => Object.keys(c)), [keys, keys]);
  assert.deepEqual(data.crosswalk.crosswalks[0].categories, { 'PR.AA': ['AC-03', 'IR-09'] });
  assert.deepEqual(data.crosswalk.crosswalks[0].functions, { GV: ['FN-1'] });
  assert.deepEqual(data.crosswalk.crosswalks[1], {
    id: 'beta', framework: 'Beta Standard 2022', thirdParty: true,
    map: { 'PR.AA-05': ['Clause: 4.2(a)'] }, categories: {}, functions: {},
  });
  // Identifiers only: nothing but ids, labels and the provenance of the data.
  assert.ok(!json.includes('https://'), 'no link is embedded in the dashboard');

  // Still a self-contained page that follows the file's rules.
  assert.ok(!/\.innerHTML\s*=/.test(html));
  assert.ok(!/\bsrc\s*=\s*["']https?:/.test(html));
  assert.ok(!/\bhref\s*=\s*["']https?:/.test(html));
  assert.ok(!script.includes('`'), 'no template literals in the embedded script');
  assert.doesNotThrow(() => new Function(script));
});

test('dashboard: each outcome lists its related references, with the caveat and the third-party label', () => {
  const p = profile();
  const page = runDashboard(renderDashboardHtml(p, null, extras(p)));
  const details = page.byClass('det');
  assert.equal(details.length, 4);

  const text = (id) => details[p.subcategories.findIndex((e) => e.subcategory_id === id)].textContent;
  for (const id of ['GV.OC-01', 'GV.OC-02', 'PR.AA-01', 'PR.AA-05']) {
    assert.ok(text(id).includes('Related references (informative)'), id);
    assert.ok(text(id).includes('Related is not equivalent'), id);
    assert.ok(text(id).includes('not a determination of conformance'), id);
  }
  assert.ok(text('GV.OC-01').includes('Alpha Controls v1: AC-02, AC-10'));
  assert.ok(!text('GV.OC-01').includes('Beta Standard 2022'));
  assert.ok(text('PR.AA-05').includes('Alpha Controls v1: AC-03'));
  assert.ok(text('PR.AA-05').includes('Beta Standard 2022 (third-party mapping): Clause: 4.2(a)'));
  // An outcome no selected mapping relates to directly says so instead of showing nothing.
  const NONE = '(none recorded for this outcome itself in the selected mappings)';
  assert.ok(text('GV.OC-02').includes(NONE));
  assert.ok(!text('GV.OC-01').includes(NONE));

  // References related to the outcome's whole Category or Function come after
  // its own, on one labeled line that says they are not about this outcome alone.
  const WHOLE = 'Related to its whole Category or Function, not to this outcome alone: ';
  assert.ok(text('PR.AA-01').includes(`${WHOLE}Alpha Controls v1 — Category PR.AA: AC-03, IR-09`));
  assert.ok(text('PR.AA-05').includes(`${WHOLE}Alpha Controls v1 — Category PR.AA: AC-03, IR-09`));
  assert.ok(text('GV.OC-01').includes(`${WHOLE}Alpha Controls v1 — Function GV: FN-1`));
  assert.ok(text('GV.OC-02').includes(`${WHOLE}Alpha Controls v1 — Function GV: FN-1`));
  for (const id of ['GV.OC-01', 'GV.OC-02', 'PR.AA-01', 'PR.AA-05']) {
    assert.equal(text(id).split(WHOLE).length - 1, 1, `${id}: exactly one such line`);
    assert.ok(text(id).indexOf(WHOLE) > text(id).indexOf('Related references (informative)'));
  }
  // IR-09 is not presented as a reference of PR.AA-01 itself.
  assert.ok(!text('PR.AA-01').split(WHOLE)[0].includes('IR-09'));

  // The footer states where the mappings come from (as the data file says),
  // what is and is not shown, and how search treats identifiers.
  const footer = page.byClass('foot')[0].textContent;
  assert.ok(footer.includes('Related references: identifiers only, as each selected mapping records them for a Subcategory, a whole Category or a whole Function.'));
  assert.ok(footer.includes('Mapping source: Test source (retrieved 2026-11-13).'));
  assert.ok(footer.includes('A mapping records a relationship, not equivalence or conformance.'));
  assert.ok(footer.includes('Search also matches these identifiers, as plain text'));
});

test('dashboard: searching a reference identifier finds the outcomes related to it', () => {
  const p = profile();
  const page = runDashboard(renderDashboardHtml(p, null, extras(p)));
  assert.equal(page.count(), '4 of 4');

  page.searchFor('AC-02');
  assert.deepEqual(page.rowIds(), ['GV.OC-01', 'PR.AA-01']);
  assert.equal(page.count(), '2 of 4');

  page.searchFor('clause: 4.2(a)'); // case-insensitive, like the rest of the search
  assert.deepEqual(page.rowIds(), ['PR.AA-05']);

  // It is the explorer's ordinary text search: "AC-1" also finds AC-10.
  page.searchFor('AC-1');
  assert.deepEqual(page.rowIds(), ['GV.OC-01']);

  // A reference related only to a whole Category or Function finds every outcome under it.
  page.searchFor('IR-09');
  assert.deepEqual(page.rowIds(), ['PR.AA-01', 'PR.AA-05']);
  page.searchFor('FN-1');
  assert.deepEqual(page.rowIds(), ['GV.OC-01', 'GV.OC-02']);

  page.searchFor('AC-99');
  assert.deepEqual(page.rowIds(), []);

  page.searchFor('');
  assert.equal(page.count(), '4 of 4');
});
