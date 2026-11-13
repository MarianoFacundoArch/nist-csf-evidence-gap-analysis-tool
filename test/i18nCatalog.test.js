/**
 * The message catalogs and the translator.
 *
 * Three things are checked here, and none of them by reading a rendered report:
 *  - the catalogs agree with each other: the same keys, the same placeholders,
 *    and Spanish text that is actually Spanish and follows the wording rules;
 *  - the code and the catalogs agree: every key the renderers use exists, every
 *    key that exists is used, so a mistyped key fails here and not in a
 *    deliverable;
 *  - the catalog agrees with the rest of the tool about the English sentences
 *    other modules write into the data (`fixed.*`). A report in another
 *    language recognizes those sentences character for character; if one is
 *    reworded at its source, the test that names it fails.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  createTranslator,
  messageCatalog,
  placeholdersOf,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
} from '../src/i18n/index.js';
import { createReportLocale, ENGLISH } from '../src/i18n/locale.js';
import { configSchema } from '../src/core/config.schema.js';
import { buildProfile } from '../src/report/profile.js';
import { buildAnalysisStage } from '../src/status/assessmentStatus.js';
import { CSF_TIERS, TIER_BASIS, TIER_SOURCE, tierLabel, tierSentence, resolveTiers } from '../src/target/tiers.js';
import { NO_EVIDENCE_ANSWER } from '../src/engine/ask.js';
import { assessSubcategory } from '../src/engine/mapping.js';
import { verifyAndDowngrade } from '../src/engine/verifier.js';
import { EVIDENCE_QUESTIONS } from '../src/report/evidenceRequestsMarkdown.js';
import { COVERAGE_LEVELS } from '../src/engine/coverage.js';
import { PRIORITY_LEVELS, PLAN_STATUSES } from '../src/target/target.schema.js';
import { readJsonSafe } from '../src/util/fsx.js';

const en = messageCatalog('en');
const es = messageCatalog('es');
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

// Spanish values that are legitimately the same as the English ones: a
// technical term the tool keeps (`embeddings` is also the configuration key),
// and two column headings that are the same word in both languages.
const SAME_IN_BOTH = ['dashboard.providers.embeddings', 'dashboard.col.total', 'dashboard.col.id'];

/* ------------------------------ catalog parity ----------------------------- */

test('both catalogs have exactly the same keys', () => {
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  assert.deepEqual(SUPPORTED_LANGUAGES, ['en', 'es']);
  assert.equal(DEFAULT_LANGUAGE, 'en');
  assert.equal(messageCatalog('fr'), null);
  // An unusual language code never reaches something inherited from Object.prototype.
  assert.equal(messageCatalog('constructor'), null);
});

test('every key is a dotted name and every value a single trimmed line of text', () => {
  for (const [language, catalog] of [['en', en], ['es', es]]) {
    for (const [key, value] of Object.entries(catalog)) {
      assert.match(key, /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/, `${language}: key "${key}"`);
      assert.equal(typeof value, 'string', `${language}: ${key}`);
      assert.ok(value.length > 0, `${language}: ${key} is empty`);
      assert.equal(value, value.trim(), `${language}: ${key} has surrounding whitespace`);
      assert.ok(!/[\r\n\t]/.test(value), `${language}: ${key} contains a line break or a tab`);
      assert.ok(!/ {2,}/.test(value), `${language}: ${key} contains a run of spaces`);
    }
  }
});

test('every key names the same placeholders in both languages', () => {
  for (const key of Object.keys(en)) {
    const expected = [...new Set(placeholdersOf(en[key]))].sort();
    const actual = [...new Set(placeholdersOf(es[key]))].sort();
    assert.deepEqual(actual, expected, `placeholders of "${key}" differ between en and es`);
  }
});

test('no catalog value contains a brace that is not part of a placeholder', () => {
  for (const [language, catalog] of [['en', en], ['es', es]]) {
    for (const [key, value] of Object.entries(catalog)) {
      const withoutPlaceholders = value.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, '');
      assert.ok(!/[{}]/.test(withoutPlaceholders), `${language}: stray brace in "${key}": ${value}`);
    }
  }
});

test('no Spanish value is left identical to English, except the listed ones', () => {
  const identical = Object.keys(en).filter((key) => es[key] === en[key]);
  assert.deepEqual(identical.sort(), [...SAME_IN_BOTH].sort());
});

test('a message with a singular form has a plural form, and the reverse', () => {
  for (const key of Object.keys(en)) {
    if (key.endsWith('.one')) assert.ok(Object.hasOwn(en, `${key.slice(0, -4)}.other`), `${key} has no .other form`);
    if (key.endsWith('.other')) assert.ok(Object.hasOwn(en, `${key.slice(0, -6)}.one`), `${key} has no .one form`);
  }
});

test('table header rows have the same number of cells in both languages', () => {
  const headers = Object.keys(en).filter((key) => en[key].startsWith('| '));
  assert.ok(headers.length >= 6);
  for (const key of headers) {
    const cells = (row) => row.split('|').length;
    assert.ok(es[key].startsWith('| ') && es[key].endsWith(' |'), `${key} is not a table row in es`);
    assert.equal(cells(es[key]), cells(en[key]), `${key}: different number of cells`);
  }
});

test('inline emphasis is kept: a value is bold or italic in Spanish where it is in English', () => {
  const count = (text, mark) => text.split(mark).length - 1;
  for (const key of Object.keys(en)) {
    assert.equal(count(es[key], '**'), count(en[key], '**'), `${key}: bold markers differ`);
    assert.equal(es[key].startsWith('_') && es[key].endsWith('_'), en[key].startsWith('_') && en[key].endsWith('_'), `${key}: italics differ`);
    // File names and configuration keys are what the reader will look for: they are never translated.
    for (const literal of en[key].match(/[a-z-]+\.(?:md|json|csv)\b|retrieval\.topK/g) ?? []) {
      assert.ok(es[key].includes(literal), `${key}: "${literal}" is missing from the Spanish text`);
    }
  }
});

test('Spanish wording rules: NIST terms, no exclamation marks, no leftover English vocabulary', () => {
  for (const [key, value] of Object.entries(es)) {
    // NIST CSWP 29 spa says "seguridad cibernética".
    assert.ok(!/ciberseguridad/i.test(value), `${key}: use "seguridad cibernética"`);
    assert.ok(!/[!¡]/.test(value), `${key}: no exclamation marks`);
    // The tool's English vocabulary must not survive inside a Spanish sentence
    // (placeholder names and file names are not sentences).
    const prose = value.replace(/\{[A-Za-z0-9]+\}/g, '').replace(/[a-z-]+\.(?:md|json|csv)/g, '');
    assert.ok(
      !/\b(unreviewed|stale|reviewed|override|outcomes?|coverage|rationale|evidence|baseline|quotes?|gaps?)\b/i.test(prose),
      `${key}: English vocabulary in "${value}"`,
    );
  }
  // A question is opened as well as closed, as Spanish requires.
  for (const key of ['requests.question.1', 'requests.question.2', 'requests.question.3']) {
    assert.ok(es[key].startsWith('¿') && es[key].endsWith('?'), key);
  }
});

test('the vocabulary covers every value the data files use, and the Tier names are the official ones', () => {
  const t = createTranslator('en');
  for (const level of COVERAGE_LEVELS) {
    assert.equal(t(`coverage.${level}`), level);
    assert.equal(t(`coverage.title.${level}`), level.charAt(0).toUpperCase() + level.slice(1));
    assert.equal(ENGLISH.coverage(level), level);
  }
  for (const level of PRIORITY_LEVELS) assert.equal(ENGLISH.priority(level), level);
  for (const status of ['reviewed', 'unreviewed', 'stale']) assert.equal(ENGLISH.reviewStatus(status), status);
  // Every status target.json accepts has a display form in both languages.
  const spanish = createReportLocale({ language: 'es' });
  for (const status of PLAN_STATUSES) {
    assert.equal(ENGLISH.planStatus(status), status);
    assert.notEqual(spanish.planStatus(status), status, `plan status "${status}" has no Spanish label`);
  }
  for (const { tier, name } of CSF_TIERS) {
    assert.equal(en[`tier.name.${tier}`], name);
    // The Spanish name of NIST CSWP 29 spa, with the official English name beside it.
    assert.ok(es[`tier.name.${tier}`].endsWith(` (${name})`), `tier ${tier}`);
  }
  assert.equal(es['tier.name.2'], 'Informado sobre el Riesgo (Risk Informed)');
});

/* -------------------------------- translator ------------------------------- */

test('t() fills placeholders and inserts values literally', () => {
  const t = createTranslator('en');
  assert.equal(t('common.overview.generated', { date: '2026-01-01' }), 'Generated: 2026-01-01');
  // A value is document text: "$&" and "{x}" are not interpreted.
  assert.equal(t('common.item.outcome', { outcome: 'costs $& {count} more' }), 'Outcome: costs $& {count} more');
  // Extra values are ignored; a number is printed as a number.
  assert.equal(t('common.priorityHeading.high', { count: 3, unused: true }), 'High priority (3)');
  assert.equal(t.language, 'en');
  assert.equal(t.template('common.overview.generated'), 'Generated: {date}');
});

test('t() prints missing DATA the way the renderers always have, but rejects a missing placeholder', () => {
  const t = createTranslator('en');
  // Present but undefined or null: a sparse profile renders as before.
  assert.equal(t('common.item.outcome', { outcome: undefined }), 'Outcome: undefined');
  assert.equal(t('common.item.outcome', { outcome: null }), 'Outcome: null');
  // Not passed at all: a bug in the renderer, never a deliverable.
  assert.throws(() => t('common.item.outcome'), /Message "common\.item\.outcome" needs a value for \{outcome\}/);
  assert.throws(() => t('common.item.outcome', { outcomes: 'x' }), /needs a value for \{outcome\}/);
});

test('an unknown key fails clearly; a language without a catalog falls back to English', () => {
  for (const language of ['en', 'es', 'fr']) {
    assert.throws(() => createTranslator(language)('gap.titel'), /Unknown message key "gap\.titel"/);
    assert.throws(() => createTranslator(language)('toString'), /Unknown message key "toString"/);
  }
  const french = createTranslator('fr');
  assert.equal(french.language, 'fr');
  assert.equal(french('gap.title'), en['gap.title']);
  assert.equal(createTranslator()('gap.title'), en['gap.title']);
  assert.equal(createTranslator('es')('gap.title'), es['gap.title']);
});

test('the configuration accepts exactly the languages that have a catalog', () => {
  assert.deepEqual(configSchema.properties.report.properties.language.enum, SUPPORTED_LANGUAGES);
  // The list (src/i18n/languages.js) and the catalogs (src/i18n/index.js) are kept together here.
  assert.deepEqual(SUPPORTED_LANGUAGES, ['en', 'es']);
  assert.ok(SUPPORTED_LANGUAGES.includes(DEFAULT_LANGUAGE));
  for (const language of SUPPORTED_LANGUAGES) assert.ok(messageCatalog(language), `no catalog for "${language}"`);
  assert.equal(messageCatalog(DEFAULT_LANGUAGE), en);
  for (const other of ['fr', 'EN', '', undefined, null, 'constructor', '__proto__']) assert.equal(messageCatalog(other), null, String(other));
  // The list is read-only: a caller cannot widen what the configuration accepts.
  assert.ok(Object.isFrozen(SUPPORTED_LANGUAGES));
});

/* --------------------------- code <-> catalog keys -------------------------- */

/**
 * Every file under src/ that uses the catalog: the report-locale module itself
 * and whatever imports an i18n module. (Other files are left out on purpose: a
 * configuration path such as 'review.showAll' looks like a message key.)
 */
function catalogUsers(dir = SRC, found = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      catalogUsers(path, found);
    } else if (name.endsWith('.js')) {
      const text = readFileSync(path, 'utf8');
      const isCatalog = /[\\/]i18n[\\/](en|es)\.js$/.test(path);
      const usesCatalog = /[\\/]i18n[\\/]locale\.js$/.test(path) || /from '[./]+\/i18n\/(locale|index)\.js'/.test(text);
      if (!isCatalog && usesCatalog) found.push({ path, text });
    }
  }
  return found;
}

const KEY_GROUPS = [...new Set(Object.keys(en).map((key) => key.split('.')[0]))];
// A quoted, dotted name whose first part is one of the catalog's groups.
const KEY_LITERAL = new RegExp(`'((?:${KEY_GROUPS.join('|')})(?:\\.[A-Za-z0-9]+)+)'`, 'g');

function referencedKeys() {
  const users = catalogUsers();
  assert.ok(users.length >= 8, 'the renderers were not found');
  const literals = new Set();
  for (const { text } of users) for (const match of text.matchAll(KEY_LITERAL)) literals.add(match[1]);
  return literals;
}

test('every message key the code uses exists in the catalog', () => {
  for (const literal of referencedKeys()) {
    // A key, or the stem of a .one/.other pair chosen at run time by a count.
    const known = Object.hasOwn(en, literal) || (Object.hasOwn(en, `${literal}.one`) && Object.hasOwn(en, `${literal}.other`));
    assert.ok(known, `the code uses "${literal}", which is not in src/i18n/en.js`);
  }
});

test('every message in the catalog is used by the code', () => {
  const literals = referencedKeys();
  for (const key of Object.keys(en)) {
    const stem = key.replace(/\.(one|other)$/, '');
    // `fixed.*` and `fixedPrefix.*` are looked up by their English text, not by key.
    const used = literals.has(key) || literals.has(stem) || key.startsWith('fixed.') || key.startsWith('fixedPrefix.');
    assert.ok(used, `"${key}" is in the catalog but nothing uses it`);
  }
});

/* ----------------- sentences other modules write into the data -------------- */

const NOW = '2026-01-01T00:00:00.000Z';
const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' } },
  now: () => NOW,
};
const SUB = {
  id: 'GV.OC-01',
  outcome: 'Mission understood',
  function: 'GOVERN',
  category: 'Organizational Context (GV.OC)',
  functionId: 'GV',
  functionName: 'GOVERN',
  categoryId: 'GV.OC',
  implementationExamples: [],
};
const profileOf = (csf) => buildProfile(CTX, { csf, assessments: {}, reviews: {}, meta: {} });
const CSF = { frameworkVersion: 'CSF 2.0', sample: false, functions: [{ id: 'GV', name: 'GOVERN' }], subcategories: [SUB] };

test('fixed.*: the profile disclaimer, the CSF source lines and the unassessed rationale are the profile\'s own', () => {
  const full = profileOf(CSF);
  const partial = profileOf({ ...CSF, sample: true });
  assert.equal(en['fixed.profile.disclaimer'], full.disclaimer);
  assert.equal(en['fixed.csfSource.full'], full.csfSource);
  assert.equal(en['fixed.csfSource.partial'], partial.csfSource);
  assert.equal(en['fixed.rationale.notAssessed'], full.subcategories[0].rationale);
});

test('fixed.*: the Tier basis and source, and the `ask` sentence, are the exported constants', () => {
  assert.equal(en['fixed.tier.basis'], TIER_BASIS);
  assert.equal(en['fixed.tier.definitions'], TIER_SOURCE);
  assert.equal(en['fixed.ask.noEvidence'], NO_EVIDENCE_ANSWER);
});

test('fixed.*: every reason the status module gives for an outdated analysis has a Spanish wording', () => {
  const stage = (meta, assessments) => buildAnalysisStage({ ids: ['A', 'B'], meta, assessments }).reasons;
  const reasons = [
    ...stage({}, { A: { engine_sig: 'one' }, B: { engine_sig: 'two' } }),
    ...stage({ engine_sig: 'new' }, { A: { engine_sig: 'old' }, B: { engine_sig: 'old' } }),
    ...stage({ index_id: 'i2', analyzed_index_id: 'i1' }, {}),
    ...stage({ ingested_at: '2026-02-01T00:00:00.000Z', analyzed_at: '2026-01-01T00:00:00.000Z' }, {}),
  ];
  assert.deepEqual(reasons, [
    en['fixed.analysis.mixedSignatures'],
    en['fixed.analysis.signatureDiffers'],
    en['fixed.analysis.indexChanged'],
    en['fixed.analysis.ingestNewer'],
  ]);
  const spanish = createReportLocale({ language: 'es' });
  for (const reason of reasons) {
    assert.notEqual(spanish.fixed(reason), reason, `no Spanish wording for the reason "${reason}"`);
    assert.equal(ENGLISH.fixed(reason), reason);
  }
});

test('fixed.*: the fallback rationales are the mapping engine\'s, the downgrade note is the verifier\'s', async () => {
  const embedder = { id: 'test', dim: 2, embed: async (texts) => texts.map(() => [1, 0]) };
  const chunk = { id: 'policy.md#c0', source_file: 'policy.md', page: null, text: 'The mission statement is reviewed yearly.' };
  const config = { retrieval: { topK: 3 }, analysis: { confidenceThreshold: 0.6, critique: false } };
  const run = (index, llm) => assessSubcategory({ sub: SUB, index, embedder, llm, config, engineSig: 'sig', now: NOW });
  // An index as loadIndex() returns it: the chunks plus their vectors.
  const index = (chunks) => ({ dim: 2, embedder_id: 'test', chunks, vectors: chunks.map(() => Float32Array.from([1, 0])) });

  const noEvidence = await run(index([]), { id: 'never-called', judge: async () => '' });
  assert.equal(noEvidence.rationale, en['fixed.rationale.noEvidence']);
  const invalid = await run(index([chunk]), { id: 'garbage', judge: async () => 'not json' });
  assert.equal(invalid.rationale, en['fixed.rationale.invalidOutput']);
  for (const rationale of [noEvidence.rationale, invalid.rationale]) {
    assert.ok(rationale.startsWith(`${en['fixedPrefix.rationale.fallback']} `));
  }

  // A claim whose only quote is not in the evidence: the verifier's note leads the model's rationale.
  const downgraded = verifyAndDowngrade(
    { subcategory_id: SUB.id, coverage: 'full', confidence: 0.9, evidence: [{ source_file: 'policy.md', quote: 'An invented sentence.' }], rationale: 'Model text.', needs_review: false },
    [{ chunk, score: 0.5 }],
  );
  assert.equal(downgraded.rationale, `${en['fixedPrefix.rationale.downgraded']} Model text.`);

  const spanish = createReportLocale({ language: 'es' });
  assert.equal(spanish.fixed(noEvidence.rationale), es['fixed.rationale.noEvidence']);
  // Only the tool's leading sentence is reworded; the model's words are left alone.
  assert.equal(spanish.fixed(downgraded.rationale), `${es['fixedPrefix.rationale.downgraded']} Model text.`);
  assert.equal(spanish.fixed('Automated fallback: socket hang up'), `${es['fixedPrefix.rationale.fallback']} socket hang up`);
  assert.equal(spanish.fixed('The evidence shows a dated review.'), 'The evidence shows a dated review.');
  for (const notText of [undefined, null, 42]) assert.equal(spanish.fixed(notText), notText);
  // English is the identity, whatever it is given.
  for (const text of [downgraded.rationale, noEvidence.rationale, 'anything', undefined]) assert.equal(ENGLISH.fixed(text), text);
});

test('the three evidence questions are the catalog\'s English, in order', () => {
  assert.deepEqual(EVIDENCE_QUESTIONS, [en['requests.question.1'], en['requests.question.2'], en['requests.question.3']]);
});

test('the English locale words a Tier selection exactly as src/target/tiers.js does', () => {
  const selections = [
    { current: 2, target: 3 },
    { current: 4 },
    { target: 1 },
    { current: 1, target: 4, note: 'Committee decision.' },
    { current: 3, target: 3 },
  ];
  for (const selection of selections) {
    const resolved = resolveTiers(selection);
    assert.equal(ENGLISH.tierSentence(resolved), tierSentence(resolved), JSON.stringify(selection));
  }
  for (const tier of [1, 2, 3, 4, null, undefined, 0, 5, 2.5, NaN, '2', [2], true, {}]) {
    assert.equal(ENGLISH.tierLabel(tier), tierLabel(tier), JSON.stringify(tier));
  }

  const spanish = createReportLocale({ language: 'es' });
  assert.equal(spanish.tierLabel(2), 'Nivel 2 — Informado sobre el Riesgo (Risk Informed)');
  assert.equal(spanish.tierLabel(null), es['tier.notRecorded']);
  const sentence = spanish.tierSentence(resolveTiers({ current: 2 }));
  assert.ok(sentence.includes(es['fixed.tier.basis']) && sentence.includes(es['fixed.tier.definitions']));
  assert.ok(!sentence.includes('Selected by the organization'));
});

test('the Spanish framework-text note cites the publication the translation data comes from', async () => {
  const data = await readJsonSafe('data/csf-core.es.json');
  const note = es['note.frameworkText'];
  const doi = /https:\/\/doi\.org\/\S+?(?=[),]|$)/.exec(data.source)[0];
  assert.equal(doi, 'https://doi.org/10.6028/NIST.CSWP.29.spa');
  assert.ok(note.includes(doi), 'the note must carry the DOI of the publication');
  assert.ok(note.includes('NIST CSWP 29 spa') && data.source.includes('NIST CSWP 29 spa'));
  assert.match(note, /cortesía del Instituto Nacional de Estándares y Tecnología \(NIST\)/);
  assert.match(note, /texto original en inglés/);
});
