import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { answerQuestion, NO_EVIDENCE_ANSWER } from '../src/engine/ask.js';
import { ask } from '../src/actions/ask.js';
import { redactingLlm, redactingEmbedder } from '../src/privacy/redactingProviders.js';
import { chunkProtection } from '../src/privacy/wholeIdentifiers.js';
import { createEmbedder as createMockEmbedder } from '../src/embeddings/mock.js';
import { buildIndex, saveIndex } from '../src/store/vectorStore.js';
import { resolvePaths } from '../src/core/paths.js';
import { ConfigError } from '../src/core/errors.js';

// `ask` and redaction are separate features that meet here: a question goes
// through the same two provider decorators as an assessment, so it needs no
// redaction code of its own. These tests pin that down.

const TERMS = ['Northwind Analytics', 'Northwind'];
const CONFIG = { retrieval: { topK: 2 }, question: null, privacy: { redact: true, terms: TERMS } };

const CHUNKS = [
  {
    id: 'northwind-access-standard.md~aaaaaa#na#c0',
    source_file: 'northwind-access-standard.md',
    page: null,
    char_start: 0,
    char_end: 190,
    text: 'Privileged access requests at Northwind Analytics are approved by the system owner (admin@northwind.example).\nApproved requests are logged on db01.corp.example within one day.',
  },
  {
    id: 'note.txt~bbbbbb#na#c1',
    source_file: 'note.txt',
    page: null,
    char_start: 0,
    char_end: 71,
    text: 'Sensitive data should be handled carefully by everyone at the company.',
  },
];

const SECRETS = ['admin@northwind.example', 'db01.corp.example', 'northwind.example', 'corp.example', 'Northwind', 'northwind'];

function assertNoSecrets(text, where) {
  for (const secret of SECRETS) assert.ok(!text.includes(secret), `${where}: ${JSON.stringify(secret)} left the machine`);
}

function spyEmbedder() {
  const mock = createMockEmbedder();
  const batches = [];
  return { id: 'cloud-embed', isLocal: false, dim: mock.dim, batches, async embed(texts) { batches.push(texts); return mock.embed(texts); } };
}

function spyLlm(reply) {
  const calls = [];
  return { id: 'cloud-llm', isLocal: false, calls, async judge(args) { calls.push(args); return reply(args); } };
}

/** Answers with the first line of chunk 1, verbatim, and names its first placeholder in the summary. */
function answeringModel({ user }) {
  const begin = '<<<BEGIN EVIDENCE CHUNK 1>>>\n';
  const chunk = user.slice(user.indexOf(begin) + begin.length, user.indexOf('\n<<<END EVIDENCE CHUNK 1>>>'));
  const quote = chunk.split('\n')[0];
  const owner = /\[\[EMAIL_\d+\]\]/.exec(quote)[0];
  return JSON.stringify({
    answer: `The standard requires approval by the system owner, ${owner}; this is a stated requirement.`,
    supported: true,
    evidence: [{ source_file: /\[CHUNK 1 \| source_file: "([^"]*)"/.exec(user)[1], quote }],
  });
}

async function redactedSetup(reply = answeringModel) {
  const cloudEmbedder = spyEmbedder();
  const cloudLlm = spyLlm(reply);
  const embedder = redactingEmbedder(cloudEmbedder, { terms: TERMS });
  const llm = redactingLlm(cloudLlm, { terms: TERMS });
  const vectors = await embedder.embed(CHUNKS.map((c) => c.text));
  const index = { dim: embedder.dim, embedder_id: embedder.id, chunks: CHUNKS, vectors: vectors.map((v) => Float32Array.from(v)) };
  return { cloudEmbedder, cloudLlm, embedder, llm, index, vectors };
}

test('ask under redaction: question and evidence go out redacted; the answer and its quote come back in the original words', async () => {
  const { cloudEmbedder, cloudLlm, embedder, llm, index } = await redactedSetup();
  const question = 'Who approves privileged access requests at Northwind Analytics, and is db01.corp.example involved?';
  const r = await answerQuestion({ question, index, embedder, llm, config: CONFIG });

  // The embeddings provider saw the chunks and then the question — all redacted.
  assert.equal(cloudEmbedder.batches.length, 2);
  cloudEmbedder.batches.flat().forEach((text, i) => assertNoSecrets(text, `embedding input ${i}`));
  assert.deepEqual(cloudEmbedder.batches[1], ['Who approves privileged access requests at [[TERM_1]], and is [[HOST_2]] involved?']);

  // The reasoning provider saw one request: no originals, no `meta`.
  assert.equal(cloudLlm.calls.length, 1);
  assert.deepEqual(Object.keys(cloudLlm.calls[0]), ['system', 'user']);
  assertNoSecrets(cloudLlm.calls[0].system, 'system prompt');
  assertNoSecrets(cloudLlm.calls[0].user, 'ask prompt');
  // Within the request, the question and the evidence share placeholders, so the
  // model can relate "[[HOST_2]]" in the question to the same host in the chunk.
  const { user } = cloudLlm.calls[0];
  assert.ok(user.includes('=== QUESTION ===\nWho approves privileged access requests at [[TERM_1]], and is [[HOST_2]] involved?'));
  assert.ok(user.includes('Approved requests are logged on [[HOST_2]] within one day.'));
  assert.ok(user.includes('Privileged access requests at [[TERM_1]] are approved by the system owner ([[EMAIL_'));

  // What the user gets: verified quote and summary, both restored.
  assert.equal(r.supported, true);
  assert.equal(r.question, question);
  assert.equal(r.evidence.length, 1);
  assert.equal(r.evidence[0].quote, 'Privileged access requests at Northwind Analytics are approved by the system owner (admin@northwind.example).');
  assert.equal(r.evidence[0].verified, true);
  assert.equal(r.evidence[0].source_file, 'northwind-access-standard.md');
  assert.equal(r.evidence[0].attribution_corrected, false);
  assert.equal(r.answer, 'The standard requires approval by the system owner, admin@northwind.example; this is a stated requirement.');
});

test('ask under redaction: a mangled placeholder cannot produce an answer — it is withheld', async () => {
  const { embedder, llm, index } = await redactedSetup((args) => answeringModel(args).replaceAll('[[EMAIL_', '[[EMAIL_9'));
  const r = await answerQuestion({ question: 'Who approves privileged access requests?', index, embedder, llm, config: CONFIG });
  assert.equal(r.supported, false);
  assert.equal(r.answer, NO_EVIDENCE_ANSWER);
  assert.equal(r.verifier_action, 'answer_withheld_no_valid_quote');
  assert.deepEqual(r.evidence, []);
});

test('ask action under redaction: provider ids show it, and an index built without redaction is refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'csf-ask-redact-'));
  try {
    const { embedder, llm, vectors } = await redactedSetup();
    const paths = resolvePaths(dir);
    const cutForRedaction = { size: 1200, overlap: 200, wholeIdentifiers: chunkProtection(CONFIG).wholeIdentifiers };
    const save = (embedderId, chunkParams = cutForRedaction) =>
      saveIndex(paths.index, buildIndex({ chunks: CHUNKS, vectors, embedderId, dim: embedder.dim, chunkParams, createdAt: '2026-01-01T00:00:00.000Z' }));
    const results = [];
    const ctx = {
      config: { ...CONFIG, question: 'Who approves privileged access requests at Northwind Analytics?' },
      paths,
      logger: { info() {}, warn() {}, debug() {}, error() {} },
      getEmbedder: async () => embedder,
      getLlm: async () => llm,
      ui: { isInteractive: false, result: (title, body) => results.push(body) },
    };

    await save('cloud-embed+redact');
    const result = await ask(ctx);
    assert.equal(result.supported, true);
    assert.deepEqual(result.providers, { embeddings: 'cloud-embed+redact', llm: 'cloud-llm+redact' });
    assert.ok(results[0].includes('"Privileged access requests at Northwind Analytics are approved by the system owner (admin@northwind.example)."'));
    assert.ok(!results[0].includes('[['), 'no placeholder reaches the user');

    // The same documents ingested WITHOUT redaction: their vectors are of the
    // unredacted text, so the question (embedded redacted) cannot be compared.
    await save('cloud-embed', { size: 1200, overlap: 200 });
    await assert.rejects(
      () => ask(ctx),
      (err) => err instanceof ConfigError && /built with embedder "cloud-embed" but the current embedder is "cloud-embed\+redact"/.test(err.message),
    );
    // Same embedder id, but chunks that were not cut with redaction on (or for
    // another list of terms): refused as well, before anything is sent.
    results.length = 0;
    await save('cloud-embed+redact', { size: 1200, overlap: 200 });
    await assert.rejects(() => ask(ctx), (err) => err instanceof ConfigError && /the index was built without it/.test(err.message));
    await save('cloud-embed+redact', { ...cutForRedaction, wholeIdentifiers: 'aaaaaaaaaaaa' });
    await assert.rejects(() => ask(ctx), (err) => err instanceof ConfigError && /privacy\.terms\) has changed/.test(err.message));
    assert.equal(results.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
