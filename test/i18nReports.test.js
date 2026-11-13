/**
 * Report language: the Markdown deliverables and the `ask` result block.
 *
 * PART 1 — English output is frozen. Every human-readable renderer now takes
 * its wording from a message catalog. English is the default and must not
 * move: the files under test/fixtures/i18n/en/ were written by the renderers as
 * they were BEFORE the catalog existed, from the scenarios in
 * test/fixtures/i18n/scenarios.json, and these tests fail on any byte of
 * difference — when a renderer is called the way it always was (no locale),
 * and when it is handed the English locale explicitly. The scenarios are chosen
 * to reach every sentence a deliverable can print (review states, overrides, a
 * verifier downgrade, a target profile with plan fields and a Tier selection,
 * crosswalks, an incomplete and an outdated analysis, a work directory without
 * an ingest record, ...), so a change in a rarely taken branch is caught too.
 *
 * If English wording is changed on purpose, regenerate the files deliberately
 * and review the diff — never to make a red test green:
 *   CSF_WRITE_GOLDEN=1 node --test test/i18nReports.test.js
 *   git diff test/fixtures/i18n/en
 *
 * PART 2 — Spanish. The same scenarios rendered with `report.language: "es"`:
 * the same structure and the same figures as the English report, line by line;
 * the framework's text taken from NIST's published translation and never from
 * the catalog; English kept exactly where it belongs (an identifier the
 * translation lacks, NIST's Implementation Examples, the documents' own words)
 * and nowhere else; and the machine-readable files untouched by the language.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { buildProfile } from '../src/report/profile.js';
import { buildTargetView, validateTargetSpec } from '../src/target/targetProfile.js';
import { buildDocumentView, documentViewNotes } from '../src/report/documentView.js';
import { buildCrosswalkView } from '../src/crosswalk/view.js';
import { renderGapMarkdown } from '../src/report/gapMarkdown.js';
import { renderRemediationMarkdown } from '../src/report/remediationMarkdown.js';
import { renderDocumentsMarkdown } from '../src/report/documentsMarkdown.js';
import { renderEvidenceRequestsMarkdown, EVIDENCE_QUESTIONS } from '../src/report/evidenceRequestsMarkdown.js';
import { renderCrosswalkMarkdown } from '../src/report/crosswalkMarkdown.js';
import { renderReports } from '../src/report/index.js';
import { ask, renderAnswer } from '../src/actions/ask.js';
import { ingest } from '../src/actions/ingest.js';
import { analyze } from '../src/actions/analyze.js';
import { review } from '../src/actions/review.js';
import { report } from '../src/actions/report.js';
import { status } from '../src/actions/status.js';
import { buildContext } from '../src/core/context.js';
import { resolvePaths } from '../src/core/paths.js';
import { NO_EVIDENCE_ANSWER } from '../src/engine/ask.js';
import { hashAssessment } from '../src/util/hash.js';
import { readJsonSafe } from '../src/util/fsx.js';
import { mdCode } from '../src/report/markdownText.js';
import { messageCatalog } from '../src/i18n/index.js';
import { createReportLocale, loadReportLocale, ENGLISH } from '../src/i18n/locale.js';
import { loadCsfText } from '../src/csf/localized.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/i18n/', import.meta.url));
const GOLDEN = join(FIXTURES, 'en');
const INPUTS = JSON.parse(readFileSync(join(FIXTURES, 'scenarios.json'), 'utf8'));
const WRITE = process.env.CSF_WRITE_GOLDEN === '1';
const en = messageCatalog('en');
const es = messageCatalog('es');

/* -------------------------------- scenarios -------------------------------- */

/** One scenario of scenarios.json as the inputs the report stage works from. */
function loadScenario(name) {
  const raw = INPUTS.scenarios[name];
  const scenario = structuredClone(raw.extends ? { ...INPUTS.scenarios[raw.extends], ...raw } : raw);
  // The derived ids loadCsfCore() adds to every Subcategory.
  const csf = {
    ...structuredClone(INPUTS.csf),
    sample: scenario.sample === true,
  };
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
  return {
    csf,
    assessments: scenario.assessments,
    reviews: scenario.reviews,
    meta: scenario.meta,
    targetSpec: scenario.target ? validateTargetSpec(scenario.target) : null,
    crosswalks: scenario.crosswalks ? structuredClone(INPUTS.crosswalks) : null,
    // A variant of another scenario renders only the deliverables that differ from it.
    only: scenario.only ?? null,
  };
}

const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' } },
  now: () => INPUTS.now,
};

/** The views every renderer works from, built exactly as the report stage builds them. */
function buildViews(name) {
  const { csf, assessments, reviews, meta, targetSpec, crosswalks, only } = loadScenario(name);
  const profile = buildProfile(CTX, { csf, assessments, reviews, meta });
  return {
    csf,
    only,
    profile,
    targetView: targetSpec ? buildTargetView(profile, targetSpec, csf) : null,
    documentView: buildDocumentView(profile, { assessments, meta }),
    crosswalkView: crosswalks ? buildCrosswalkView(profile, crosswalks) : null,
  };
}

/**
 * Every human-readable Markdown deliverable of a scenario, by file name.
 * `extra` is merged into each renderer's options (the locale under test).
 */
function renderMarkdown(name, extra = {}) {
  const { csf, only, profile, targetView, documentView, crosswalkView } = buildViews(name);
  const files = {
    'gap-analysis.md': renderGapMarkdown(profile, { evidenceQuoteMaxChars: 300, targetView, ...extra }),
    'evidence-by-document.md': renderDocumentsMarkdown(profile, documentView, extra),
    'evidence-requests.md': renderEvidenceRequestsMarkdown(profile, { csf, targetView, ...extra }),
  };
  if (targetView) files['remediation-plan.md'] = renderRemediationMarkdown(profile, targetView, extra);
  if (crosswalkView) files['crosswalk.md'] = renderCrosswalkMarkdown(profile, crosswalkView, extra);
  return only ? Object.fromEntries(only.map((file) => [file, files[file]])) : files;
}

/** All `ask` result blocks in one text file, each under the name of its case. */
function renderAskBlocks(render = (result) => renderAnswer(result)) {
  return Object.entries(INPUTS.askResults)
    .map(([name, result]) => `=== ${name} ===\n${render(result)}\n`)
    .join('\n');
}

const SCENARIOS = Object.keys(INPUTS.scenarios);

/* ====================== PART 1 — English output is frozen ===================== */

function golden(relativePath, actual) {
  const path = join(GOLDEN, relativePath);
  if (WRITE) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  assert.ok(existsSync(path), `missing golden file ${relativePath} (see the header of this test)`);
  assert.equal(actual, readFileSync(path, 'utf8'), `${relativePath} differs from the frozen English output`);
}

for (const name of SCENARIOS) {
  test(`English ${name}: every Markdown deliverable is byte-identical to the frozen output`, () => {
    const files = renderMarkdown(name);
    for (const [file, text] of Object.entries(files)) golden(join(name, file), text);
    if (!WRITE) {
      // Nothing frozen is left unrendered (a deliverable that silently stopped being produced).
      assert.deepEqual(readdirSync(join(GOLDEN, name)).sort(), Object.keys(files).sort());
    }
  });
}

test('English evidence requests are the same for a caller that renders without the CSF core', () => {
  // The target view carries the official examples too, so older call shapes lose nothing.
  const { profile, targetView } = buildViews('rich');
  golden(join('rich', 'evidence-requests.md'), renderEvidenceRequestsMarkdown(profile, { targetView }));
});

test('English `ask` result blocks are byte-identical to the frozen output', () => {
  golden('ask-results.txt', renderAskBlocks());
});

test('the frozen files cover every scenario and nothing else', { skip: WRITE }, () => {
  assert.deepEqual(readdirSync(GOLDEN).sort(), [...SCENARIOS, 'ask-results.txt'].sort());
});

test('handing a renderer the English locale changes nothing', { skip: WRITE }, async () => {
  // The shared default, a locale built for "en", and the one the report stage loads.
  const locales = [ENGLISH, createReportLocale({ language: 'en' }), await loadReportLocale('en'), await loadReportLocale(undefined)];
  assert.equal(locales[2], ENGLISH);
  assert.equal(locales[3], ENGLISH);
  for (const locale of locales.slice(0, 2)) {
    assert.equal(locale.isEnglish, true);
    for (const name of SCENARIOS) {
      for (const [file, text] of Object.entries(renderMarkdown(name, { locale }))) golden(join(name, file), text);
    }
    golden('ask-results.txt', renderAskBlocks((result) => renderAnswer(result, { locale })));
  }
});

test('a renderer handed something that is not a locale renders English', { skip: WRITE }, () => {
  // No renderer took a locale before, and some gained a parameter for it: a
  // caller's stray value in that place must not be able to break a report.
  const { csf, profile, targetView, documentView, crosswalkView } = buildViews('rich');
  for (const stray of [null, undefined, 'es', 7, {}, { language: 'es' }, { t: 'es', fixed: null }]) {
    const label = JSON.stringify(stray);
    golden(join('rich', 'gap-analysis.md'), renderGapMarkdown(profile, { evidenceQuoteMaxChars: 300, targetView, locale: stray }));
    golden(join('rich', 'evidence-requests.md'), renderEvidenceRequestsMarkdown(profile, { csf, targetView, locale: stray }));
    golden(join('rich', 'remediation-plan.md'), renderRemediationMarkdown(profile, targetView, { locale: stray }));
    golden(join('rich', 'evidence-by-document.md'), renderDocumentsMarkdown(profile, documentView, { locale: stray }));
    golden(join('rich', 'crosswalk.md'), renderCrosswalkMarkdown(profile, crosswalkView, { locale: stray }));
    golden('ask-results.txt', renderAskBlocks((result) => renderAnswer(result, { locale: stray })));
    assert.deepEqual(documentViewNotes(documentView, undefined, stray), documentViewNotes(documentView), label);
  }
  // The options argument itself: absent before, so null and a non-object are "no options".
  for (const options of [null, 'es', 7]) {
    golden(join('rich', 'remediation-plan.md'), renderRemediationMarkdown(profile, targetView, options));
    golden(join('rich', 'evidence-by-document.md'), renderDocumentsMarkdown(profile, documentView, options));
    golden(join('rich', 'crosswalk.md'), renderCrosswalkMarkdown(profile, crosswalkView, options));
    golden('ask-results.txt', renderAskBlocks((result) => renderAnswer(result, options)));
  }
});

/* ============================== PART 2 — Spanish ============================= */

const spanish = await loadReportLocale('es');
const csfText = await loadCsfText('es');
// The one element of the fixture core that the published translation does not cover.
const CUSTOM = INPUTS.csf.subcategories.find((sub) => sub.id === 'ZZ.CU-01');
const TRANSLATED = INPUTS.csf.subcategories.filter((sub) => sub.id !== CUSTOM.id);
const EXAMPLES = new Set(INPUTS.csf.subcategories.flatMap((sub) => sub.implementationExamples));

const frameworkNote = (profile) => {
  const note = spanish.frameworkNote(profile.subcategories);
  return `> **${note.label}.** ${note.text}`;
};

/** Lines a Spanish report has and the English one does not: the notes, each followed by a blank line. */
function withoutSpanishNotes(markdown, profile) {
  const notes = new Set([frameworkNote(profile), es['note.examplesEnglish']]);
  const lines = markdown.split('\n');
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (notes.has(lines[i])) {
      assert.equal(lines[i + 1], '', 'a note is its own paragraph');
      i++;
    } else {
      kept.push(lines[i]);
    }
  }
  return kept;
}

/**
 * What a line IS, apart from its wording: its Markdown role, the Subcategory
 * ids it names, and every number on it. Two reports with the same shapes carry
 * the same items, in the same order, with the same figures.
 */
function shape(line) {
  const role =
    /^(#{1,4}) /.exec(line)?.[1] ??
    /^(> ?)/.exec(line)?.[1].trim() ??
    (line.startsWith('|') ? `table:${line.replace(/\\\|/g, '').split('|').length}` : null) ??
    /^( *)(- \[ \] |- |\d+\. )/.exec(line)?.slice(1).join('').replace(/\d+/, 'N') ??
    (line === '' ? 'blank' : line === '---' ? 'rule' : 'text');
  const ids = line.match(/\b[A-Z]{2}\.[A-Z]{2}-\d{2}\b/g) ?? [];
  const numbers = (line.match(/\d+/g) ?? []).sort();
  return `${role} ids=${ids.join(',')} n=${numbers.join(',')}`;
}

// English function words. None of them is a Spanish word, so one of them in a
// Spanish report (outside text that is English on purpose) is a leak.
const ENGLISH_WORDS = new Set(
  ('the and of is are was were not with without this that these those for from each every by at or on to it its ' +
    'their has have been be which who when where only also any all than as but if an in').split(' '),
);

/**
 * English function words found in `text`. Hyphenated names and file names are
 * kept whole ("evidence-by-document.md" is a name, not three words), and an
 * acronym is not a word ("IT Operations").
 */
function englishWords(text) {
  return (text.match(/[\p{L}][\p{L}\p{N}'’-]*/gu) ?? [])
    .filter((word) => word !== word.toUpperCase())
    .map((word) => word.toLowerCase())
    .filter((word) => ENGLISH_WORDS.has(word));
}

/** A Spanish deliverable with the text that is English on purpose removed. */
function withoutIntendedEnglish(markdown) {
  return markdown
    .split('\n')
    // NIST's Implementation Examples: whole list items, verbatim.
    .filter((line) => !EXAMPLES.has(line.replace(/^ {2}(?:\d+\. |- \[ \] )/, '')))
    .join('\n')
    // The element of a custom core, which has no published translation.
    .replaceAll(CUSTOM.outcome, '');
}

test('data a renderer was not written for is printed the way it always was, in both languages', () => {
  const { csf, profile, targetView } = buildViews('rich');
  // A summary with a count missing: printed as missing, not a failure.
  const sparse = structuredClone(profile);
  delete sparse.summary.byCoverage.full;
  assert.ok(renderGapMarkdown(sparse).includes('- Coverage: none 4, partial 3, substantial 2, full undefined\n'));
  assert.ok(renderGapMarkdown(sparse, { locale: spanish }).includes('- Cobertura: ninguna 4, parcial 3, sustancial 2, completa undefined\n'));

  // "N level(s) to close": plural above one, whatever the view carries as the distance.
  for (const gap of [1, 2, 3, 0.5, 1.5, '1', '2']) {
    const view = structuredClone(targetView);
    const entry = view.entries.find((e) => e.subcategory_id === 'GV.OC-02');
    entry.gap = gap;
    const expected = `GV.OC-02 — none → substantial (${gap} level${gap > 1 ? 's' : ''} to close)`;
    assert.ok(renderRemediationMarkdown(profile, view).includes(`#### 1. ${expected}\n`), `plan, gap ${JSON.stringify(gap)}`);
    assert.ok(renderEvidenceRequestsMarkdown(profile, { csf, targetView: view }).includes(` (${gap} level${gap > 1 ? 's' : ''} to close)`), `requests, gap ${JSON.stringify(gap)}`);
  }
  // A Tier that is not one of the four numbers is no Tier, in the sentence as in src/target/tiers.js.
  for (const tier of ['2', [2], 2.5, true, {}]) {
    const view = { ...targetView, tiers: { ...targetView.tiers, current: { tier, name: 'x' } } };
    assert.ok(renderRemediationMarkdown(profile, view).includes('- CSF Tier — current: not recorded; target: Tier 3 (Repeatable). '), JSON.stringify(tier));
    assert.ok(renderRemediationMarkdown(profile, view, { locale: spanish }).includes('- Nivel del CSF. Actual: no registrado; objetivo: Nivel 3 — Repetible (Repeatable). '), JSON.stringify(tier));
  }
});

test('Spanish: every report has the structure, the items and the figures of the English report', () => {
  for (const name of SCENARIOS) {
    const { profile } = buildViews(name);
    const english = renderMarkdown(name);
    const translated = renderMarkdown(name, { locale: spanish });
    assert.deepEqual(Object.keys(translated), Object.keys(english), name);
    for (const file of Object.keys(english)) {
      const a = english[file].split('\n').map(shape);
      const b = withoutSpanishNotes(translated[file], profile).map(shape);
      assert.deepEqual(b, a, `${name}/${file}: the Spanish report is not line-for-line the English one`);
      assert.notEqual(translated[file], english[file]);
    }
  }
});

test('Spanish: no English from the tool leaks into any report', () => {
  for (const name of SCENARIOS) {
    for (const [file, text] of Object.entries(renderMarkdown(name, { locale: spanish }))) {
      for (const line of withoutIntendedEnglish(text).split('\n')) {
        assert.deepEqual(englishWords(line), [], `${name}/${file}: English in "${line}"`);
      }
    }
  }
  // The detector does detect: the English reports are full of what it looks for.
  assert.ok(englishWords(renderMarkdown('rich')['gap-analysis.md']).length > 50);
});

test('Spanish: titles, banner and vocabulary come from the Spanish catalog', () => {
  const files = renderMarkdown('rich', { locale: spanish });
  assert.ok(files['gap-analysis.md'].startsWith(`# ${es['gap.title']}\n`));
  assert.ok(files['remediation-plan.md'].startsWith(`# ${es['plan.title']}\n`));
  assert.ok(files['evidence-by-document.md'].startsWith(`# ${es['docs.title']}\n`));
  assert.ok(files['evidence-requests.md'].startsWith(`# ${es['requests.title']}\n`));
  assert.ok(files['crosswalk.md'].startsWith(`# ${es['crosswalk.title']}\n`));

  const gap = files['gap-analysis.md'];
  assert.ok(gap.includes(`> ${es['fixed.profile.disclaimer']}\n`));
  assert.ok(gap.includes('> **BORRADOR — revisión incompleta.** Elementos sin revisar: 3; con revisión desactualizada: 1.'));
  assert.ok(gap.includes('- Cobertura: ninguna 4, parcial 3, sustancial 2, completa 1\n'));
  assert.ok(gap.includes('- Fuente del CSF: NIST CPRT — CSF 2.0 Core (dominio público).\n'));
  // Values are shown in Spanish; identifiers, file names and dates are not touched.
  assert.ok(gap.includes('- **GV.RM-01** — _parcial_ _(⚠ SIN REVISAR)_\n'));
  assert.ok(gap.includes('- **PR.AA-01** — _parcial_ _(⚠ REVISIÓN DESACTUALIZADA)_\n'));
  assert.ok(gap.includes('- **PR.AA-05** — _ninguna_ _(corrección del revisor: parcial → ninguna)_\n'));
  assert.ok(gap.includes(`- **RC.RP-01** — _ninguna_ _(${es['badge.unreviewed']}; ${es['badge.downgraded']})_\n`));
  assert.ok(gap.includes('  - Evidencia (access-standard.pdf, p. 2): "Quoted evidence text PR.AA-01 (1)."\n'));
  assert.ok(gap.includes('- Generado: 2026-01-01T00:00:00.000Z\n'));
  assert.ok(gap.includes('**remediation-plan.md**'));
  // The verifier's own note is worded in Spanish; the rationale that follows it is left as written.
  assert.ok(gap.includes(`  - Fundamento: ${es['fixedPrefix.rationale.downgraded']} Rationale text GV.OC-02.\n`));
  assert.ok(!gap.includes('Auto-downgraded'));

  const plan = files['remediation-plan.md'];
  assert.ok(plan.includes('### Prioridad alta (1)\n'));
  assert.ok(plan.includes('#### 1. GV.OC-02 — ninguna → sustancial (faltan 2 niveles de cobertura)\n'));
  assert.ok(plan.includes('#### 4. GV.RM-01 — parcial → sustancial (falta 1 nivel de cobertura) _(⚠ SIN REVISAR)_\n'));
  // Plan fields are the person's; only the status, a value target.json constrains, is shown in Spanish.
  assert.ok(plan.includes('- Plan (registrado en el Perfil Objetivo): responsable: IT Operations Lead; fecha límite: 2026-06-30; estado: en curso; hitos: Pilot; rollout Q3.\n'));
  assert.ok(plan.includes('- **DE.CM-01** — completa (objetivo: sustancial)\n'));
  assert.ok(plan.includes('_(motivo: Remote organization; registered address solely.)_'));
  // The Tier selection: NIST's Spanish names, the English name beside each.
  assert.ok(plan.includes('- Nivel del CSF. Actual: Nivel 2 — Informado sobre el Riesgo (Risk Informed); objetivo: Nivel 3 — Repetible (Repeatable). '));

  const requests = files['evidence-requests.md'];
  assert.ok(requests.includes('- Cobertura actual: ninguna (corrección del revisor: parcial → ninguna); objetivo: completa; prioridad: media\n'));
  assert.ok(requests.includes('- Estado de revisión: desactualizado\n'));
  assert.ok(requests.includes('- Documentos ya citados: `policy.md` (2 citas), `risk-register.xlsx.md` (1 cita)\n'));
  for (const key of ['requests.question.1', 'requests.question.2', 'requests.question.3']) {
    assert.ok(requests.includes(`. ${es[key]}\n`), key);
    assert.ok(!requests.includes(en[key]), `${key} must not appear in English`);
  }
});

test('Spanish: Function names, Category names and outcomes are NIST\'s published translation', () => {
  const files = renderMarkdown('rich', { locale: spanish });
  const everything = Object.values(files).join('\n');

  for (const sub of TRANSLATED) {
    const outcome = csfText.outcome(sub.id);
    assert.ok(outcome && outcome !== sub.outcome, sub.id);
    assert.ok(everything.includes(outcome), `${sub.id}: the official Spanish outcome is not shown`);
    assert.ok(!everything.includes(sub.outcome), `${sub.id}: the English outcome is still shown`);
  }
  // Exactly the text of the data file, not a rewording of it.
  assert.ok(files['gap-analysis.md'].includes(
    '  - Resultado: Los objetivos de la gestión de riesgos son establecidos y acordados por las partes interesadas de la organización\n',
  ));

  // Function names: as printed in the publication's Core listing ("RECUPERACIÓN" included).
  const functionHeadings = files['gap-analysis.md'].split('\n').filter((line) => line.startsWith('### '));
  assert.deepEqual(functionHeadings, [
    '### GOBERNAR', '### PROTEGER', '### RECUPERACIÓN', '### CUSTOM',
    '### GOBERNAR', '### IDENTIFICAR', '### DETECTAR',
  ]);
  assert.ok(files['gap-analysis.md'].includes('| RECUPERACIÓN | 1 | 1 | 0 | 0 | 0 | 0% |\n'));
  for (const name of ['GOVERN', 'IDENTIFY', 'PROTECT', 'DETECT', 'RECOVER']) {
    assert.ok(!new RegExp(`\\b${name}\\b`).test(everything), `the English Function name ${name} is still shown`);
  }

  // Category names, with the identifier kept beside the name as in the English label.
  assert.ok(files['remediation-plan.md'].includes('- Función / Categoría: GOBERNAR / Contexto organizativo (GV.OC)\n'));
  assert.ok(files['evidence-requests.md'].includes(
    '- Función / Categoría: PROTEGER / Gestión de identidades, autenticación y control de acceso (PR.AA)\n',
  ));
  assert.ok(files['crosswalk.md'].includes('| A-30 | Función: GOBERNAR (GV) | 3 resultados: ninguna 1, parcial 1, sustancial 1 (⚠ 1 sin revisar) |\n'));
  assert.ok(files['crosswalk.md'].includes(
    '| A-40 | Categoría: Ejecución del Plan de Recuperación de Incidentes (RC.RP) | 1 resultado: ninguna 1 (⚠ 1 sin revisar) |\n',
  ));
  assert.ok(files['evidence-by-document.md'].includes('| `policy.md` | 5 | 10 | 3 | 4 | 1 | 1 | 0 | 1 | GOBERNAR, PROTEGER, DETECTAR |\n'));

  // The catalog itself holds no framework text: nothing the translation says is typed into it.
  const catalogText = Object.values(es).join('\n');
  for (const name of ['GOBERNAR', 'IDENTIFICAR', 'PROTEGER', 'DETECTAR', 'RESPONDER', 'RECUPERACIÓN', 'RECUPERAR']) {
    assert.ok(!catalogText.includes(name), `the Function name ${name} is hard-coded in src/i18n/es.js`);
  }
  for (const sub of TRANSLATED) assert.ok(!catalogText.includes(csfText.outcome(sub.id)), sub.id);
  for (const id of ['GV.OC', 'PR.AA', 'RC.RP']) assert.ok(!catalogText.includes(csfText.categoryName(id)), id);
});

test('Spanish: an identifier the translation lacks keeps its English text, and the report says so', () => {
  const files = renderMarkdown('rich', { locale: spanish });
  assert.equal(csfText.outcome(CUSTOM.id), null);
  // Outcome, Function and Category of the custom element: unchanged.
  assert.ok(files['gap-analysis.md'].includes(`- **ZZ.CU-01** — _parcial_\n  - Resultado: ${CUSTOM.outcome}\n`));
  assert.ok(files['gap-analysis.md'].includes('### CUSTOM\n'));
  assert.ok(files['remediation-plan.md'].includes('- Función / Categoría: CUSTOM / Custom Controls\n'));
  assert.ok(files['crosswalk.md'].includes('| A-50 | Categoría: Custom Controls (ZZ.CU) | 1 resultado: parcial 1 |\n'));
  assert.ok(files['crosswalk.md'].includes('| A-60 | Función: CUSTOM (ZZ) | 1 resultado: parcial 1 |\n'));

  // The note states the source of the Spanish text, that the assessment used the
  // English original, and how many outcomes the translation was not used for —
  // once per report.
  const notCovered = spanish.t('note.frameworkText.partial', { missing: 1, total: 10 });
  for (const [file, text] of Object.entries(files)) {
    assert.equal(text.split(`**${es['note.frameworkText.label']}.**`).length - 1, 1, `${file}: the note appears once`);
    assert.ok(text.includes('(NIST CSWP 29 spa, https://doi.org/10.6028/NIST.CSWP.29.spa)'), file);
    assert.ok(text.includes('La evaluación se realizó con el texto original en inglés'), file);
    assert.ok(text.includes(`${es['note.frameworkText']} ${notCovered}\n`), file);
  }
  // A core the translation covers entirely gets the note without that sentence.
  const official = TRANSLATED.map((sub) => ({ subcategory_id: sub.id, outcome: sub.outcome }));
  assert.equal(spanish.frameworkNote(official).text, es['note.frameworkText']);
  // An English report carries no such note at all.
  assert.equal(ENGLISH.frameworkNote([{ subcategory_id: 'ZZ.CU-01' }]), null);
  assert.equal(ENGLISH.examplesNote(), null);
});

test('Spanish: a tailored element that keeps an official identifier is not given NIST\'s sentence', () => {
  // A CSF core file is the user's to edit. An outcome reworded there was
  // assessed as reworded; the official Spanish text would describe something else.
  const { profile, targetView } = buildViews('rich');
  const tailored = structuredClone(profile);
  const entry = tailored.subcategories.find((e) => e.subcategory_id === 'GV.OC-01');
  entry.outcome = 'The mission is reviewed by the board every quarter';
  const renamed = tailored.subcategories.filter((e) => e.function === 'DETECT');
  for (const e of renamed) e.function = 'WATCH';
  const recategorized = tailored.subcategories.find((e) => e.subcategory_id === 'ID.AM-01');
  recategorized.category = 'Our Asset Register (ID.AM)';

  const gap = renderGapMarkdown(tailored, { locale: spanish });
  // The reworded outcome is shown as assessed; its neighbour, untouched, is still NIST's Spanish.
  assert.ok(gap.includes('- **GV.OC-01** — _sustancial_: The mission is reviewed by the board every quarter\n'));
  assert.ok(!gap.includes(csfText.outcome('GV.OC-01')));
  assert.ok(gap.includes(csfText.outcome('GV.OC-02')));
  // A renamed Function keeps its name; the official ones are translated as before.
  assert.ok(gap.includes('### WATCH\n') && !gap.includes('DETECTAR'));
  assert.ok(gap.includes('### GOBERNAR\n'));
  // The note counts both elements the translation was not used for.
  assert.ok(gap.includes(spanish.t('note.frameworkText.partial', { missing: 2, total: 10 })));

  // The same rule for a Category label, and for the plan built from the original profile's target.
  const plan = renderRemediationMarkdown(tailored, { ...targetView, entries: targetView.entries.map((t) => ({ ...t, category: t.subcategory_id === 'GV.RM-01' ? 'Risk Appetite (GV.RM)' : t.category })) }, { locale: spanish });
  assert.ok(plan.includes('- Función / Categoría: GOBERNAR / Risk Appetite (GV.RM)\n'));
  assert.ok(plan.includes('- Función / Categoría: GOBERNAR / Contexto organizativo (GV.OC)\n'));

  // A locale built without the official English text applies the translation by identifier.
  const byId = createReportLocale({ language: 'es', csfText });
  assert.equal(byId.outcome(entry), csfText.outcome('GV.OC-01'));
  assert.equal(spanish.outcome(entry), entry.outcome);
  assert.equal(spanish.categoryLabel(recategorized), 'Our Asset Register (ID.AM)');
});

test('the exported question list is what an English list prints; Spanish has its own wording', () => {
  const { csf, profile, targetView } = buildViews('rich');
  const original = [...EVIDENCE_QUESTIONS];
  try {
    // The list is exported and has always been read when a report is rendered.
    EVIDENCE_QUESTIONS[0] = 'A question of the caller\'s own?';
    assert.ok(renderEvidenceRequestsMarkdown(profile, { csf, targetView }).includes('  1. A question of the caller\'s own?\n'));
    const translated = renderEvidenceRequestsMarkdown(profile, { csf, targetView, locale: spanish });
    assert.ok(translated.includes(`  1. ${es['requests.question.1']}\n`) && !translated.includes('of the caller'));
  } finally {
    EVIDENCE_QUESTIONS.splice(0, EVIDENCE_QUESTIONS.length, ...original);
  }
  golden(join('rich', 'evidence-requests.md'), renderEvidenceRequestsMarkdown(profile, { csf, targetView }));
});

test('Spanish: a Function name that stands for two identifiers is left as it is', () => {
  const { profile } = buildViews('rich');
  // The translation names Functions by identifier; a report groups them by name.
  // When one name covers entries of two identifiers there is no single official
  // name to show for the group, so the name the entries carry is kept — whichever
  // of the two comes first in the profile.
  const mixed = structuredClone(profile);
  mixed.subcategories.find((e) => e.subcategory_id === 'GV.OC-01').function = 'PROTECT';
  mixed.subcategories.find((e) => e.subcategory_id === 'RC.RP-01').function = 'IDENTIFY';
  const names = spanish.functionNames(mixed.subcategories);
  assert.equal(names('PROTECT'), 'PROTECT');
  assert.equal(names('IDENTIFY'), 'IDENTIFY');
  // A name that still stands for one identifier is NIST's.
  assert.equal(names('GOVERN'), csfText.functionName('GV'));
  assert.equal(names('DETECT'), csfText.functionName('DE'));
  assert.equal(names('NOT IN THE PROFILE'), 'NOT IN THE PROFILE');
  const gap = renderGapMarkdown(mixed, { locale: spanish });
  assert.ok(gap.includes('| PROTECT | 4 |') && gap.includes('| GOBERNAR | 2 |') && !gap.includes('PROTEGER'));

  // The untouched profile: every official name is NIST's.
  const official = spanish.functionNames(profile.subcategories);
  assert.equal(official('GOVERN'), 'GOBERNAR');
  assert.equal(official('PROTECT'), 'PROTEGER');
  assert.equal(official('CUSTOM'), 'CUSTOM');
  // No entries, or no list at all: names are returned as given.
  for (const none of [[], null, undefined]) assert.equal(spanish.functionNames(none)('GOVERN'), 'GOVERN');
});

test('Spanish: Implementation Examples stay in NIST\'s English, verbatim and in order, with a note saying why', () => {
  const { profile, targetView } = buildViews('rich');
  const files = renderMarkdown('rich', { locale: spanish });
  const plan = files['remediation-plan.md'];
  const requests = files['evidence-requests.md'];

  const unmet = targetView.entries.filter((entry) => !entry.not_applicable && !entry.met);
  assert.ok(unmet.some((entry) => entry.implementation_examples.length === 2));
  for (const entry of unmet) {
    const numbered = entry.implementation_examples.map((example, i) => `  ${i + 1}. ${example}`).join('\n');
    const checklist = entry.implementation_examples.map((example) => `  - [ ] ${example}`).join('\n');
    if (numbered) {
      assert.ok(plan.includes(`- ${es['plan.item.actions']}\n${numbered}\n`), `${entry.subcategory_id}: plan`);
      assert.ok(requests.includes(`- ${es['requests.item.examples']}\n${checklist}\n`), `${entry.subcategory_id}: requests`);
    }
  }
  // An outcome without examples says so, in Spanish, and invents none.
  assert.ok(plan.includes(`- ${es['plan.item.noActions']}\n`));
  assert.ok(requests.includes(`- ${es['requests.item.noExamples']}\n`));

  // The one-line note: once in the plan, above the list; once in the request list's header.
  assert.equal(es['note.examplesEnglish'], 'Los Ejemplos de implementación se muestran en inglés: el NIST solo los publica en ese idioma.');
  assert.equal(plan.split(es['note.examplesEnglish']).length - 1, 1);
  assert.ok(plan.indexOf(es['note.examplesEnglish']) < plan.indexOf('### Prioridad alta'));
  assert.equal(requests.split(es['note.examplesEnglish']).length - 1, 1);
  assert.ok(requests.includes(`> ${es['requests.sources']} ${es['note.examplesEnglish']}\n`));
  // A plan with nothing to do lists no examples and so carries no note about them.
  assert.ok(!renderMarkdown('clean-target', { locale: spanish })['remediation-plan.md'].includes(es['note.examplesEnglish']));
  // English reports are unchanged by any of this (and frozen above).
  assert.ok(!renderRemediationMarkdown(profile, targetView).includes('NIST publishes them'));
});

test('Spanish crosswalk report: every caveat is made, and nothing reads like a conformance score', () => {
  for (const name of ['rich', 'clean-target']) {
    const md = renderMarkdown(name, { locale: spanish })['crosswalk.md'];
    const firstTable = md.indexOf(es['crosswalk.table.overview.header']);
    assert.ok(firstTable > 0);
    for (const key of ['related', 'coverage', 'levels', 'identifiers']) {
      const statement = es[`crosswalk.howToRead.${key}`];
      assert.ok(md.indexOf(statement) > 0 && md.indexOf(statement) < firstTable, `${name}: "${key}" must come before the data`);
    }
    assert.ok(md.includes('**Quién elaboró cada mapeo.** Los mapeos proceden de: Test source (OLIR).'));
    assert.ok(md.includes('no por este proyecto, que no añade mapeos propios'));
    assert.ok(md.includes('no supone un respaldo del NIST ni de este proyecto'));

    assert.ok(!md.includes('%'), `${name}: no percentage anywhere in the report`);
    // No vocabulary of compliance, scoring or passing, in Spanish or English.
    assert.ok(!/\b(cumpl\w*|puntuaci\w*|calificaci\w*|aprobad\w*|superad\w*|complian\w*|score)\b/i.test(md), name);
    // Every use of "conformidad" is a denial.
    const uses = md.match(/[^.]*\bconformidad\b[^.]*\./g) ?? [];
    assert.ok(uses.length >= 4, name);
    for (const sentence of uses) assert.match(sentence, /\b(no|ni|No)\b/, `"conformidad" used without a denial: ${sentence.trim()}`);
    // The counts come with their caveat, once per crosswalk that lists references.
    assert.equal(md.split('no indican si una referencia se satisface').length - 1, 3, name);
  }

  const md = renderMarkdown('rich', { locale: spanish })['crosswalk.md'];
  // Third-party mappings are labeled everywhere they appear, and only they.
  assert.ok(md.includes('| `beta` | Beta Standard 2022 — mapeo de terceros | Independent Author Ltd | 2025-07-18 | 1 | 1 de 10 |\n'));
  assert.ok(md.includes('## Beta Standard 2022 (mapeo de terceros)\n'));
  assert.equal(md.split(es['crosswalk.thirdParty.line']).length - 1, 1);
  assert.ok(!/Alpha Controls v1[^\n]*terceros/.test(md));
  // Provenance from the data file; links only where the English report has them.
  assert.ok(md.includes('- Fuente de los mapeos: Test source (OLIR); fecha de obtención de los datos: 2026-11-13\n'));
  assert.ok(md.includes('- Documento del mapeo (alojado por el NIST): <https://csrc.nist.gov/media/alpha.xlsx>\n'));
  const links = (text) => text.match(/<https?:[^>]+>/g);
  assert.deepEqual(links(md), links(renderMarkdown('rich')['crosswalk.md']));
  assert.ok(md.includes('| A-1 | PR.AA-01 (parcial, ⚠ REVISIÓN DESACTUALIZADA); también relacionada con una Categoría o Función entera (tabla siguiente) |\n'));
  assert.ok(md.includes(`\n${es['crosswalk.noReferences']}\n`));
});

test('Spanish: the caveats of the document view, the analysis state and a tool-written rationale are translated', () => {
  const stale = buildViews('stale');
  const notes = documentViewNotes(stale.documentView, mdCode, spanish);
  assert.equal(notes.length, 3);
  assert.match(notes[0], /^12 documentos aparecen en la evaluación .*`retired-10\.md` y 2 más\. /);
  assert.equal(notes[1], es['docs.caveat.noRetrieval']);
  // The reasons are the status module's English phrases in the data; the report words them in Spanish.
  assert.ok(notes[2].includes(`(${es['fixed.analysis.mixedSignatures']}; ${es['fixed.analysis.indexChanged']})`));
  assert.deepEqual(stale.profile.activity.analysis.reasons, [en['fixed.analysis.mixedSignatures'], en['fixed.analysis.indexChanged']]);
  // The view itself, which the dashboard embeds, still carries the English sentences.
  assert.deepEqual(stale.documentView.notes, documentViewNotes(stale.documentView));
  assert.match(stale.documentView.notes[0], /^12 documents appear in the assessment/);
  // Called without a locale, or with a name formatter only, the function is unchanged.
  assert.deepEqual(documentViewNotes(stale.documentView, mdCode, ENGLISH), documentViewNotes(stale.documentView, mdCode));

  const requests = renderMarkdown('stale', { locale: spanish })['evidence-requests.md'];
  assert.ok(requests.includes(`> **Nota.** La evaluación no está al día con sus datos de entrada (${es['fixed.analysis.mixedSignatures']}; `));

  // An outcome that was never assessed, and the engine's fallbacks: the tool's own sentences.
  const bare = renderMarkdown('bare', { locale: spanish });
  assert.ok(bare['gap-analysis.md'].includes(`  - Fundamento: ${es['fixed.rationale.notAssessed']}\n`));
  assert.ok(bare['gap-analysis.md'].includes(`  - Fundamento: ${es['fixed.rationale.noEvidence']}\n`));
  assert.ok(bare['gap-analysis.md'].includes(`  - Fundamento: ${es['fixedPrefix.rationale.fallback']} provider timeout 504\n`));
  assert.ok(bare['gap-analysis.md'].includes(`- Fuente del CSF: ${es['fixed.csfSource.partial']}\n`));
  assert.ok(bare['evidence-requests.md'].includes(`> **Nota.** ${spanish.t('requests.caveat.incomplete', { assessed: 3, total: 10 })}\n`));
  assert.ok(bare['evidence-requests.md'].includes('El análisis está incompleto (resultados evaluados: 3 de 10).'));
  // A Tier recorded on one side only.
  assert.ok(bare['remediation-plan.md'].includes('- Nivel del CSF. Actual: no registrado; objetivo: Nivel 4 — Adaptativo (Adaptive). '));
});

test('Spanish without the translation file: framework text stays English and the report says so', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'csf-i18n-'));
  try {
    assert.equal(await loadCsfText('es', null, { path: join(dir, 'absent.json') }), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const untranslated = createReportLocale({ language: 'es', csfText: null });
  const { profile, targetView } = buildViews('rich');
  const gap = renderGapMarkdown(profile, { targetView, locale: untranslated });
  assert.ok(gap.startsWith(`# ${es['gap.title']}\n`));
  assert.ok(gap.includes('### GOVERN\n') && !gap.includes('GOBERNAR'));
  assert.ok(gap.includes(`  - Resultado: ${TRANSLATED[1].outcome}\n`));
  assert.ok(gap.includes(`> **${es['note.frameworkText.label']}.** ${es['note.frameworkText.unavailable']}\n`));
  // A translation that was not used is not credited.
  assert.ok(!gap.includes(es['note.frameworkText']) && !gap.includes('doi.org'));

  // A language the tool has no catalog and no translation for: rendered in English, with a warning.
  const warnings = [];
  const other = await loadReportLocale('fr', { warn: (message) => warnings.push(message) });
  assert.equal(other.isEnglish, false);
  assert.equal(other.csfText, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /No published translation of the CSF Core is available for report language "fr"/);
  assert.equal(other.t('gap.title'), en['gap.title']);

  // The official English text the translation was made from cannot be read: there is no
  // telling which elements it applies to, so it is not used — one warning, and a report.
  warnings.length = 0;
  const unchecked = await loadReportLocale('es', { warn: (message) => warnings.push(message) }, { referencePath: join(FIXTURES, 'absent.json') });
  assert.equal(unchecked.csfText, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^The CSF Core shipped with the tool could not be read, so its published translation is not used \(.*not found.*\): Function names/);
  const plain = renderGapMarkdown(profile, { targetView, locale: unchecked });
  assert.ok(plain.includes('### GOVERN\n') && !plain.includes('GOBERNAR'));
  assert.ok(plain.includes(`> **${es['note.frameworkText.label']}.** ${es['note.frameworkText.unavailable']}\n`));
  // Read normally, it comes with that text: every official element of the fixture is translated.
  const quiet = await loadReportLocale('es', { warn: (message) => warnings.push(message) });
  assert.equal(warnings.length, 1);
  assert.equal(quiet.outcome(profile.subcategories[0]), csfText.outcome(profile.subcategories[0].subcategory_id));
});

test('Spanish `ask` result: same structure and figures, the tool\'s sentences in Spanish, the quotes untouched', () => {
  const english = renderAskBlocks().split('\n');
  const translated = renderAskBlocks((result) => renderAnswer(result, { locale: spanish })).split('\n');
  assert.equal(translated.length, english.length);
  const numbers = (line) => (line.match(/\d+/g) ?? []).sort().join(',');
  english.forEach((line, i) => assert.equal(numbers(translated[i]), numbers(line), `line ${i + 1}: ${translated[i]}`));
  for (const line of translated) assert.deepEqual(englishWords(line), [], line);

  const supported = renderAnswer(INPUTS.askResults['one-quote'], { locale: spanish });
  assert.deepEqual(supported.split('\n'), [
    'Pregunta: Question text?',
    '',
    es['ask.answerLabel'],
    'Model summary sentence.',
    '',
    'Citas verificadas (1):',
    '  1. access-standard.md: "Quoted evidence text (1)."',
    '',
    es['ask.verified.single'],
    es['ask.onlyQuotesVerified'],
    'Pasajes del índice examinados: 6 de 8, por orden de relevancia (retrieval.topK = 6).',
  ]);

  // No answer: the tool's fixed sentence, in Spanish, although the result carries it in English.
  const result = INPUTS.askResults['withheld-one-quote'];
  assert.equal(result.answer, NO_EVIDENCE_ANSWER);
  const withheld = renderAnswer(result, { locale: spanish }).split('\n');
  assert.equal(withheld[2], es['fixed.ask.noEvidence']);
  // The Spanish sentence says what happened: the quote could NOT be verified.
  assert.equal(withheld[3], 'El modelo propuso una respuesta, pero su cita no pudo verificarse palabra por palabra, por lo que la respuesta no se muestra.');
  // Untrusted text is still held to one safe line.
  const hostile = renderAnswer(INPUTS.askResults['several-quotes-one-dropped'], { locale: spanish });
  assert.ok(hostile.includes('  3. weird\u{fffd}[31mname.md: "Quoted \u{fffd}evidence text (3)."'));
  assert.ok(hostile.includes('  2. plan.pdf, p. 4: "Quoted evidence text (2)."'));
});

/* ------------------- the report stage and the whole pipeline ------------------ */

const MACHINE_READABLE = ['current-profile.json', 'target-profile.json', 'evidence-map.csv', 'crosswalk.csv', 'poam.csv'];
const HUMAN_READABLE = ['gap-analysis.md', 'remediation-plan.md', 'evidence-by-document.md', 'evidence-requests.md', 'crosswalk.md', 'dashboard.html'];

async function withWorkDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'csf-i18n-reports-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function reportContext(dir, language) {
  return {
    config: {
      analysis: { strict: false },
      report: { evidenceQuoteMaxChars: 300, ...(language ? { language } : {}) },
      embeddings: { provider: 'mock' },
      llm: { provider: 'mock' },
    },
    paths: resolvePaths(dir),
    now: () => INPUTS.now,
  };
}

const readReports = async (dir) =>
  Object.fromEntries(
    await Promise.all(
      (await readdirSync(join(dir, 'reports'))).map(async (file) => [file, await readFile(join(dir, 'reports', file), 'utf8')]),
    ),
  );

test('renderReports: the language changes the human-readable files and none of the machine-readable ones', async () => {
  await withWorkDir(async (root) => {
    const inputs = () => {
      const { csf, assessments, reviews, meta, targetSpec, crosswalks } = loadScenario('rich');
      return { csf, assessments, reviews, meta, targetSpec, crosswalks };
    };
    await renderReports(reportContext(join(root, 'default')), inputs());
    await renderReports(reportContext(join(root, 'en'), 'en'), inputs());
    await renderReports(reportContext(join(root, 'es'), 'es'), inputs());
    const [byDefault, english, translated] = await Promise.all(['default', 'en', 'es'].map((name) => readReports(join(root, name))));

    assert.deepEqual(Object.keys(byDefault).sort(), [...MACHINE_READABLE, ...HUMAN_READABLE].sort());
    // "en" is the default: every file is the same byte for byte.
    assert.deepEqual(english, byDefault);
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(english).sort());
    for (const file of MACHINE_READABLE) assert.equal(translated[file], english[file], `${file} must not change with the language`);
    for (const file of HUMAN_READABLE) assert.notEqual(translated[file], english[file], `${file} must be rendered in Spanish`);

    // The interfaces keep their English keys, headers and values.
    const profile = JSON.parse(translated['current-profile.json']);
    assert.equal(profile.disclaimer, en['fixed.profile.disclaimer']);
    assert.ok(!Object.hasOwn(profile, 'language'));
    assert.equal(profile.subcategories[0].function, 'GOVERN');
    assert.ok(!Object.hasOwn(JSON.parse(translated['target-profile.json']), 'language'));
    assert.ok(translated['evidence-map.csv'].startsWith('\u{feff}subcategory_id,function,category,coverage,'));
    assert.ok(translated['poam.csv'].includes('Outcome not demonstrated at the target level: '));
    assert.ok(translated['crosswalk.csv'].startsWith('\u{feff}crosswalk_id,framework,reference,'));

    assert.ok(translated['gap-analysis.md'].startsWith(`# ${es['gap.title']}\n`));
    assert.match(translated['dashboard.html'], /^<!doctype html>\n<html lang="es">/);
    assert.match(english['dashboard.html'], /^<!doctype html>\n<html lang="en">/);

    // Rendering in English again over a Spanish run leaves no trace of it.
    await renderReports(reportContext(join(root, 'es'), 'en'), inputs());
    assert.deepEqual(await readReports(join(root, 'es')), english);
  });
});

test('offline pipeline in Spanish: every outcome in NIST\'s Spanish, the same machine-readable files, a current report', async () => {
  await withWorkDir(async (root) => {
    const run = async (language) => {
      const ctx = await buildContext({
        docsPath: 'examples/sample-docs',
        workDir: join(root, language),
        csfCorePath: 'data/csf-core.json',
        embeddings: { provider: 'mock', model: 'mock' },
        llm: { provider: 'mock', model: 'mock' },
        review: { showAll: true },
        report: { language },
        acceptAll: true,
        fixedNow: INPUTS.now,
        logLevel: 'quiet',
      });
      const results = [];
      ctx.ui = { isInteractive: false, info() {}, warn() {}, success() {}, note() {}, result: (title, body) => results.push({ title, body }) };
      await ingest(ctx);
      await analyze(ctx);
      await review(ctx);
      await report(ctx);
      return { ctx, results };
    };
    const english = await run('en');
    const translated = await run('es');
    const [enFiles, esFiles] = await Promise.all([readReports(english.ctx.paths.root), readReports(translated.ctx.paths.root)]);

    for (const file of ['current-profile.json', 'evidence-map.csv', 'crosswalk.csv']) {
      assert.equal(esFiles[file], enFiles[file], `${file} must not change with the language`);
    }

    // All 106 outcomes, each exactly as data/csf-core.es.json has it; all six Function names.
    const official = await readJsonSafe('data/csf-core.es.json');
    assert.equal(official.subcategories.length, 106);
    const gap = esFiles['gap-analysis.md'];
    for (const sub of official.subcategories) assert.ok(gap.includes(sub.outcome), `${sub.id} is not shown in NIST's Spanish`);
    for (const fn of official.functions) assert.ok(gap.includes(`| ${fn.name} | `), fn.name);
    assert.ok(gap.includes(`> **${es['note.frameworkText.label']}.** ${es['note.frameworkText']}\n`), 'the full core needs no "not covered" sentence');
    // The mock engine's rationales are fixed English sentences (it is not a model); nothing translates them.
    assert.ok(gap.includes('  - Fundamento: The retrieved evidence does not demonstrate this outcome;'));
    // ...but the verifier's note in front of the one it downgraded is the tool's own, and is in Spanish.
    assert.ok(gap.includes(`  - Fundamento: ${es['fixedPrefix.rationale.downgraded']} The organization appears to link`));

    // The report is current for `status`, in either language.
    for (const { ctx } of [english, translated]) {
      const state = await status(ctx);
      assert.equal(state.report.status, 'current');
    }

    // `ask` follows the same setting: Spanish block, English structured result.
    translated.ctx.config.question = 'what is the airspeed velocity of an unladen swallow?';
    const answer = await ask(translated.ctx);
    assert.equal(answer.supported, false);
    assert.equal(answer.answer, NO_EVIDENCE_ANSWER);
    const shown = translated.results.at(-1);
    assert.equal(shown.title, 'Respuesta');
    assert.equal(shown.body, renderAnswer(answer, { locale: spanish }));
    assert.ok(shown.body.startsWith('Pregunta: what is the airspeed velocity of an unladen swallow?\n\n' + es['fixed.ask.noEvidence']));

    english.ctx.config.question = 'is multifactor authentication required for remote access?';
    const supported = await ask(english.ctx);
    assert.equal(english.results.at(-1).title, 'Answer');
    assert.equal(english.results.at(-1).body, renderAnswer(supported));
  });
});
