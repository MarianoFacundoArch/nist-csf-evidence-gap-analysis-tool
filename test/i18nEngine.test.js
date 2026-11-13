/**
 * Report language: the option, and what it may and may not do to the engine.
 *
 * The assessment engine is what the published evaluation measured, so the
 * language feature is held to two rules here:
 *  - English is untouched. The prompts are byte-for-byte the prompts of the
 *    version before the feature (pinned below by hash), and the engine
 *    signature of an English run is the one that version computed, so nobody
 *    is made to re-analyze by upgrading.
 *  - Another language adds exactly one thing: a delimited instruction at the
 *    end of the user message asking for the rationale (or the `ask` answer) in
 *    that language, quotes untouched. Because the model's output then differs,
 *    such a run has its own signature and never reuses English assessments.
 *    Retrieval, the schema and the verifier are the same in every language.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SYSTEM_PROMPT, buildTaskPrompt, buildCritiquePrompt } from '../src/prompts/templates.js';
import { ASK_SYSTEM_PROMPT, buildAskPrompt } from '../src/prompts/askTemplates.js';
import { rationaleLanguageSuffix, answerLanguageSuffix } from '../src/prompts/language.js';
import { assessSubcategory } from '../src/engine/mapping.js';
import { answerQuestion } from '../src/engine/ask.js';
import { engineSignature } from '../src/util/hash.js';
import { detect } from '../src/privacy/redactor.js';
import { buildContext } from '../src/core/context.js';
import { loadConfig } from '../src/core/config.js';
import { defaultConfig } from '../src/core/defaults.js';
import { parseCliArgs, HELP_TEXT } from '../src/cli/flags.js';
import { ingest } from '../src/actions/ingest.js';
import { analyze } from '../src/actions/analyze.js';
import { readJsonSafe } from '../src/util/fsx.js';
import { SUPPORTED_LANGUAGES } from '../src/i18n/index.js';

const NOW = '2026-01-01T00:00:00.000Z';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const SUB = {
  id: 'GV.OC-01',
  functionId: 'GV',
  functionName: 'GOVERN',
  categoryId: 'GV.OC',
  category: 'Organizational Context (GV.OC)',
  outcome: 'The organizational mission is understood and informs cybersecurity risk management',
};
const MISSION = 'Our mission is to serve clients safely.';
const HITS = [
  { chunk: { id: 'policy.md#c0', source_file: 'policy.md', page: null, text: MISSION }, score: 0.5 },
  { chunk: { id: 'plan.pdf#c3', source_file: 'plan.pdf', page: 2, text: 'The plan is reviewed annually.' }, score: 0.4 },
];
const QUESTION = 'Is MFA required for remote access?';

/* ---------------------------------- prompts --------------------------------- */

test('English prompts are byte-for-byte the prompts of the version before report languages', () => {
  // SHA-256 of each prompt, computed with the code as it was before this
  // feature. A prompt is what the published evaluation measured: change one on
  // purpose, and update its hash here in the same change.
  assert.equal(sha256(SYSTEM_PROMPT), 'd45bee25b2a469df6b6ea4fc6031d0bd52fbb55b7339631efe07032a405f15e9');
  assert.equal(sha256(buildTaskPrompt(SUB, HITS)), 'ea06d607508ffef1bb6127d103a4bb976c406a81d366c4b7aa608fdc66510f8b');
  assert.equal(
    sha256(buildCritiquePrompt(SUB, HITS, '{"coverage":"partial"}')),
    '5ffd41151812dcabe5d3ec213d2444a3350aae8f1e09a896f863908943160ebc',
  );
  assert.equal(sha256(ASK_SYSTEM_PROMPT), '3ddc41e0133fc6be9cfc1144b59223ff1683495513181306ba80d6cdb8b7abef');
  assert.equal(sha256(buildAskPrompt(QUESTION, HITS)), '2c38d7284c4feddd7f3560b25b17e3a13959be922e7c3d7ca7009a3e8a3b8b05');
});

test('English, or no language at all, adds nothing to a prompt', () => {
  for (const language of ['en', undefined, null, '', 'fr', 'EN', 'constructor', 'toString']) {
    assert.equal(rationaleLanguageSuffix(language), '', String(language));
    assert.equal(answerLanguageSuffix(language), '', String(language));
  }
  // The options argument did not exist before: null, and anything without a language, is "none".
  for (const options of [undefined, null, {}, { language: 'en' }, { language: undefined }, 'es', 7]) {
    assert.equal(buildTaskPrompt(SUB, HITS, options), buildTaskPrompt(SUB, HITS));
    assert.equal(buildCritiquePrompt(SUB, HITS, '{}', options), buildCritiquePrompt(SUB, HITS, '{}'));
    assert.equal(buildAskPrompt(QUESTION, HITS, options), buildAskPrompt(QUESTION, HITS));
  }
});

test('Spanish adds one delimited instruction at the very end, and nothing else', () => {
  const rationale = rationaleLanguageSuffix('es');
  const answer = answerLanguageSuffix('es');
  // Purely additive: the English prompt, then the suffix.
  assert.equal(buildTaskPrompt(SUB, HITS, { language: 'es' }), buildTaskPrompt(SUB, HITS) + rationale);
  assert.equal(buildCritiquePrompt(SUB, HITS, '{}', { language: 'es' }), buildCritiquePrompt(SUB, HITS, '{}') + rationale);
  assert.equal(buildAskPrompt(QUESTION, HITS, { language: 'es' }), buildAskPrompt(QUESTION, HITS) + answer);

  for (const [suffix, field] of [[rationale, 'rationale'], [answer, 'answer']]) {
    // Its own section, like the sections of the prompt it follows.
    assert.ok(suffix.startsWith('\n\n=== RESPONSE LANGUAGE ===\n'), field);
    assert.equal(suffix.split('=== RESPONSE LANGUAGE ===').length - 1, 1);
    assert.ok(suffix.includes(`Write the "${field}" value in Spanish (español).`), field);
    assert.ok(suffix.includes('This applies to that one value only'), field);
    // What the safeguards depend on is restated as unchanged.
    assert.ok(suffix.includes('the JSON keys and\nevery other value keep exactly the form specified above'), field);
    assert.match(suffix, /Every quote stays VERBATIM, in the language of\s+the evidence it was copied from — never\s+translate, summarize, or otherwise alter a quote\.$/, field);
    // Wrapped like the rest of the prompt, and nothing in it for the redactor to rewrite.
    for (const line of suffix.split('\n')) assert.ok(line.length <= 110, line);
    assert.deepEqual(detect(suffix), []);
  }
  assert.ok(rationale.includes('"coverage" stays one of the four English\nwords listed'));
  assert.ok(!answer.includes('coverage'));
  // The system prompts are never touched: they are constants.
  assert.ok(!SYSTEM_PROMPT.includes('RESPONSE LANGUAGE') && !ASK_SYSTEM_PROMPT.includes('RESPONSE LANGUAGE'));
});

/* ----------------------------------- engine --------------------------------- */

/** An LLM stand-in that records every request and answers from a script. */
function scriptedLlm(responses) {
  const calls = [];
  let next = 0;
  return {
    id: 'scripted',
    isLocal: true,
    calls,
    async judge(request) {
      calls.push(request);
      const response = responses[Math.min(next++, responses.length - 1)];
      return typeof response === 'string' ? response : JSON.stringify(response);
    },
  };
}

const embedder = { id: 'test-embedder', dim: 2, embed: async (texts) => texts.map(() => [1, 0]) };
const index = {
  dim: 2,
  embedder_id: 'test-embedder',
  chunks: HITS.map((hit) => hit.chunk),
  vectors: HITS.map(() => Float32Array.from([1, 0])),
};
const engineConfig = (language, critique = false) => ({
  retrieval: { topK: 2 },
  analysis: { confidenceThreshold: 0.6, critique },
  ...(language === undefined ? {} : { report: { language } }),
});
const assessment = (overrides = {}) => ({
  subcategory_id: SUB.id,
  coverage: 'partial',
  confidence: 0.7,
  evidence: [{ source_file: 'policy.md', quote: MISSION }],
  rationale: 'The mission is stated but not tied to risk decisions.',
  needs_review: true,
  ...overrides,
});
const assess = (llm, config) => assessSubcategory({ sub: SUB, index, embedder, llm, config, engineSig: 'sig', now: NOW });

test('assessment: an English run sends exactly the English prompts', async () => {
  for (const config of [engineConfig(undefined, true), engineConfig('en', true)]) {
    const llm = scriptedLlm(['not json', assessment(), assessment()]);
    await assess(llm, config);
    assert.equal(llm.calls.length, 3); // first pass, its retry, the critique
    const hits = llm.calls[0].meta.hits;
    assert.equal(llm.calls[0].system, SYSTEM_PROMPT);
    assert.equal(llm.calls[0].user, buildTaskPrompt(SUB, hits));
    assert.ok(llm.calls[1].user.startsWith(`${buildTaskPrompt(SUB, hits)}\n\nYOUR PREVIOUS RESPONSE WAS REJECTED`));
    assert.ok(llm.calls[2].user.endsWith('grounded only in the evidence above.'));
    for (const call of llm.calls) assert.ok(!call.user.includes('RESPONSE LANGUAGE'));
  }
});

test('assessment: a Spanish run adds the instruction to the first pass, its retry and the critique', async () => {
  const llm = scriptedLlm(['not json', assessment(), assessment()]);
  await assess(llm, engineConfig('es', true));
  assert.equal(llm.calls.length, 3);
  const suffix = rationaleLanguageSuffix('es');
  const hits = llm.calls[0].meta.hits;
  const english = buildTaskPrompt(SUB, hits);

  // The system prompt — the eight rules — is the same in every language.
  for (const call of llm.calls) assert.equal(call.system, SYSTEM_PROMPT);
  assert.equal(llm.calls[0].user, english + suffix);
  // The retry repeats the whole task, instruction included, before the complaint.
  assert.ok(llm.calls[1].user.startsWith(`${english}${suffix}\n\nYOUR PREVIOUS RESPONSE WAS REJECTED`));
  assert.ok(llm.calls[2].user.endsWith(suffix));
  assert.equal(llm.calls[2].meta.pass, 'critique');
  // The evidence reaches the model unmodified, as in English.
  assert.match(llm.calls[0].user, new RegExp(`<<<BEGIN EVIDENCE CHUNK (\\d)>>>\\n${MISSION}\\n<<<END EVIDENCE CHUNK \\1>>>`));
});

test('assessment: the verifier is the same in every language — a Spanish rationale stands on a verbatim quote, a translated quote does not', async () => {
  const spanishRationale = 'La misión está enunciada, pero no se vincula con decisiones de riesgo.';
  const kept = await assess(scriptedLlm([assessment({ rationale: spanishRationale })]), engineConfig('es'));
  assert.equal(kept.coverage, 'partial');
  assert.equal(kept.rationale, spanishRationale);
  assert.deepEqual(kept.evidence.map((e) => e.quote), [MISSION]);
  assert.equal(kept.verification.downgraded, false);

  // A model that "helpfully" translates the quote has no quote: the claim is downgraded.
  const translated = assessment({ rationale: spanishRationale, evidence: [{ source_file: 'policy.md', quote: 'Nuestra misión es atender a los clientes de forma segura.' }] });
  const dropped = await assess(scriptedLlm([translated]), engineConfig('es'));
  assert.equal(dropped.coverage, 'none');
  assert.equal(dropped.verifier_action, 'downgraded_to_none_no_valid_quote');
  assert.deepEqual(dropped.evidence, []);
  // A coverage level written in Spanish is not a coverage level: rejected, retried, then the safe fallback.
  const fallback = await assess(scriptedLlm([assessment({ coverage: 'parcial' })]), engineConfig('es'));
  assert.equal(fallback.coverage, 'none');
  assert.equal(fallback.fallback, true);
});

test('ask: the instruction is added for Spanish only, and the retry keeps it', async () => {
  const supported = { answer: 'La misión es atender a los clientes de forma segura.', supported: true, evidence: [{ source_file: 'policy.md', quote: MISSION }] };
  const ask = (llm, config) => answerQuestion({ question: QUESTION, index, embedder, llm, config });

  const english = scriptedLlm([supported]);
  await ask(english, engineConfig('en'));
  assert.equal(english.calls[0].user, buildAskPrompt(QUESTION, english.calls[0].meta.hits));

  const llm = scriptedLlm(['not json', supported]);
  const result = await ask(llm, engineConfig('es'));
  const suffix = answerLanguageSuffix('es');
  const base = buildAskPrompt(QUESTION, llm.calls[0].meta.hits);
  assert.equal(llm.calls[0].system, ASK_SYSTEM_PROMPT);
  assert.equal(llm.calls[0].user, base + suffix);
  assert.ok(llm.calls[1].user.startsWith(`${base}${suffix}\n\nYOUR PREVIOUS RESPONSE WAS REJECTED`));
  // The Spanish answer is delivered; its quote was verified against the English document.
  assert.equal(result.supported, true);
  assert.equal(result.answer, supported.answer);
  assert.deepEqual(result.evidence.map((e) => e.quote), [MISSION]);
});

/* ------------------------------ engine signature ----------------------------- */

const SIGNATURE_INPUTS = {
  embeddingModel: 'mock',
  llmModel: 'mock',
  topK: 6,
  chunkSize: 1200,
  chunkOverlap: 200,
  critique: false,
  indexId: 'index-1',
};

test('engine signature: unchanged without a language, different with one', () => {
  // The value the version before report languages computed for these inputs.
  assert.equal(engineSignature(SIGNATURE_INPUTS), '90f79263a235');
  // English is never part of the fingerprint, whether it is left out or named.
  for (const language of [undefined, null, '', 'en']) {
    assert.equal(engineSignature({ ...SIGNATURE_INPUTS, language }), '90f79263a235', String(language));
  }
  const spanish = engineSignature({ ...SIGNATURE_INPUTS, language: 'es' });
  assert.match(spanish, /^[0-9a-f]{12}$/);
  assert.notEqual(spanish, '90f79263a235');
  assert.notEqual(engineSignature({ ...SIGNATURE_INPUTS, language: 'fr' }), spanish);
  // Every other input still counts.
  assert.notEqual(engineSignature({ ...SIGNATURE_INPUTS, topK: 7, language: 'es' }), spanish);
  // The two halves of the rule agree for every language the tool has: a language
  // that adds an instruction to the prompt has its own signature, and only such a language.
  for (const language of SUPPORTED_LANGUAGES) {
    const changesPrompt = rationaleLanguageSuffix(language) !== '';
    assert.equal(engineSignature({ ...SIGNATURE_INPUTS, language }) !== '90f79263a235', changesPrompt, language);
    assert.equal(answerLanguageSuffix(language) !== '', changesPrompt, language);
  }
});

test('analyze: English keeps its signature and its cache; changing the language recomputes', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'csf-i18n-analyze-'));
  try {
    const context = async (report) => {
      const ctx = await buildContext({
        docsPath: 'examples/sample-docs',
        workDir,
        csfCorePath: 'data/csf-core.json',
        embeddings: { provider: 'mock', model: 'mock' },
        llm: { provider: 'mock', model: 'mock' },
        ...(report ? { report } : {}),
        fixedNow: NOW,
        logLevel: 'quiet',
      });
      ctx.ui = { isInteractive: false, info() {}, warn() {}, success() {}, note() {} };
      return ctx;
    };
    const run = async (report) => {
      const ctx = await context(report);
      const result = await analyze(ctx);
      const meta = await readJsonSafe(ctx.paths.meta);
      const assessments = await readJsonSafe(ctx.paths.assessments);
      return { ...result, signature: meta.engine_sig, meta, signatures: new Set(Object.values(assessments).map((a) => a.engine_sig)) };
    };

    const ctx = await context();
    await ingest(ctx);
    const first = await run();
    assert.equal(first.assessed, 106);
    // Exactly the seven inputs earlier versions hashed — no language among them.
    const legacyInputs = {
      embeddingModel: 'mock',
      llmModel: 'mock',
      topK: ctx.config.retrieval.topK,
      chunkSize: ctx.config.chunk.size,
      chunkOverlap: ctx.config.chunk.overlap,
      critique: false,
      indexId: first.meta.index_id,
    };
    const legacy = engineSignature(legacyInputs);
    assert.equal(first.signature, legacy);
    assert.deepEqual([...first.signatures], [legacy]);

    // English again, written out or not: everything is reused.
    for (const report of [undefined, { language: 'en' }]) {
      const again = await run(report);
      assert.deepEqual([again.assessed, again.skipped, again.signature], [0, 106, legacy]);
    }

    // Spanish: the prompt differs, so nothing made under English is reused.
    const spanish = await run({ language: 'es' });
    assert.deepEqual([spanish.assessed, spanish.skipped], [106, 0]);
    assert.notEqual(spanish.signature, legacy);
    assert.equal(spanish.signature, engineSignature({ ...legacyInputs, language: 'es' }));
    assert.deepEqual([...spanish.signatures], [spanish.signature]);
    const spanishAgain = await run({ language: 'es' });
    assert.deepEqual([spanishAgain.assessed, spanishAgain.skipped], [0, 106]);

    // And back: Spanish assessments are not passed off as English ones.
    const back = await run();
    assert.deepEqual([back.assessed, back.skipped, back.signature], [106, 0, legacy]);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

/* ----------------------------------- option --------------------------------- */

const NOFILE = { configPath: 'this-file-does-not-exist.json' };

async function resolve(argv) {
  const { overrides, error } = parseCliArgs(argv);
  assert.equal(error, null);
  const warnings = [];
  const { config } = await loadConfig({ ...NOFILE, ...overrides }, { warn: (message) => warnings.push(message) });
  return { config, warnings, overrides };
}

test('report.language defaults to English and --lang sets it', async () => {
  assert.equal(defaultConfig().report.language, 'en');
  assert.deepEqual((await resolve(['report'])).config.report.language, 'en');
  assert.equal(parseCliArgs(['report']).overrides.report, undefined);

  for (const value of ['es', 'ES', 'Es', ' es ']) {
    const { config, warnings } = await resolve(['report', '--lang', value]);
    assert.equal(config.report.language, 'es', JSON.stringify(value));
    assert.deepEqual(warnings, []);
  }
  assert.equal((await resolve(['all', '--lang', 'en'])).config.report.language, 'en');
  // The other report settings are not disturbed by the flag.
  const both = await resolve(['report', '--lang', 'es', '--crosswalk', 'none']);
  assert.deepEqual(both.overrides.report, { language: 'es', crosswalks: [] });
  assert.equal(both.config.report.evidenceQuoteMaxChars, 300);

  assert.match(HELP_TEXT, /^ {2}--lang <en\|es> {11}Language of the reports, the dashboard and the ask$/m);
  assert.deepEqual(SUPPORTED_LANGUAGES, ['en', 'es']);
});

test('a language the tool does not have is reported and falls back to English, never silently', async () => {
  for (const bad of ['fr', 'spanish', 'es-MX', 'es_AR', '']) {
    const { config, warnings } = await resolve(['report', '--lang', bad]);
    assert.equal(config.report.language, 'en', JSON.stringify(bad));
    assert.equal(warnings.length, 1, JSON.stringify(bad));
    assert.match(warnings[0], /Invalid config value at "\/report\/language" .*reverted to default/);
  }
  // The same repair for a value written in the configuration (overrides stand in for the file here).
  for (const bad of ['ES', 7, null, ['es']]) {
    const warnings = [];
    const { config } = await loadConfig({ ...NOFILE, report: { language: bad } }, { warn: (message) => warnings.push(message) });
    assert.equal(config.report.language, 'en', JSON.stringify(bad));
    assert.ok(warnings.some((message) => message.includes('/report/language')), JSON.stringify(bad));
  }
  // A flag without its value is a usage error, shown with the help text.
  const parsed = parseCliArgs(['report', '--lang']);
  assert.equal(parsed.help, true);
  assert.match(parsed.error, /--lang/);
});
