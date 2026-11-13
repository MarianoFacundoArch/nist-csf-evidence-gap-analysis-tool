/**
 * Report language: the dashboard.
 *
 * The dashboard's script exists in two forms generated from one template (see
 * src/report/htmlDashboard.js): the English form, with its text inline exactly
 * as before the dashboard could be translated, and the localized form, which
 * reads its text from the embedded JSON. These tests hold the two together:
 *  - an English page gains nothing: no `i18n` data, no lookup code, and the
 *    same bytes whether or not the English locale is passed;
 *  - the localized form, given ENGLISH text, builds the same page as the
 *    English form — text, labels and tooltips, before and after every control
 *    is used. That is what proves the catalog's English and the inline English
 *    are the same, and that the localized form left nothing out;
 *  - a Spanish page is Spanish everywhere the tool speaks, NIST's translation
 *    where the framework speaks, and English only where it should be.
 *
 * Like dashboardRuntime.test.js, the script is executed against a minimal
 * stand-in for the DOM that has no HTML parser: text can only arrive as text.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildProfile } from '../src/report/profile.js';
import { buildTargetView, validateTargetSpec } from '../src/target/targetProfile.js';
import { buildDocumentView } from '../src/report/documentView.js';
import { buildCrosswalkView, crosswalkDashboardData } from '../src/crosswalk/view.js';
import { renderDashboardHtml } from '../src/report/htmlDashboard.js';
import { hashAssessment } from '../src/util/hash.js';
import { messageCatalog } from '../src/i18n/index.js';
import { createReportLocale, loadReportLocale, ENGLISH } from '../src/i18n/locale.js';
import { loadCsfText } from '../src/csf/localized.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/i18n/', import.meta.url));
const INPUTS = JSON.parse(readFileSync(join(FIXTURES, 'scenarios.json'), 'utf8'));
const SCENARIOS = Object.keys(INPUTS.scenarios);
const en = messageCatalog('en');
const es = messageCatalog('es');
const spanish = await loadReportLocale('es');
const csfText = await loadCsfText('es');
// A language the tool has no catalog for: the localized form of the script,
// fed with the English text of the catalog.
const lookupEnglish = createReportLocale({ language: 'xx' });

/* -------------------------------- scenarios -------------------------------- */

const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' } },
  now: () => INPUTS.now,
};

/** The dashboard's inputs for one scenario of scenarios.json, as the report stage builds them. */
function dashboardInputs(name) {
  const raw = INPUTS.scenarios[name];
  const scenario = structuredClone(raw.extends ? { ...INPUTS.scenarios[raw.extends], ...raw } : raw);
  const csf = { ...structuredClone(INPUTS.csf), sample: scenario.sample === true };
  csf.subcategories = csf.subcategories.map((sub) => ({
    ...sub,
    functionId: sub.id.split('.')[0],
    categoryId: sub.id.split('-')[0],
    functionName: sub.function,
  }));
  for (const [id, review] of Object.entries(scenario.reviews)) {
    const assessment = scenario.assessments[id];
    if (review.reviewed_against === '@current') review.reviewed_against = hashAssessment(assessment);
    review.final_coverage ??= assessment.coverage;
  }
  const profile = buildProfile(CTX, { csf, assessments: scenario.assessments, reviews: scenario.reviews, meta: scenario.meta });
  // Pinned so the pages do not change with every release.
  profile.tool = { name: 'csf-tool', version: 'test' };
  const targetView = scenario.target ? buildTargetView(profile, validateTargetSpec(scenario.target), csf) : null;
  const extras = { documentView: buildDocumentView(profile, { assessments: scenario.assessments, meta: scenario.meta }) };
  if (scenario.crosswalks) {
    extras.crosswalk = crosswalkDashboardData(buildCrosswalkView(profile, structuredClone(INPUTS.crosswalks)));
  }
  return { profile, targetView, extras };
}

function renderPage(name, locale) {
  const { profile, targetView, extras } = dashboardInputs(name);
  return renderDashboardHtml(profile, targetView, locale ? { ...extras, locale } : extras);
}

const dataOf = (html) => JSON.parse(/<script id="csf-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>([\s\S]*?)<\/script>\s*<\/body>/.exec(html)[1];

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
  const app = new FakeNode('div');
  const byId = { 'csf-data': { textContent: /<script id="csf-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1] }, app };
  const document = {
    documentElement: new FakeNode('html'),
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
  new Function('document', 'localStorage', 'getComputedStyle', scriptOf(html))(document, localStorage, getComputedStyle);
  return app;
}

function all(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const child of node.children) all(child, predicate, found);
  return found;
}

/** Everything a person can read or a screen reader can say: text nodes and text-bearing attributes, in order. */
function visibleText(root) {
  const lines = [];
  (function walk(node) {
    if (node.text) lines.push(`${node.tagName}: ${node.text}`);
    for (const name of ['aria-label', 'title']) if (node.attributes[name] != null) lines.push(`${node.tagName}@${name}: ${node.attributes[name]}`);
    if (node.placeholder) lines.push(`${node.tagName}@placeholder: ${node.placeholder}`);
    node.children.forEach(walk);
  })(root);
  return lines;
}

const tooltips = (root) => all(root, (n) => n.attributes.class === 'row-hit').forEach((hit) => hit.dispatch('focus'));

/** Use every control once: the theme, each chart's table view, the document list, every explorer row. */
function useEveryControl(root) {
  for (const button of all(root, (n) => n.tagName === 'button' && n.className === 'ghost')) button.click();
  tooltips(root);
  for (const row of all(root, (n) => n.className === 'mrow')) row.click();
}

const headings = (root) => all(root, (n) => n.tagName === 'h2').map((n) => n.textContent);
const explorerIds = (root) => all(root, (n) => n.className === 'mrow').map((row) => row.children[1].textContent);
const control = (root, tag, label) => all(root, (n) => n.tagName === tag && n.attributes['aria-label'] === label)[0];

/* ------------------------- the English page is untouched ---------------------- */

test('an English dashboard carries no localization: no data, no lookup code, no markers', () => {
  for (const name of SCENARIOS) {
    const html = renderPage(name);
    const script = scriptOf(html);
    assert.match(html, /^<!doctype html>\n<html lang="en">\n/);
    assert.ok(html.includes('<title>NIST CSF 2.0 — Assessment Dashboard</title>'));
    assert.ok(!Object.hasOwn(dataOf(html), 'i18n'), name);
    for (const trace of ['L10N', '/*END*/', 'I18N', 'tx(', 'txCount(', 'txFixed(']) {
      assert.ok(!script.includes(trace), `${name}: "${trace}" in the English script`);
    }
    // The text is where it always was: inline.
    assert.ok(script.includes("'NIST CSF 2.0 — Assessment Dashboard'"));
    assert.ok(script.includes("'Search outcomes, rationale, notes, sources, quotes…'"));
  }
});

test('passing the English locale gives the same page, byte for byte, as passing none', () => {
  for (const name of SCENARIOS) {
    const plain = renderPage(name);
    assert.equal(renderPage(name, ENGLISH), plain, name);
    assert.equal(renderPage(name, createReportLocale({ language: 'en' })), plain, name);
  }
  // The v0.3.0 call shapes too: no extras at all.
  const { profile, targetView, extras } = dashboardInputs('rich');
  assert.equal(renderDashboardHtml(profile, targetView, { locale: ENGLISH }), renderDashboardHtml(profile, targetView));
  assert.equal(renderDashboardHtml(profile, null, { locale: ENGLISH }), renderDashboardHtml(profile, null));
  // `extras` had no `locale` before: a value there that is not a locale is no language at all.
  for (const stray of [null, undefined, 'es', 7, {}, { language: 'es' }, { t: 'es', fixed: null }]) {
    assert.equal(renderDashboardHtml(profile, targetView, { ...extras, locale: stray }), renderPage('rich'), JSON.stringify(stray));
  }
  assert.equal(renderDashboardHtml(profile, targetView, null), renderDashboardHtml(profile, targetView));
});

/* ----------------------------- the localized form ----------------------------- */

test('the localized script is plain ES5 text like the English one: no template literal, no marker left', () => {
  const english = scriptOf(renderPage('rich'));
  const localized = scriptOf(renderPage('rich', spanish));
  for (const [form, script] of [['English', english], ['localized', localized]]) {
    assert.ok(!script.includes('`') && !script.includes('${'), `${form}: template literal`);
    assert.ok(!/\/\*L10N|\/\*END\*\//.test(script), `${form}: a marker was left in`);
    assert.ok(!/\.innerHTML\s*=/.test(script), `${form}: innerHTML`);
    assert.doesNotThrow(() => new Function(script), form);
  }
  assert.ok(localized.includes('function tx(key, params){'));
  // The script is the same for every language: only the embedded data differs.
  assert.equal(scriptOf(renderPage('rich', lookupEnglish)), localized);
  // No English sentence of the page is left in it.
  for (const key of Object.keys(en).filter((k) => k.startsWith('dashboard.') && en[k].length >= 12 && !en[k].includes('{'))) {
    assert.ok(!localized.includes(en[key]), `the localized script still contains the English text of ${key}`);
  }
});

test('every message the localized script looks up is embedded, and every dashboard message is used', () => {
  const html = renderPage('rich', spanish);
  const script = scriptOf(html);
  const { strings } = dataOf(html).i18n;

  // Quoted names that are message keys: direct lookups, and the names chosen inside a lookup.
  const literals = new Set([...script.matchAll(/'((?:dashboard|coverage|review|priority|tier|common|crosswalk)(?:\.[A-Za-z0-9]+)+)'/g)].map((m) => m[1]));
  assert.ok(literals.size > 120);
  for (const literal of literals) {
    const embedded = Object.hasOwn(strings, literal) || (Object.hasOwn(strings, `${literal}.one`) && Object.hasOwn(strings, `${literal}.other`));
    assert.ok(embedded, `the script looks up "${literal}", which the page does not embed`);
  }
  // The static part of the page uses these two; the script uses all the others.
  const staticKeys = ['dashboard.title', 'dashboard.noscript'];
  for (const key of Object.keys(en).filter((k) => k.startsWith('dashboard.'))) {
    const used = literals.has(key) || literals.has(key.replace(/\.(one|other)$/, '')) || staticKeys.includes(key);
    assert.ok(used, `"${key}" is embedded but nothing looks it up`);
    assert.equal(strings[key], es[key], key);
  }
});

test('the localized form, given English text, builds exactly the page the English form builds', () => {
  for (const name of SCENARIOS) {
    const plain = runDashboard(renderPage(name));
    const html = renderPage(name, lookupEnglish);
    const looked = runDashboard(html);
    // The two notes exist only on a page in another language.
    const { frameworkNote, examplesNote } = dataOf(html).i18n;
    const comparable = (root) => visibleText(root).filter((line) => !line.endsWith(`: ${frameworkNote}`) && !line.endsWith(`: ${examplesNote}`));

    tooltips(plain);
    tooltips(looked);
    assert.deepEqual(comparable(looked), visibleText(plain), `${name}: as first shown`);
    // Table views, the expanded document list, a chosen theme, every row open...
    useEveryControl(plain);
    useEveryControl(looked);
    assert.deepEqual(comparable(looked), visibleText(plain), `${name}: after every control was used`);
    // ...and back again.
    useEveryControl(plain);
    useEveryControl(looked);
    assert.deepEqual(comparable(looked), visibleText(plain), `${name}: after every control was used twice`);
    assert.ok(visibleText(plain).length > 150, name);
  }
});

/* -------------------------------- a Spanish page ------------------------------ */

test('a Spanish page: language, title and <noscript> in Spanish, and the same data plus one `i18n` key', () => {
  for (const name of SCENARIOS) {
    const english = renderPage(name);
    const html = renderPage(name, spanish);
    assert.match(html, /^<!doctype html>\n<html lang="es">\n/);
    assert.ok(html.includes(`<title>${es['dashboard.title']}</title>`));
    assert.ok(html.includes(
      '<noscript><p style="padding:24px">Este panel necesita JavaScript. Los mismos datos están en ' +
        '<code>current-profile.json</code>, <code>gap-analysis.md</code> y <code>evidence-map.csv</code>, junto a este archivo.</p></noscript>',
    ));
    // Still one self-contained document with no external fetch.
    assert.match(html, /<\/html>\s*$/);
    assert.ok(!/\bsrc\s*=\s*["']https?:/.test(html) && !/\bhref\s*=\s*["']https?:/.test(html) && !/@import|url\(/.test(html));

    const { i18n, ...data } = dataOf(html);
    assert.deepEqual(data, dataOf(english), `${name}: the data must not depend on the language`);
    assert.equal(i18n.language, 'es');
    assert.equal(i18n.examplesNote, es['note.examplesEnglish']);
    assert.ok(i18n.frameworkNote.startsWith(`${es['note.frameworkText.label']}. `));
    // The profile inside the page keeps its English text: it is the same object as current-profile.json.
    assert.equal(data.profile.disclaimer, en['fixed.profile.disclaimer']);
    assert.equal(i18n.fixed[en['fixed.profile.disclaimer']], es['fixed.profile.disclaimer']);
  }
});

test('a Spanish page embeds the framework text of NIST\'s translation, and nothing for an identifier it lacks', () => {
  const { i18n } = dataOf(renderPage('rich', spanish));
  assert.deepEqual(i18n.csf.functions, {
    GOVERN: csfText.functionName('GV'),
    IDENTIFY: csfText.functionName('ID'),
    PROTECT: csfText.functionName('PR'),
    DETECT: csfText.functionName('DE'),
    RECOVER: csfText.functionName('RC'),
  });
  assert.equal(i18n.csf.functions.RECOVER, 'RECUPERACIÓN');
  // Outcomes and Category labels are embedded per Subcategory, resolved as the Markdown reports resolve them.
  for (const sub of INPUTS.csf.subcategories.filter((s) => s.id !== 'ZZ.CU-01')) {
    const categoryId = sub.id.split('-')[0];
    assert.equal(i18n.csf.outcomes[sub.id], csfText.outcome(sub.id), sub.id);
    assert.equal(i18n.csf.categories[sub.id], `${csfText.categoryName(categoryId)} (${categoryId})`, sub.id);
  }
  assert.equal(i18n.csf.categories['GV.OC-01'], 'Contexto organizativo (GV.OC)');
  for (const map of [i18n.csf.outcomes, i18n.csf.categories]) assert.ok(!Object.keys(map).some((id) => id.startsWith('ZZ')));
  assert.ok(!Object.hasOwn(i18n.csf.functions, 'CUSTOM'));
  assert.ok(i18n.frameworkNote.endsWith(` ${spanish.t('note.frameworkText.partial', { missing: 1, total: 10 })}`));
  // The document view's caveats are worded in Spanish beside the unchanged view.
  assert.equal(i18n.documentNotes.length, 2);
  assert.match(i18n.documentNotes[0], /^2 archivos incorporados comparten el nombre policy\.md: a\/policy\.md, b\/policy\.md\./);

  // Without the translation: no framework text is embedded and the page says why.
  const untranslated = dataOf(renderPage('rich', createReportLocale({ language: 'es', csfText: null }))).i18n;
  assert.deepEqual(untranslated.csf, { functions: {}, categories: {}, outcomes: {} });
  assert.equal(untranslated.frameworkNote, `${es['note.frameworkText.label']}. ${es['note.frameworkText.unavailable']}`);
});

test('a Spanish page gives NIST\'s text only to the elements it translates', () => {
  // A CSF core file can be tailored: an outcome reworded under an official identifier
  // was assessed as reworded, and the page must show it that way too.
  const { profile, targetView, extras } = dashboardInputs('rich');
  const reworded = profile.subcategories.find((e) => e.subcategory_id === 'GV.OC-01');
  reworded.outcome = 'The mission is reviewed by the board every quarter';
  const moved = profile.subcategories.find((e) => e.subcategory_id === 'PR.AA-05');
  moved.category = 'Our Access Rules (PR.AA)';
  for (const e of profile.subcategories.filter((entry) => entry.function === 'DETECT')) e.function = 'WATCH';

  const html = renderDashboardHtml(profile, targetView, { ...extras, locale: spanish });
  const { i18n } = dataOf(html);
  assert.ok(!Object.hasOwn(i18n.csf.outcomes, 'GV.OC-01'));
  assert.equal(i18n.csf.outcomes['GV.OC-02'], csfText.outcome('GV.OC-02'));
  // The other Subcategories of the same Category keep NIST's label; the tailored one keeps its own.
  assert.ok(!Object.hasOwn(i18n.csf.categories, 'PR.AA-05'));
  assert.equal(i18n.csf.categories['PR.AA-01'], `${csfText.categoryName('PR.AA')} (PR.AA)`);
  assert.ok(!Object.hasOwn(i18n.csf.functions, 'WATCH') && !Object.hasOwn(i18n.csf.functions, 'DETECT'));
  assert.ok(i18n.frameworkNote.endsWith(` ${spanish.t('note.frameworkText.partial', { missing: 2, total: 10 })}`));

  const root = runDashboard(html);
  const rows = all(root, (n) => n.className === 'mrow');
  const detail = all(root, (n) => n.className === 'drow')[rows.findIndex((row) => row.children[1].textContent === 'GV.OC-01')];
  assert.equal(all(detail, (n) => n.tagName === 'p')[0].textContent, 'The mission is reviewed by the board every quarter');
  const byFunction = control(root, 'select', es['dashboard.filter.function']);
  assert.ok(byFunction.children.some((option) => option.value === 'WATCH' && option.textContent === 'WATCH'));
});

test('a Spanish page keeps document notes it did not write, and words any priority value', () => {
  const { profile, targetView, extras } = dashboardInputs('rich');
  // The standard caveats of the document view are worded in Spanish...
  assert.equal(dataOf(renderDashboardHtml(profile, targetView, { ...extras, locale: spanish })).i18n.documentNotes.length, 2);
  // ...but notes a caller put there itself are shown as they are, like on an English page.
  const custom = { ...extras, documentView: { ...extras.documentView, notes: ['Checked by hand on 2026-01-05.'] } };
  const html = renderDashboardHtml(profile, targetView, { ...custom, locale: spanish });
  assert.ok(!Object.hasOwn(dataOf(html).i18n, 'documentNotes'));
  assert.ok(visibleText(runDashboard(html)).includes(`p: ${spanish.t('dashboard.docs.note', { note: 'Checked by hand on 2026-01-05.' })}`));

  // A priority outside the three levels (target.json cannot hold one, a caller's view can).
  const odd = structuredClone(targetView);
  const first = odd.entries.find((e) => e.subcategory_id === 'GV.OC-02');
  first.priority = 'urgent';
  const plan = (page) => all(runDashboard(page), (n) => n.tagName === 'li' && n.children.some((c) => c.className === 'meta'))
    .map((li) => li.children.find((c) => c.className === 'meta').textContent)
    .find((text) => text.includes('urgent'));
  assert.ok(plan(renderDashboardHtml(profile, odd, extras)).endsWith(' · urgent priority'));
  assert.ok(plan(renderDashboardHtml(profile, odd, { ...extras, locale: lookupEnglish })).endsWith(' · urgent priority'));
  assert.ok(plan(renderDashboardHtml(profile, odd, { ...extras, locale: spanish })).endsWith(' · prioridad urgent'));
});

const ENGLISH_WORDS = new Set(
  ('the and of is are was were not with without this that these those for from each every by at or on to it its ' +
    'their has have been be which who when where only also any all than as but if an in').split(' '),
);
const EXAMPLES = new Set(INPUTS.csf.subcategories.flatMap((sub) => sub.implementationExamples));
const CUSTOM_OUTCOME = INPUTS.csf.subcategories.find((sub) => sub.id === 'ZZ.CU-01').outcome;

/** English function words in what a page shows, outside the text that is English on purpose. */
function englishWords(lines) {
  return lines
    .filter((line) => !EXAMPLES.has(line.replace(/^li: /, '')))
    .map((line) => line.replaceAll(CUSTOM_OUTCOME, ''))
    .flatMap((line) =>
      (line.match(/[\p{L}][\p{L}\p{N}'’-]*/gu) ?? [])
        .filter((word) => word !== word.toUpperCase() && ENGLISH_WORDS.has(word.toLowerCase()))
        .map((word) => `${word} — in "${line}"`),
    );
}

test('a Spanish page runs to completion in every scenario and shows no English of the tool\'s', () => {
  for (const name of SCENARIOS) {
    const root = runDashboard(renderPage(name, spanish));
    tooltips(root);
    assert.deepEqual(englishWords(visibleText(root)), [], `${name}: as first shown`);
    useEveryControl(root);
    assert.deepEqual(englishWords(visibleText(root)), [], `${name}: after every control was used`);
    assert.equal(all(root, (n) => n.tagName === 'footer').length, 1, name);
    assert.equal(explorerIds(root).length, 10, name);
  }
  // The detector does detect: an English page is full of what it looks for.
  assert.ok(englishWords(visibleText(runDashboard(renderPage('rich')))).length > 40);
});

test('a Spanish page: headings, tiles, charts and tables use the catalog and NIST\'s names', () => {
  const root = runDashboard(renderPage('rich', spanish));
  assert.deepEqual(headings(root), [
    es['dashboard.activity.title'],
    es['dashboard.coverage.title'],
    es['dashboard.target.title'],
    es['dashboard.plan.title'],
    es['dashboard.docs.title'],
    es['dashboard.explorer.title'],
  ]);
  assert.equal(all(root, (n) => n.tagName === 'h1')[0].textContent, es['dashboard.title']);

  const tiles = all(root, (n) => n.className === 'tile').map((tile) => tile.children.map((child) => child.textContent));
  assert.deepEqual(tiles.map((tile) => tile[0]), [
    es['dashboard.tile.addressed'], es['dashboard.tile.gaps'], es['dashboard.tile.review'], es['dashboard.tile.overrides'],
    es['dashboard.tile.downgrades'], es['dashboard.tile.target'], es['dashboard.tile.tier'],
  ]);
  assert.deepEqual(tiles[1], ['Brechas de cobertura', '7', 'ninguna 4 · parcial 3']);
  assert.deepEqual(tiles[5], ['Objetivo cumplido', '33%', 'resultados aplicables que cumplen su objetivo: 3 de 9 · fuera de alcance: 1']);
  // The Tier selection: chosen by the organization, named as NIST's Spanish edition names it.
  assert.deepEqual(tiles[6], [
    'Nivel del CSF',
    '2 → 3',
    'Actual: Informado sobre el Riesgo (Risk Informed) → objetivo: Repetible (Repeatable) · seleccionado por la organización; esta herramienta no lo calcula',
  ]);

  // Chart labels and their accessible descriptions.
  const labels = all(root, (n) => n.attributes['aria-label'] != null).map((n) => n.attributes['aria-label']);
  assert.ok(labels.includes('GOBERNAR: ninguna 1, parcial 1, sustancial 1, completa 0, total: 3'));
  assert.ok(labels.includes('PROTEGER: el 0% de los resultados aplicables cumple su objetivo (0 de 2; fuera de alcance: 1)'));
  assert.ok(labels.includes('GOBERNAR: el 33% de los resultados aplicables cumple su objetivo (1 de 3)'));
  assert.ok(labels.includes(es['dashboard.coverage.aria']));

  // The plan list: Spanish values, NIST's outcome text.
  const plan = all(root, (n) => n.tagName === 'li' && n.children.some((c) => c.className === 'meta')).map((li) => li.textContent);
  assert.equal(plan[0], `GV.OC-02 — ninguna → sustancial · prioridad alta${csfText.outcome('GV.OC-02')}`);
  assert.equal(plan.length, 6);

  // Table views.
  useEveryControl(root);
  const tables = all(root, (n) => n.tagName === 'table').map((table) => all(table, (n) => n.tagName === 'tr').map((tr) => tr.children.map((c) => c.textContent)));
  assert.deepEqual(tables[0][0], ['Función', 'Ninguna', 'Parcial', 'Sustancial', 'Completa', 'Total', '% cubierto']);
  assert.deepEqual(tables[0][5], ['RECUPERACIÓN', '1', '0', '0', '0', '1', '0%']);
  assert.deepEqual(tables[0][6], ['CUSTOM', '0', '1', '0', '0', '1', '0%']);
  assert.deepEqual(tables[1][0], ['Función', 'Aplicables', 'Cumplidos', 'No cumplidos', 'Fuera de alcance', '% cumplido']);
  assert.deepEqual(tables[2][0], ['Documento', 'Fragmentos', 'Recuperado para', 'Citado para', 'Citas', 'Cobertura de esos resultados', 'Funciones']);
  assert.deepEqual(tables[2][1], ['policy.md (2 archivos comparten este nombre)', '5', '10', '3', '4', 'ninguna 1 · parcial 1 · completa 1', 'GOBERNAR, PROTEGER, DETECTAR']);
  assert.deepEqual(tables[3][0], ['', 'ID', 'Función', 'Cobertura', 'Confianza', 'Revisión', 'Objetivo', 'Prioridad', 'Evidencia']);
  // The numeric columns are still right-aligned although their headings changed.
  const explorerHead = all(root, (n) => n.tagName === 'table')[3].children[0].children;
  assert.deepEqual(explorerHead.map((th) => th.className), ['', '', '', '', 'n', '', '', '', 'n']);
});

test('a Spanish page: an outcome\'s detail shows NIST\'s Spanish outcome, the English examples and why they are English', () => {
  const root = runDashboard(renderPage('rich', spanish));
  const detail = (id) => {
    const rows = all(root, (n) => n.className === 'mrow');
    const index = rows.findIndex((row) => row.children[1].textContent === id);
    return all(root, (n) => n.className === 'drow')[index];
  };
  const texts = (node, tag) => all(node, (n) => n.tagName === tag).map((n) => n.textContent);

  const pr = detail('PR.AA-01');
  assert.equal(texts(pr, 'p')[0], csfText.outcome('PR.AA-01'));
  assert.deepEqual(texts(pr, 'h4'), [
    'Evidencia verificada (2)',
    es['dashboard.detail.examples'],
    es['dashboard.detail.references'],
  ]);
  // NIST's examples: verbatim English, in order, with the one-line note above them.
  const examples = INPUTS.csf.subcategories.find((sub) => sub.id === 'PR.AA-01').implementationExamples;
  assert.deepEqual(texts(pr, 'li'), examples);
  assert.ok(texts(pr, 'p').includes(es['note.examplesEnglish']));
  assert.ok(texts(pr, 'span').includes('access-standard.pdf, p. 2'));
  assert.ok(texts(pr, 'p').includes('Nota del revisor: Minutes requested.'));

  // An override, worded in Spanish with Spanish values; the reviewer's own note untouched.
  const id = detail('ID.AM-01');
  assert.ok(texts(id, 'p').includes('Corrección del revisor: la IA propuso cobertura "parcial"; el revisor estableció cobertura "sustancial" (reviewer@example.org).'));
  // A reviewer who set the lowest level did not "set nothing": the level is named as a level.
  assert.ok(texts(detail('PR.AA-05'), 'p').includes('Corrección del revisor: la IA propuso cobertura "parcial"; el revisor estableció cobertura "ninguna" (reviewer@example.org).'));
  assert.ok(texts(id, 'p').includes('Nota del revisor: Inventory export reviewed 2025-12-20.'));
  // The verifier's note in front of a rationale is the tool's; the rationale is not.
  assert.ok(texts(detail('GV.OC-02'), 'p').includes(`${es['fixedPrefix.rationale.downgraded']} Rationale text GV.OC-02.`));

  // The element of a custom core: English outcome, since no translation exists for it.
  const custom = detail('ZZ.CU-01');
  assert.equal(texts(custom, 'p')[0], CUSTOM_OUTCOME);
  assert.ok(custom.textContent.includes('Alpha Controls v1 — Categoría ZZ.CU: A-50; Función ZZ: A-60'));
  assert.ok(detail('DE.CM-01').textContent.includes('Beta Standard 2022 (mapeo de terceros): Clause: 4.2(a)'));

  // Footer: the disclaimer in Spanish, then where the Spanish framework text comes from.
  const footer = all(root, (n) => n.tagName === 'footer')[0].children.map((child) => child.textContent);
  assert.equal(footer[0], es['fixed.profile.disclaimer']);
  assert.ok(footer[1].includes('(NIST CSWP 29 spa, https://doi.org/10.6028/NIST.CSWP.29.spa)'));
  assert.equal(footer.at(-1), 'Informe autónomo generado por csf-tool vtest; esta página no necesita ni utiliza acceso a la red.');
});

test('a Spanish page: filters keep working on the data, and search finds Spanish and English text', () => {
  const root = runDashboard(renderPage('rich', spanish));
  const search = control(root, 'input', es['dashboard.search.aria']);
  assert.equal(search.placeholder, es['dashboard.search.placeholder']);
  const find = (text) => {
    search.value = text;
    search.dispatch('input');
    return explorerIds(root);
  };

  // The Function filter shows NIST's Spanish names and filters by the profile's own value.
  const byFunction = control(root, 'select', es['dashboard.filter.function']);
  assert.deepEqual(byFunction.children.map((option) => [option.value, option.textContent]), [
    ['', 'Todas las Funciones'], ['GOVERN', 'GOBERNAR'], ['IDENTIFY', 'IDENTIFICAR'], ['PROTECT', 'PROTEGER'],
    ['DETECT', 'DETECTAR'], ['RECOVER', 'RECUPERACIÓN'], ['CUSTOM', 'CUSTOM'],
  ]);
  byFunction.value = 'GOVERN';
  byFunction.dispatch('input');
  assert.deepEqual(explorerIds(root), ['GV.OC-01', 'GV.OC-02', 'GV.RM-01']);
  byFunction.value = '';
  byFunction.dispatch('input');

  const byCoverage = control(root, 'select', es['dashboard.filter.coverage']);
  assert.deepEqual(byCoverage.children.map((option) => option.textContent), ['Todos los niveles de cobertura', 'Brechas (ninguna + parcial)', 'Ninguna', 'Parcial', 'Sustancial', 'Completa']);
  byCoverage.value = 'full';
  byCoverage.dispatch('input');
  assert.deepEqual(explorerIds(root), ['DE.CM-01']);
  byCoverage.value = '';
  byCoverage.dispatch('input');

  // Quick filters: Spanish labels, the same counts as the English page.
  const quick = all(root, (n) => n.className === 'filter-chip');
  assert.deepEqual(quick.map((b) => b.textContent), ['Requiere atención · 7', 'Brechas de cobertura · 7', 'Revisión pendiente · 4', 'Objetivo no cumplido · 6']);
  assert.deepEqual(
    all(runDashboard(renderPage('rich')), (n) => n.className === 'filter-chip').map((b) => b.textContent.split(' · ')[1]),
    quick.map((b) => b.textContent.split(' · ')[1]),
  );
  quick[2].click();
  assert.deepEqual(explorerIds(root), ['GV.RM-01', 'PR.AA-01', 'PR.AA-06', 'RC.RP-01']);
  quick[2].click();

  // Search: the Spanish outcome and Function name a reader sees, the English original, identifiers, file names.
  assert.deepEqual(find('misión de la organización'), ['GV.OC-01']);
  assert.deepEqual(find('organizational mission'), ['GV.OC-01']);
  assert.deepEqual(find('recuperación'), ['RC.RP-01']);
  assert.deepEqual(find('contexto organizativo'), ['GV.OC-01', 'GV.OC-02']);
  assert.deepEqual(find('asset-procedure.docx'), ['ID.AM-01']);
  assert.deepEqual(find('a-50'), ['ZZ.CU-01']);
  assert.deepEqual(find('rebajado automáticamente'), ['GV.OC-02', 'RC.RP-01']);
  assert.equal(find('').length, 10);
  assert.equal(all(root, (n) => n.className === 'count')[0].textContent, '10 de 10');
});

test('a Spanish page still shows hostile document text as text', () => {
  const { profile, targetView, extras } = dashboardInputs('rich');
  profile.subcategories[0].evidence.push({ source_file: '<img src=x onerror=alert(1)>.md', page: null, score: 0.1, quote: '</script><script>alert(1)</script>', verified: true });
  const html = renderDashboardHtml(profile, targetView, { ...extras, locale: spanish });
  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.ok(html.includes('\\u003c/script>\\u003cscript>alert(1)'));
  const root = runDashboard(html);
  assert.equal(all(root, (n) => n.tagName === 'img').length, 0);
  assert.ok(visibleText(root).includes('#text: “</script><script>alert(1)</script>”'));
});
