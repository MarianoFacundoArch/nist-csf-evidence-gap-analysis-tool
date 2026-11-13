import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJsonSafe } from '../src/util/fsx.js';
import { loadCsfText, TRANSLATED_LANGUAGES } from '../src/csf/localized.js';
import { parseSpanishCore, buildSpanishCore, stripPageFurniture } from '../scripts/build-csf-core-es.js';
import { CsfDataError } from '../src/core/errors.js';

const HEADER = '\fNIST CSWP 29 spa                 El Marco de Seguridad Cibernética (CSF) 2.0 del NIST';

// A miniature of the publication's layout: a table of contents that repeats the
// appendix headings, an appendix introduction, and a Core listing whose items
// wrap across lines and across a page break.
const FIXTURE = [
  'Appendix A. CSF Core .................................16',
  'Appendix B. Niveles del CSF ..........................26',
  'Texto del cuerpo que no pertenece al apéndice.',
  'Appendix A. CSF Core',
  'Este apéndice describe las Funciones, las Categorías y las Subcategorías.',
  ' Gobernar (GV)         Contexto organizativo            GV.OC',
  '',
  'GOBERNAR (GV): Se establecen, comunican y supervisan la estrategia y la',
  'política de gestión de riesgos.',
  '',
  '•   Contexto organizativo (GV.OC): Se comprenden las circunstancias que',
  '    afectan a las decisiones',
  '    o GV.OC-01: Se comprende la misión de la organización y se informa sobre la',
  '',
  '                                  16',
  HEADER,
  'Febrero 26, 2024',
  '',
  '      gestión de riesgos.',
  '    o GV.OC-02: Las partes interesadas son comprendidas',
  '',
  'PROTEGER (PR): Se utilizan medidas de protección',
  '•   Gestión de identidades, autenticación y control de',
  '    acceso (PR.AA): El acceso se limita a los usuarios autorizados',
  '    o PR.AA-01: La organización gestiona las identidades',
  'Appendix B. Niveles del CSF',
  'Nivel 1: Parcial',
].join('\n');

const CORE = {
  frameworkVersion: 'CSF 2.0',
  functions: [{ id: 'GV', name: 'GOVERN' }, { id: 'PR', name: 'PROTECT' }],
  subcategories: [{ id: 'GV.OC-01' }, { id: 'GV.OC-02' }, { id: 'PR.AA-01' }],
};

test('parseSpanishCore reads the Appendix A listing and rejoins wrapped and page-split items', () => {
  const parsed = parseSpanishCore(FIXTURE);
  assert.deepEqual(parsed.functions, [
    { id: 'GV', name: 'GOBERNAR', outcome: 'Se establecen, comunican y supervisan la estrategia y la política de gestión de riesgos.' },
    { id: 'PR', name: 'PROTEGER', outcome: 'Se utilizan medidas de protección' },
  ]);
  assert.deepEqual(parsed.categories, [
    { id: 'GV.OC', name: 'Contexto organizativo', outcome: 'Se comprenden las circunstancias que afectan a las decisiones' },
    // The category name itself wraps before its identifier.
    { id: 'PR.AA', name: 'Gestión de identidades, autenticación y control de acceso', outcome: 'El acceso se limita a los usuarios autorizados' },
  ]);
  assert.deepEqual(parsed.subcategories, [
    // Spans the page break: the page number, running header and date line are gone.
    { id: 'GV.OC-01', outcome: 'Se comprende la misión de la organización y se informa sobre la gestión de riesgos.' },
    { id: 'GV.OC-02', outcome: 'Las partes interesadas son comprendidas' },
    { id: 'PR.AA-01', outcome: 'La organización gestiona las identidades' },
  ]);
});

test('stripPageFurniture removes only the header, date line and page number around a break', () => {
  const lines = ['texto 2024', '   16', '', HEADER, 'Febrero 26, 2024', '', 'continúa', '   7'];
  assert.deepEqual(stripPageFurniture(lines), ['texto 2024', '', '', 'continúa', '   7']);
});

test('parseSpanishCore refuses to guess at a hyphenated line break', () => {
  const hyphenated = FIXTURE.replace('Se comprenden las circunstancias que', 'Se comprenden las circunstan-');
  assert.throws(() => parseSpanishCore(hyphenated), /hyphenated word/);
});

test('parseSpanishCore fails loudly when the appendix cannot be located', () => {
  assert.throws(() => parseSpanishCore('sin apéndices'), /Could not locate Appendix A/);
});

test('buildSpanishCore accepts a translation aligned with the English Core', () => {
  const out = buildSpanishCore(parseSpanishCore(FIXTURE), CORE);
  assert.equal(out.language, 'es');
  assert.equal(out.subcategories.length, 3);
  assert.match(out.citation, /Republished courtesy of the National Institute of Standards and Technology/);
});

test('buildSpanishCore aborts on a missing, extra, or reordered identifier', () => {
  const parsed = parseSpanishCore(FIXTURE);
  assert.throws(
    () => buildSpanishCore(parsed, { ...CORE, subcategories: [...CORE.subcategories, { id: 'PR.AA-02' }] }),
    /Subcategories do not match.*missing: PR\.AA-02/,
  );
  assert.throws(
    () => buildSpanishCore(parsed, { ...CORE, subcategories: CORE.subcategories.slice(0, 2), functions: CORE.functions }),
    /do not match/,
  );
  assert.throws(
    () => buildSpanishCore(parsed, { ...CORE, subcategories: [CORE.subcategories[1], CORE.subcategories[0], CORE.subcategories[2]] }),
    /same ids, different order/,
  );
});

test('shipped csf-core.es.json: aligned one-to-one with the English Core', async () => {
  const es = await readJsonSafe('data/csf-core.es.json');
  const en = await readJsonSafe('data/csf-core.json');
  assert.equal(es.language, 'es');
  assert.deepEqual(es.functions.map((f) => f.id), en.functions.map((f) => f.id));
  assert.deepEqual(es.subcategories.map((s) => s.id), en.subcategories.map((s) => s.id));
  assert.equal(es.subcategories.length, 106);
  assert.deepEqual(
    es.categories.map((c) => c.id),
    [...new Set(en.subcategories.map((s) => s.id.split('-')[0]))],
  );
  assert.equal(es.categories.length, 22);
});

test('shipped csf-core.es.json: clean text with its source and attribution', async () => {
  const es = await readJsonSafe('data/csf-core.es.json');
  assert.match(es.source, /NIST CSWP 29 spa/);
  assert.match(es.citation, /https:\/\/doi\.org\/10\.6028\/NIST\.CSWP\.29\.spa/);
  assert.match(es.citation, /Republished courtesy of the National Institute of Standards and Technology/);
  for (const e of [...es.functions, ...es.categories, ...es.subcategories]) {
    for (const value of [e.name, e.outcome].filter((v) => v !== undefined)) {
      assert.equal(value, value.trim(), `${e.id} has surrounding whitespace`);
      assert.ok(!/\s{2,}/.test(value), `${e.id} has a whitespace run`);
      assert.ok(!/[\n\f]/.test(value), `${e.id} carries a line or page break`);
      assert.ok(!/NIST CSWP|Febrero 26/.test(value), `${e.id} carries page furniture`);
    }
  }
  // No Implementation Examples: NIST publishes those in English only.
  assert.ok(es.subcategories.every((s) => !('implementationExamples' in s)));
});

test('loadCsfText: English and unknown languages have no translation', async () => {
  assert.equal(await loadCsfText('en'), null);
  assert.equal(await loadCsfText('fr'), null);
  assert.deepEqual(TRANSLATED_LANGUAGES, ['es']);
});

test('loadCsfText: Spanish lookups by id, null for ids the translation lacks', async () => {
  const text = await loadCsfText('es');
  assert.equal(text.language, 'es');
  assert.equal(text.functionName('GV'), 'GOBERNAR');
  assert.equal(text.categoryName('PR.AA'), 'Gestión de identidades, autenticación y control de acceso');
  assert.equal(text.outcome('ID.AM-01'), 'Se mantienen inventarios del hardware gestionado por la organización');
  assert.equal(text.outcome('XX.YY-99'), null);
  assert.equal(text.functionName('XX'), null);
  assert.equal(text.categoryName('XX.YY'), null);
});

test('loadCsfText: a missing file degrades to English, a malformed one explains itself', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'csf-es-'));
  try {
    assert.equal(await loadCsfText('es', null, { path: join(dir, 'absent.json') }), null);

    const notJson = join(dir, 'broken.json');
    await writeFile(notJson, '{ not json');
    await assert.rejects(loadCsfText('es', null, { path: notJson }), (err) => err instanceof CsfDataError && /not valid JSON/.test(err.message));

    const wrongShape = join(dir, 'shape.json');
    await writeFile(wrongShape, JSON.stringify({ language: 'es', functions: [], categories: [], subcategories: [] }));
    await assert.rejects(loadCsfText('es', null, { path: wrongShape }), (err) => err instanceof CsfDataError && /malformed/.test(err.message));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
