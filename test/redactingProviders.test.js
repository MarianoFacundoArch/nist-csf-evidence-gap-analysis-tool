import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { redactingLlm, redactingEmbedder, applyRedaction, REDACTED_ID_SUFFIX, PLACEHOLDER_NOTE } from '../src/privacy/redactingProviders.js';
import { detect } from '../src/privacy/redactor.js';
import { getLlm } from '../src/llm/index.js';
import { getEmbedder } from '../src/embeddings/index.js';
import { isLoopbackUrl } from '../src/llm/ollama.js';
import { assessSubcategory, extractJsonObject } from '../src/engine/mapping.js';
import { createEmbedder as createMockEmbedder } from '../src/embeddings/mock.js';
import { ingest } from '../src/actions/ingest.js';
import { analyze } from '../src/actions/analyze.js';
import { report } from '../src/actions/report.js';
import { defaultConfig } from '../src/core/defaults.js';
import { resolvePaths } from '../src/core/paths.js';
import { ConfigError, ProviderError } from '../src/core/errors.js';
import { engineSignature } from '../src/util/hash.js';
import { readJsonSafe } from '../src/util/fsx.js';

// The organization's name is listed in full and in its shortest distinctive form:
// terms match as substrings, so the short form also covers file and host names.
const TERMS = ['Northwind Analytics', 'Northwind', 'Acme "Rocket" Corp', 'CORP\\jsmith'];

// A document passage with every kind of identifier, laid out the awkward ways
// real documents are: values at the start of a line, after a tab, and a listed
// name broken across two lines.
const PASSAGE = [
  'Northwind Analytics — Access Control Standard.',
  'Privileged access requests are approved by the system owner (admin@northwind.example) and logged on db01.corp.example.',
  'Escalation contacts are listed here:',
  'soc@northwind.example\t10.0.0.5',
  'The access register is maintained by Northwind',
  'Analytics at https://intranet.corp.example/wiki/Access_(register) and reviewed monthly.',
].join('\n');

// Nothing in this list may ever be seen by a non-local provider.
const SECRETS = [
  'admin@northwind.example', 'soc@northwind.example', 'db01.corp.example', '10.0.0.5', 'https://intranet.corp.example/wiki/Access_(register)',
  'intranet.corp.example', 'northwind.example', 'corp.example', 'Northwind', 'northwind', 'Rocket', 'jsmith',
];

function assertNoSecrets(text, where) {
  assert.equal(typeof text, 'string', `${where}: a string was sent`);
  for (const secret of SECRETS) assert.ok(!text.includes(secret), `${where}: ${JSON.stringify(secret)} left the machine in ${JSON.stringify(text.slice(0, 300))}`);
}

/** A stand-in for a cloud reasoning provider that records exactly what it is sent. */
function spyLlm(reply, { id = 'cloud-llm', isLocal = false } = {}) {
  const calls = [];
  return {
    id,
    isLocal,
    calls,
    async judge(args) {
      calls.push(args);
      return typeof reply === 'function' ? reply(args, calls.length) : reply;
    },
  };
}

/** A stand-in for a cloud embeddings provider: real (mock) vectors, recorded inputs. */
function spyEmbedder({ id = 'cloud-embed', isLocal = false } = {}) {
  const mock = createMockEmbedder();
  const batches = [];
  return {
    id,
    isLocal,
    dim: mock.dim,
    batches,
    async embed(texts) {
      batches.push(texts);
      return mock.embed(texts);
    },
  };
}

function captureLogger() {
  const lines = [];
  const at = (level) => (...args) => lines.push(`${level}: ${args.join(' ')}`);
  return { level: 'debug', lines, debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}

/** The text of evidence chunk `n` as the prompt shows it to the model. */
function chunkInPrompt(user, n = 1) {
  const begin = `<<<BEGIN EVIDENCE CHUNK ${n}>>>\n`;
  const start = user.indexOf(begin) + begin.length;
  return user.slice(start, user.indexOf(`\n<<<END EVIDENCE CHUNK ${n}>>>`));
}

const sourceFileInPrompt = (user) => /\[CHUNK 1 \| source_file: "([^"]*)"/.exec(user)[1];
const subcategoryInPrompt = (user) => /^Subcategory: (\S+)$/m.exec(user)[1];
const firstPassInPrompt = (user) => {
  const marker = '=== FIRST-PASS ASSESSMENT TO REVIEW ===\n';
  const start = user.indexOf(marker) + marker.length;
  return user.slice(start, user.indexOf('\n', start));
};

/**
 * A model that behaves well with what it is given: it quotes, verbatim, the
 * lines of chunk 1 that carry placeholders — and on a critique pass confirms
 * the first pass by copying its evidence from the embedded JSON.
 */
function quotingModel(args) {
  const { user } = args;
  if (user.includes('=== FIRST-PASS ASSESSMENT TO REVIEW ===')) {
    const firstPass = JSON.parse(firstPassInPrompt(user));
    return JSON.stringify({ ...firstPass, rationale: `Confirmed. ${firstPass.rationale}` });
  }
  const chunk = chunkInPrompt(user);
  const lines = chunk.split('\n');
  const from = lines.findIndex((l) => l.includes('[['));
  const quote = from === -1 ? lines[0] : lines.slice(from).join('\n');
  const mention = /\[\[[A-Z]+_[0-9]+\]\]/.exec(chunk)?.[0] ?? 'nothing';
  return JSON.stringify({
    subcategory_id: subcategoryInPrompt(user),
    coverage: 'partial',
    confidence: 0.7,
    evidence: [{ source_file: sourceFileInPrompt(user), quote }],
    rationale: `The standard names ${mention} in the approval path, which is policy language.`,
    needs_review: false,
  });
}

const SUB = {
  id: 'PR.AA-05',
  outcome: 'Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed',
  functionId: 'PR',
  functionName: 'PROTECT',
  categoryId: 'PR.AA',
  category: 'Identity Management, Authentication, and Access Control (PR.AA)',
};

async function makeIndex(embedder, chunks) {
  const vectors = await embedder.embed(chunks.map((c) => c.text));
  return { dim: embedder.dim, embedder_id: embedder.id, chunks, vectors: vectors.map((v) => Float32Array.from(v)) };
}

const CHUNKS = [
  { id: 'acme-northwind analytics-standard.md~aaaaaa#na#c0', source_file: 'northwind analytics-standard.md', page: null, text: PASSAGE },
  { id: 'note.txt~bbbbbb#na#c1', source_file: 'note.txt', page: null, text: 'Sensitive data should be handled carefully by everyone at the company.' },
];

const ENGINE_CONFIG = { retrieval: { topK: 2 }, analysis: { confidenceThreshold: 0.6, critique: false } };
const NOW = '2026-01-01T00:00:00.000Z';

/* --------------------------- the reasoning decorator --------------------------- */

test('LLM decorator: the inner provider never receives an original value, and never receives meta', async () => {
  const inner = spyLlm('{}');
  const llm = redactingLlm(inner, { terms: TERMS });
  await llm.judge({
    system: 'You assess documents of Northwind Analytics (contact admin@northwind.example).',
    user: `Evidence:\n${PASSAGE}`,
    meta: { subcategory: SUB, hits: [{ chunk: CHUNKS[0], score: 0.9 }], pass: 'first' },
  });

  assert.equal(inner.calls.length, 1);
  const sent = inner.calls[0];
  // Exactly the two strings, nothing else: `meta` holds the original chunks.
  assert.deepEqual(Object.keys(sent), ['system', 'user']);
  assertNoSecrets(sent.system, 'system');
  assertNoSecrets(sent.user, 'user');
  assertNoSecrets(JSON.stringify(sent), 'whole request');
  // One placeholder map for the call: the same value is the same placeholder in both strings.
  assert.equal(sent.system, `You assess documents of [[TERM_1]] (contact [[EMAIL_2]]).\n\n${PLACEHOLDER_NOTE}`);
  assert.ok(sent.user.includes('by the system owner ([[EMAIL_2]]) and logged on [[HOST_3]].'));
  assert.ok(sent.user.startsWith('Evidence:\n[[TERM_1]] — Access Control Standard.'));
  // The rest of the text is what was written.
  assert.ok(sent.user.includes('Escalation contacts are listed here:\n[[EMAIL_4]]\t[[IP_5]]\nThe access register is maintained by [[TERM_6]] at [[URL_7]] and reviewed monthly.'));
});

test('LLM decorator: the reply is restored, so the engine sees the document\'s own strings again', async () => {
  const inner = spyLlm(({ user }) => JSON.stringify({ quote: chunkInPrompt(`<<<BEGIN EVIDENCE CHUNK 1>>>\n${user}\n<<<END EVIDENCE CHUNK 1>>>`), note: 'Owner is [[EMAIL_2]]; host [[HOST_3]].' }));
  const llm = redactingLlm(inner, { terms: TERMS });
  const raw = await llm.judge({ system: 'none', user: PASSAGE });
  const parsed = JSON.parse(raw);
  assert.equal(parsed.quote, PASSAGE); // character for character, line breaks and tab included
  assert.equal(parsed.note, 'Owner is admin@northwind.example; host db01.corp.example.');
});

test('LLM decorator: restoring is JSON-safe for an original with a quote and a backslash', async () => {
  const chunk = 'The owner is Acme "Rocket" Corp and the service account is CORP\\jsmith.';
  const inner = spyLlm(({ user }) => `{"evidence":[{"source_file":"a.md","quote":"${user}"}],"rationale":"Names [[TERM_1]]."}`);
  const llm = redactingLlm(inner, { terms: TERMS });
  const raw = await llm.judge({ system: '', user: chunk });

  assert.equal(inner.calls[0].user, 'The owner is [[TERM_1]] and the service account is [[TERM_2]].');
  // The raw reply is still valid JSON, and the engine's own extractor reads it.
  const parsed = extractJsonObject(raw);
  assert.notEqual(parsed, null);
  assert.equal(parsed.evidence[0].quote, chunk);
  assert.equal(parsed.rationale, 'Names Acme "Rocket" Corp.');
});

test('LLM decorator: a placeholder the model invents or mangles is left as it is', async () => {
  const inner = spyLlm('{"quote":"Contact [[EMAIL_9]] or [EMAIL_1] or [[EMAIL-1]], see [[HOST_1]]; real: [[ email_1 ]]"}');
  const llm = redactingLlm(inner, { terms: TERMS });
  const parsed = JSON.parse(await llm.judge({ system: '', user: 'Contact admin@northwind.example.' }));
  assert.equal(parsed.quote, 'Contact [[EMAIL_9]] or [EMAIL_1] or [[EMAIL-1]], see [[HOST_1]]; real: admin@northwind.example');
});

test('LLM decorator: each call has its own placeholder map', async () => {
  const inner = spyLlm('{"echo":"[[EMAIL_1]] / [[IP_1]]"}');
  const llm = redactingLlm(inner, { terms: TERMS });
  const first = JSON.parse(await llm.judge({ system: '', user: 'mail admin@northwind.example' }));
  const second = JSON.parse(await llm.judge({ system: '', user: 'address 10.0.0.5' }));
  assert.equal(inner.calls[0].user, 'mail [[EMAIL_1]]');
  assert.equal(inner.calls[1].user, 'address [[IP_1]]'); // numbering restarts
  // A placeholder from an earlier call means nothing in a later one.
  assert.equal(first.echo, 'admin@northwind.example / [[IP_1]]');
  assert.equal(second.echo, '[[EMAIL_1]] / 10.0.0.5');
});

test('LLM decorator: provider errors and odd replies pass through untouched', async () => {
  const failure = new ProviderError('OpenAI chat request failed: 401');
  const failing = redactingLlm({ id: 'x', isLocal: false, async judge() { throw failure; } }, {});
  await assert.rejects(() => failing.judge({ system: 's', user: 'u' }), (err) => err === failure);

  for (const odd of [undefined, null, '', 'not json at all']) {
    const llm = redactingLlm(spyLlm(odd), {});
    assert.equal(await llm.judge({ system: 's', user: 'admin@northwind.example' }), odd);
  }
  // Missing prompt parts are sent as empty strings, never as "undefined".
  const inner = spyLlm('{}');
  await redactingLlm(inner, {}).judge({});
  assert.deepEqual(inner.calls[0], { system: '', user: '' });
});

test('LLM decorator: the model is told what a placeholder is — only when the request contains one', async () => {
  const inner = spyLlm('{}');
  const llm = redactingLlm(inner, { terms: TERMS });

  // Nothing to replace: the request is byte-for-byte what it would be without redaction.
  await llm.judge({ system: 'Assess the evidence.', user: 'The policy is reviewed annually by the committee.' });
  assert.deepEqual(inner.calls[0], { system: 'Assess the evidence.', user: 'The policy is reviewed annually by the committee.' });

  // Something replaced (here only in the user prompt): the note follows the system prompt.
  await llm.judge({ system: 'Assess the evidence.', user: 'Contact admin@northwind.example.' });
  assert.equal(inner.calls[1].system, `Assess the evidence.\n\n${PLACEHOLDER_NOTE}`);
  assert.equal(inner.calls[1].user, 'Contact [[EMAIL_1]].');

  // The note is plain instructions: nothing in it is an identifier, and its
  // example is not a real placeholder — a reply that repeats the note is not "restored".
  assert.deepEqual(detect(PLACEHOLDER_NOTE), []);
  const echo = redactingLlm(spyLlm(JSON.stringify({ rationale: PLACEHOLDER_NOTE })), { terms: TERMS });
  assert.equal(JSON.parse(await echo.judge({ system: '', user: 'Contact admin@northwind.example.' })).rationale, PLACEHOLDER_NOTE);
});

/* --------------------------- the embeddings decorator -------------------------- */

test('embedder decorator: the inner provider never receives an original value', async () => {
  const inner = spyEmbedder();
  const embedder = redactingEmbedder(inner, { terms: TERMS });
  const texts = [PASSAGE, 'Who administers db01.corp.example?', 'No identifiers in this one.', ''];
  const vectors = await embedder.embed(texts);

  assert.equal(inner.batches.length, 1);
  const sent = inner.batches[0];
  assert.equal(sent.length, texts.length);
  sent.forEach((text, i) => assertNoSecrets(text, `text ${i}`));
  // Each text is redacted on its own: numbering restarts, and a text's redacted
  // form does not depend on what it is batched with.
  assert.equal(sent[1], 'Who administers [[HOST_1]]?');
  assert.equal(sent[2], 'No identifiers in this one.');
  assert.equal(sent[3], '');
  const alone = spyEmbedder();
  await redactingEmbedder(alone, { terms: TERMS }).embed([texts[1]]);
  assert.deepEqual(alone.batches[0], [sent[1]]);
  // The vectors are the inner provider's, for the redacted texts.
  assert.deepEqual(vectors, await createMockEmbedder().embed(sent));
});

test('embedder decorator: id suffix, non-local, and a dimension that stays live', async () => {
  const inner = { id: 'openai:text-embedding-3-small', isLocal: false, dim: null, async embed(texts) { this.dim = 3; return texts.map(() => [1, 0, 0]); } };
  const embedder = redactingEmbedder(inner, {});
  assert.equal(embedder.id, `openai:text-embedding-3-small${REDACTED_ID_SUFFIX}`);
  assert.equal(embedder.id, 'openai:text-embedding-3-small+redact');
  assert.equal(embedder.isLocal, false);
  assert.equal(embedder.dim, null);
  await embedder.embed(['x']);
  assert.equal(embedder.dim, 3); // discovered by the inner provider after the first call
});

/* ------------------------------ where it applies ------------------------------ */

test('applyRedaction: a local provider is returned as is, with one line saying why', () => {
  const logger = captureLogger();
  const config = { privacy: { redact: true, terms: TERMS } };
  const llm = spyLlm('{}', { id: 'ollama:llama3.2', isLocal: true });
  const embedder = spyEmbedder({ id: 'local-transformers:Xenova/all-MiniLM-L6-v2', isLocal: true });

  assert.equal(applyRedaction(llm, 'llm', config, logger), llm); // the very same object
  assert.equal(applyRedaction(embedder, 'embeddings', config, logger), embedder);
  assert.deepEqual(logger.lines, [
    'info: Redaction is not needed for the reasoning provider "ollama:llama3.2": it runs on this machine, so nothing sent to it leaves the machine.',
    'info: Redaction is not needed for the embeddings provider "local-transformers:Xenova/all-MiniLM-L6-v2": it runs on this machine, so nothing sent to it leaves the machine.',
  ]);
});

test('applyRedaction: a non-local provider is wrapped — and so is one that does not say where it runs', async () => {
  const logger = captureLogger();
  const config = { privacy: { redact: true, terms: TERMS } };

  const cloud = spyLlm('{}', { id: 'openai:gpt-4o-mini', isLocal: false });
  const wrapped = applyRedaction(cloud, 'llm', config, logger);
  assert.notEqual(wrapped, cloud);
  assert.equal(wrapped.id, 'openai:gpt-4o-mini+redact');
  await wrapped.judge({ system: 'For Northwind Analytics.', user: PASSAGE, meta: { hits: CHUNKS } });
  assertNoSecrets(JSON.stringify(cloud.calls), 'wrapped llm');

  // No `isLocal` at all (a third-party provider): treated as remote, the safe side.
  const unknown = { id: 'custom', async embed(texts) { this.seen = texts; return texts.map(() => [1]); } };
  const wrappedUnknown = applyRedaction(unknown, 'embeddings', config, logger);
  assert.equal(wrappedUnknown.id, 'custom+redact');
  await wrappedUnknown.embed([PASSAGE]);
  assertNoSecrets(unknown.seen[0], 'provider without isLocal');

  assert.ok(logger.lines.some((l) => l.startsWith('info: Redaction is on for the reasoning provider "openai:gpt-4o-mini"')));
  assert.ok(logger.lines.some((l) => l.startsWith('info: Redaction is on for the embeddings provider "custom"')));
  // Diagnostics count what was replaced; they never print a value.
  assertNoSecrets(logger.lines.join('\n'), 'log output');
  assert.ok(logger.lines.some((l) => /^debug: Redaction: \d+ value\(s\) replaced/.test(l)));
});

test('applyRedaction: a very short term is flagged once, because it matches inside ordinary words', () => {
  const logger = captureLogger();
  const config = { privacy: { redact: true, terms: ['ZQX', 'Northwind Analytics', 'Acme'] } };
  applyRedaction(spyLlm('{}'), 'llm', config, logger);
  applyRedaction(spyEmbedder(), 'embeddings', config, logger);
  const warnings = logger.lines.filter((l) => l.startsWith('warn:'));
  assert.equal(warnings.length, 1); // three letters: flagged; four: not
  assert.match(warnings[0], /privacy\.terms: "ZQX" is very short/);
});

test('factories: with redaction off the provider is returned unwrapped and behaves exactly as before', async () => {
  for (const privacy of [{ redact: false, terms: TERMS }, { terms: TERMS }, undefined]) {
    const config = { llm: { provider: 'mock' }, embeddings: { provider: 'mock' }, ...(privacy ? { privacy } : {}) };
    const logger = captureLogger();
    const llm = await getLlm(config, logger);
    const embedder = await getEmbedder(config, logger);

    assert.equal(llm.id, 'mock');
    assert.equal(embedder.id, 'mock');
    assert.deepEqual(Object.keys(llm), ['id', 'isLocal', 'judge']); // the provider's own object, not a wrapper
    assert.deepEqual(Object.keys(embedder), ['id', 'dim', 'isLocal', 'embed']);
    assert.deepEqual(logger.lines, []);
    // `meta` still reaches the provider (the mock depends on it), and text is not altered.
    const hits = [{ chunk: CHUNKS[0], score: 0.9 }];
    const raw = await llm.judge({ system: '', user: '', meta: { pass: 'ask', question: 'Who approves privileged access requests?', hits } });
    assert.ok(JSON.parse(raw).evidence[0].quote.includes('admin@northwind.example'));
  }
});

test('factories: with redaction on, a local provider is still returned unwrapped', async () => {
  const config = { llm: { provider: 'mock' }, embeddings: { provider: 'mock' }, privacy: { redact: true, terms: TERMS } };
  const logger = captureLogger();
  const llm = await getLlm(config, logger);
  const embedder = await getEmbedder(config, logger);
  assert.equal(llm.id, 'mock');
  assert.equal(embedder.id, 'mock');
  assert.equal(llm.isLocal, true);
  assert.equal(embedder.isLocal, true);
  assert.deepEqual(Object.keys(llm), ['id', 'isLocal', 'judge']);
  assert.equal(logger.lines.filter((l) => l.includes('Redaction is not needed')).length, 2);
});

/* ------------------------------- Ollama locality ------------------------------- */

test('isLoopbackUrl: only localhost, 127.0.0.0/8 and ::1 count as this machine', () => {
  const local = ['http://127.0.0.1:11434', 'http://localhost:11434', 'http://LOCALHOST:11434', 'http://localhost.:11434', 'http://127.0.0.53:11434',
    'http://127.255.255.254', 'http://[::1]:11434', 'http://[0:0:0:0:0:0:0:1]:11434', 'http://127.1:11434', 'http://2130706433:11434', 'https://localhost'];
  const remote = ['http://ollama.internal:11434', 'http://10.0.0.9:11434', 'http://192.168.1.20:11434', 'http://0.0.0.0:11434', 'http://128.0.0.1:11434',
    'http://localhost.example.org:11434', 'http://127.0.0.1.example.org:11434', 'http://[::ffff:127.0.0.1]:11434', 'http://[fe80::1]:11434',
    'https://gpu-box.corp.example', 'http://user:pw@gpu-box:11434', 'not a url', '', undefined];
  for (const url of local) assert.equal(isLoopbackUrl(url), true, String(url));
  for (const url of remote) assert.equal(isLoopbackUrl(url), false, String(url));
});

/** Run `fn` with OLLAMA_HOST set and fetch replaced by a fake daemon that records chat requests. */
async function withFakeOllama(host, fn) {
  const savedHost = process.env.OLLAMA_HOST;
  const savedFetch = globalThis.fetch;
  const requests = [];
  if (host === undefined) delete process.env.OLLAMA_HOST;
  else process.env.OLLAMA_HOST = host;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith('/api/tags')) return { ok: true, status: 200, json: async () => ({ models: [{ name: 'llama3.2:latest' }] }) };
    const body = JSON.parse(init.body);
    requests.push({ url: target, raw: init.body, body });
    const user = body.messages[1].content;
    const echoed = /\[\[EMAIL_\d+\]\]/.exec(user)?.[0] ?? /[\w.]+@[\w.]+/.exec(user)?.[0] ?? null;
    return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ contact: echoed }) } }) };
  };
  try {
    return await fn(requests);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedHost === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = savedHost;
  }
}

const OLLAMA_CONFIG = (redact) => ({ llm: { provider: 'ollama', model: null, temperature: 0 }, privacy: { redact, terms: TERMS } });

test('Ollama on another machine is not local: with redaction on, the request body on the wire is redacted', async () => {
  await withFakeOllama('http://gpu-box.corp.example:11434', async (requests) => {
    const logger = captureLogger();
    const llm = await getLlm(OLLAMA_CONFIG(true), logger);
    assert.equal(llm.id, 'ollama:llama3.2+redact');
    assert.equal(llm.isLocal, false);

    const raw = await llm.judge({ system: 'For Northwind Analytics.', user: PASSAGE, meta: { hits: CHUNKS } });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://gpu-box.corp.example:11434/api/chat');
    assertNoSecrets(requests[0].raw, 'HTTP body sent to the remote Ollama host');
    assert.ok(requests[0].body.messages[1].content.includes('[[EMAIL_'));
    // The reply comes back restored.
    assert.deepEqual(JSON.parse(raw), { contact: 'admin@northwind.example' });
    // The user is told the host is remote, and that redaction is applied to it.
    assert.ok(logger.lines.some((l) => l.startsWith('warn: The Ollama host (http://gpu-box.corp.example:11434) is not this machine')));
    assert.ok(logger.lines.some((l) => l.startsWith('info: Redaction is on for the reasoning provider "ollama:llama3.2"')));
  });
});

test('Ollama on this machine is local: with redaction on, nothing is wrapped and the text is sent as written', async () => {
  for (const host of [undefined, '127.0.0.1:11434', 'http://localhost:11434', 'http://[::1]:11434']) {
    await withFakeOllama(host, async (requests) => {
      const logger = captureLogger();
      const llm = await getLlm(OLLAMA_CONFIG(true), logger);
      assert.equal(llm.id, 'ollama:llama3.2', String(host));
      assert.equal(llm.isLocal, true);
      await llm.judge({ system: 's', user: PASSAGE });
      assert.equal(requests[0].body.messages[1].content, PASSAGE);
      assert.ok(logger.lines.some((l) => l.includes('Redaction is not needed for the reasoning provider "ollama:llama3.2"')));
      assert.ok(!logger.lines.some((l) => l.startsWith('warn:')));
    });
  }
});

test('Ollama on another machine without redaction: unchanged behavior, plus a warning that prompts leave the machine', async () => {
  await withFakeOllama('gpu-box:11434', async (requests) => {
    const logger = captureLogger();
    const llm = await getLlm(OLLAMA_CONFIG(false), logger);
    assert.equal(llm.id, 'ollama:llama3.2');
    assert.equal(llm.isLocal, false);
    await llm.judge({ system: 's', user: PASSAGE });
    assert.equal(requests[0].body.messages[1].content, PASSAGE);
    const warnings = logger.lines.filter((l) => l.startsWith('warn:'));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /The Ollama host \(http:\/\/gpu-box:11434\) is not this machine: prompts are sent to it over the network\. Use --redact/);
  });
});

/* ---------------------- OpenAI: what actually goes on the wire ---------------------- */

test('OpenAI providers: the HTTP request bodies contain placeholders only (real SDK, loopback server)', async (t) => {
  try {
    await import('openai');
  } catch {
    t.skip('the optional "openai" dependency is not installed');
    return;
  }

  const bodies = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      bodies.push({ path: req.url, raw, body });
      res.setHeader('content-type', 'application/json');
      if (req.url.endsWith('/chat/completions')) {
        const user = body.messages[1].content;
        const content = JSON.stringify({ contact: /\[\[EMAIL_\d+\]\]/.exec(user)?.[0] ?? null });
        res.end(JSON.stringify({ id: 'c1', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
      } else {
        const inputs = Array.isArray(body.input) ? body.input : [body.input];
        const unit = new Float32Array([0.6, 0.8]);
        // The SDK asks for base64 unless told otherwise; answer in the format requested.
        const embedding = body.encoding_format === 'base64' ? Buffer.from(unit.buffer).toString('base64') : Array.from(unit);
        res.end(JSON.stringify({ object: 'list', model: body.model, data: inputs.map((_, index) => ({ object: 'embedding', index, embedding })) }));
      }
    });
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (err) {
    t.skip(`cannot open a loopback socket here (${err.code ?? err.message})`);
    return;
  }

  const saved = { key: process.env.OPENAI_API_KEY, base: process.env.OPENAI_BASE_URL };
  process.env.OPENAI_API_KEY = 'test-key-not-real';
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  try {
    const config = {
      llm: { provider: 'openai', model: null, temperature: 0, maxTokens: 64, reasoningEffort: 'low' },
      embeddings: { provider: 'openai', model: null, batchSize: 2 },
      privacy: { redact: true, terms: TERMS },
    };
    const logger = captureLogger();

    const llm = await getLlm(config, logger);
    assert.match(llm.id, /^openai:.+\+redact$/);
    const raw = await llm.judge({ system: 'For Northwind Analytics.', user: PASSAGE, meta: { hits: CHUNKS } });
    assert.deepEqual(JSON.parse(raw), { contact: 'admin@northwind.example' });

    const embedder = await getEmbedder(config, logger);
    assert.match(embedder.id, /^openai:.+\+redact$/);
    const vectors = await embedder.embed([PASSAGE, 'Who administers db01.corp.example?', 'soc@northwind.example']);
    assert.equal(vectors.length, 3);

    // One chat request and two embedding batches reached the server.
    assert.deepEqual(bodies.map((b) => b.path), ['/v1/chat/completions', '/v1/embeddings', '/v1/embeddings']);
    for (const { path, raw: sent } of bodies) assertNoSecrets(sent, `HTTP body of ${path}`);
    assert.ok(bodies[0].body.messages[0].content.includes('[[TERM_1]]'));
    assert.deepEqual(bodies[1].body.input.length, 2);
    assert.equal(bodies[2].body.input[0], '[[EMAIL_1]]');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [name, value] of [['OPENAI_API_KEY', saved.key], ['OPENAI_BASE_URL', saved.base]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

/* ------------------ END TO END through the unchanged mapping engine ------------------ */

test('END TO END: a quote returned with placeholders is delivered with the ORIGINAL values and verifies against the original chunk', async () => {
  const embedder = redactingEmbedder(spyEmbedder(), { terms: TERMS });
  const index = await makeIndex(embedder, CHUNKS);
  const cloud = spyLlm(quotingModel);
  const llm = redactingLlm(cloud, { terms: TERMS });

  const a = await assessSubcategory({ sub: SUB, index, embedder, llm, config: ENGINE_CONFIG, engineSig: 'sig', now: NOW });

  // What the provider saw: placeholders only, and no `meta`.
  assert.equal(cloud.calls.length, 1);
  assert.deepEqual(Object.keys(cloud.calls[0]), ['system', 'user']);
  assertNoSecrets(cloud.calls[0].system, 'system prompt');
  assertNoSecrets(cloud.calls[0].user, 'task prompt');
  assert.equal(sourceFileInPrompt(cloud.calls[0].user), '[[TERM_1]]-standard.md');
  assert.ok(chunkInPrompt(cloud.calls[0].user).includes('[[EMAIL_'));

  // What the engine delivered: the unchanged verifier accepted the restored quote.
  assert.equal(a.coverage, 'partial');
  assert.equal(a.verifier_action, null);
  assert.deepEqual(a.verification, { quotes_checked: 1, quotes_verified: 1, downgraded: false });
  assert.equal(a.evidence.length, 1);
  const [evidence] = a.evidence;
  assert.equal(evidence.verified, true);
  assert.equal(evidence.attribution_corrected, false); // the restored source_file label matched as well
  assert.equal(evidence.source_file, 'northwind analytics-standard.md');
  assert.ok(PASSAGE.includes(evidence.quote), 'the delivered quote is verbatim in the original document text');
  for (const original of ['admin@northwind.example', 'db01.corp.example', 'soc@northwind.example\t10.0.0.5', 'Northwind\nAnalytics', 'https://intranet.corp.example/wiki/Access_(register)']) {
    assert.ok(evidence.quote.includes(original), `the delivered quote contains ${JSON.stringify(original)}`);
  }
  assert.ok(!evidence.quote.includes('[['), 'no placeholder is left in what is delivered');
  assert.equal(a.rationale, 'The standard names Northwind Analytics in the approval path, which is policy language.');
});

test('END TO END: the retry prompt after a malformed reply is redacted too', async () => {
  const embedder = spyEmbedder({ isLocal: true });
  const index = await makeIndex(embedder, CHUNKS);
  const cloud = spyLlm((args, n) => (n === 1 ? 'Sorry, I cannot produce JSON for admin@northwind.example.' : quotingModel(args)));
  const llm = redactingLlm(cloud, { terms: TERMS });

  const a = await assessSubcategory({ sub: SUB, index, embedder, llm, config: ENGINE_CONFIG, engineSig: 'sig', now: NOW });
  assert.equal(cloud.calls.length, 2);
  assert.match(cloud.calls[1].user, /YOUR PREVIOUS RESPONSE WAS REJECTED/);
  for (const call of cloud.calls) assertNoSecrets(call.user, 'retry prompt');
  assert.equal(a.coverage, 'partial');
  assert.ok(a.evidence[0].quote.includes('admin@northwind.example'));
});

test('END TO END (critique pass): the first-pass JSON re-sent in the critique prompt is redacted, with the same placeholders as the evidence', async () => {
  const embedder = spyEmbedder({ isLocal: true });
  const index = await makeIndex(embedder, CHUNKS);
  const cloud = spyLlm(quotingModel);
  const llm = redactingLlm(cloud, { terms: TERMS });
  const config = { ...ENGINE_CONFIG, analysis: { ...ENGINE_CONFIG.analysis, critique: true } };

  const a = await assessSubcategory({ sub: SUB, index, embedder, llm, config, engineSig: 'sig', now: NOW });

  assert.equal(cloud.calls.length, 2);
  const critique = cloud.calls[1];
  assert.deepEqual(Object.keys(critique), ['system', 'user']); // `meta.firstPass` (originals) was not forwarded
  assertNoSecrets(critique.user, 'critique prompt');

  // The embedded first-pass assessment: still one line of valid JSON, fully redacted.
  const embedded = firstPassInPrompt(critique.user);
  assertNoSecrets(embedded, 'first-pass JSON inside the critique prompt');
  const firstPass = JSON.parse(embedded);
  assert.equal(firstPass.subcategory_id, 'PR.AA-05');
  assert.equal(firstPass.coverage, 'partial');
  assert.equal(firstPass.evidence[0].source_file, sourceFileInPrompt(critique.user));
  assert.match(firstPass.rationale, /^The standard names \[\[TERM_\d+\]\] in the approval path/);
  // The model can find the first-pass quote VERBATIM in the evidence it is shown:
  // line breaks, the tab and the wrapped name carry the same placeholders there.
  assert.ok(firstPass.evidence[0].quote.includes('\n'));
  assert.ok(chunkInPrompt(critique.user).includes(firstPass.evidence[0].quote));

  // The confirmed assessment is delivered with the original values, verified.
  assert.equal(a.coverage, 'partial');
  assert.deepEqual(a.verification, { quotes_checked: 1, quotes_verified: 1, downgraded: false });
  assert.ok(PASSAGE.includes(a.evidence[0].quote));
  assert.ok(a.evidence[0].quote.includes('Northwind\nAnalytics at https://intranet.corp.example/wiki/Access_(register)'));
  assert.deepEqual(a.critique, { applied: false, note: 'Confirmed. The standard names Northwind Analytics in the approval path, which is policy language.' });
});

test('END TO END: a model that mangles a placeholder loses the quote — coverage is downgraded, nothing unverified is delivered', async () => {
  const embedder = spyEmbedder({ isLocal: true });
  const index = await makeIndex(embedder, CHUNKS);
  // Renumbers every placeholder: the restored text no longer matches the document.
  const cloud = spyLlm((args) => quotingModel(args).replace(/\[\[([A-Z]+)_(\d+)\]\]/g, (m, type, n) => `[[${type}_${Number(n) + 40}]]`));
  const llm = redactingLlm(cloud, { terms: TERMS });

  const a = await assessSubcategory({ sub: SUB, index, embedder, llm, config: ENGINE_CONFIG, engineSig: 'sig', now: NOW });
  assert.equal(a.coverage, 'none');
  assert.equal(a.verifier_action, 'downgraded_to_none_no_valid_quote');
  assert.equal(a.needs_review, true);
  assert.deepEqual(a.evidence, []);
});

test('LIMIT: a file name in the chunk labels is replaced only where a pattern or a listed term matches', async () => {
  const chunks = [
    { id: 'Contoso-IR-plan.pdf~cccccc#p1#c0', source_file: 'Contoso-IR-plan.pdf', page: 1, text: 'Incidents are reported to soc@contoso.example within one hour of detection.' },
  ];
  const embedder = spyEmbedder({ isLocal: true });
  const index = await makeIndex(embedder, chunks);

  // Not listed: the label goes out as written (the documented limit), while
  // the address inside the text is still replaced.
  const unlisted = spyLlm(quotingModel);
  await assessSubcategory({ sub: SUB, index, embedder, llm: redactingLlm(unlisted, { terms: [] }), config: ENGINE_CONFIG, engineSig: 'sig', now: NOW });
  assert.equal(sourceFileInPrompt(unlisted.calls[0].user), 'Contoso-IR-plan.pdf');
  assert.ok(unlisted.calls[0].user.includes('chunk_id: Contoso-IR-plan.pdf~cccccc#p1#c0'));
  assert.ok(!unlisted.calls[0].user.includes('soc@contoso.example'));

  // Listed: the name is replaced in the label, the chunk id and the text alike,
  // and the label the model echoes is restored to the real file name.
  const listed = spyLlm(quotingModel);
  const a = await assessSubcategory({ sub: SUB, index, embedder, llm: redactingLlm(listed, { terms: ['Contoso'] }), config: ENGINE_CONFIG, engineSig: 'sig', now: NOW });
  assert.ok(!/contoso/i.test(listed.calls[0].user));
  assert.match(sourceFileInPrompt(listed.calls[0].user), /^\[\[TERM_\d+\]\]-IR-plan\.pdf$/);
  assert.equal(a.evidence[0].source_file, 'Contoso-IR-plan.pdf');
  assert.equal(a.evidence[0].attribution_corrected, false);
  assert.equal(a.evidence[0].page, 1);
});

/* ------------------- the whole pipeline, and what toggling does ------------------- */

test('PIPELINE: ingest, analyze (with critique) and report under redaction — ids, cache, re-ingest and the provider line', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'csf-redact-'));
  try {
    const docs = join(dir, 'docs');
    mkdirSync(docs);
    writeFileSync(join(docs, 'access-standard.md'), `${PASSAGE}\n`);
    writeFileSync(join(docs, 'northwind-note.txt'), 'Incident reports go to soc@northwind.example. The on-call host is db01.corp.example (10.0.0.5).\n');

    const config = {
      ...defaultConfig(),
      docsPath: docs,
      workDir: join(dir, 'work'),
      fixedNow: NOW,
      analysis: { confidenceThreshold: 0.6, critique: true, strict: false },
      privacy: { redact: true, terms: TERMS },
    };
    const logger = captureLogger();
    const cloudEmbedder = spyEmbedder({ id: 'cloud-embed' });
    const cloudLlm = spyLlm(quotingModel, { id: 'cloud-llm' });
    const makeCtx = ({ embedder, llm, overrides = {} }) => ({
      config: { ...config, ...overrides },
      logger,
      paths: resolvePaths(config.workDir),
      getEmbedder: async () => embedder,
      getLlm: async () => llm,
      now: () => NOW,
      ui: { isInteractive: false, info() {}, warn() {}, success() {}, note() {} },
    });
    const redactedEmbedder = applyRedaction(cloudEmbedder, 'embeddings', config, logger);
    const redactedLlm = applyRedaction(cloudLlm, 'llm', config, logger);
    const ctx = makeCtx({ embedder: redactedEmbedder, llm: redactedLlm });

    // INGEST: chunk texts are embedded redacted, and the index remembers how.
    await ingest(ctx);
    const index = await readJsonSafe(ctx.paths.index);
    assert.equal(index.embedder_id, 'cloud-embed+redact');
    assert.ok(index.chunks.some((c) => c.text.includes('admin@northwind.example')), 'the local index keeps the original text');

    // ANALYZE: outcome embeddings, first pass and critique pass for all 106.
    const first = await analyze(ctx);
    assert.deepEqual([first.assessed, first.skipped, first.errors], [106, 0, 0]);
    assert.equal(cloudLlm.calls.length, 212);

    // Every string that reached either provider, across the whole run.
    for (const batch of cloudEmbedder.batches) batch.forEach((text, i) => assertNoSecrets(text, `embedding input ${i}`));
    assert.ok(cloudEmbedder.batches.flat().some((text) => text.includes('[[EMAIL_1]]')));
    for (const call of cloudLlm.calls) {
      assert.deepEqual(Object.keys(call), ['system', 'user']);
      assertNoSecrets(call.system, 'system prompt');
      assertNoSecrets(call.user, 'user prompt');
    }

    // What was stored: verified quotes in the document's own words.
    const assessments = await readJsonSafe(ctx.paths.assessments);
    const delivered = Object.values(assessments).flatMap((a) => a.evidence);
    assert.ok(delivered.length > 0);
    assert.ok(delivered.every((e) => e.verified && !e.quote.includes('[[')));
    assert.ok(delivered.some((e) => e.quote.includes('admin@northwind.example')));
    const meta = await readJsonSafe(ctx.paths.meta);
    assert.equal(meta.embedder_id, 'cloud-embed+redact');
    assert.equal(meta.llm_id, 'cloud-llm+redact');

    // Same settings again: everything is reused from the cache.
    const again = await analyze(ctx);
    assert.deepEqual([again.assessed, again.skipped], [0, 106]);

    // REPORT: the provider line shows that redaction was on.
    await report(ctx);
    const profile = await readJsonSafe(ctx.paths.currentProfile);
    assert.deepEqual(profile.providers, { embeddings: 'cloud-embed+redact', llm: 'cloud-llm+redact' });
    assert.ok(readFileSync(ctx.paths.gapReport, 'utf8').includes('- Providers: embeddings = `cloud-embed+redact`, reasoning = `cloud-llm+redact`'));

    // Redaction switched off for the reasoning provider only: a different engine
    // signature, so no cached assessment is reused.
    assert.notEqual(
      engineSignature({ embeddingModel: 'cloud-embed+redact', llmModel: 'cloud-llm+redact', topK: 6, chunkSize: 1200, chunkOverlap: 200, critique: true, indexId: index.index_id }),
      engineSignature({ embeddingModel: 'cloud-embed+redact', llmModel: 'cloud-llm', topK: 6, chunkSize: 1200, chunkOverlap: 200, critique: true, indexId: index.index_id }),
    );
    const plainLlm = spyLlm(({ user }) => JSON.stringify({ subcategory_id: subcategoryInPrompt(user), coverage: 'none', confidence: 0.2, evidence: [], rationale: 'No evidence.', needs_review: true }), { id: 'cloud-llm' });
    const recomputed = await analyze(makeCtx({ embedder: redactedEmbedder, llm: plainLlm, overrides: { analysis: { ...config.analysis, critique: true } } }));
    assert.deepEqual([recomputed.assessed, recomputed.skipped], [106, 0]);

    // Redaction switched off for the embedder: the index no longer matches, and
    // the tool asks for a re-ingest instead of comparing unlike vectors.
    await assert.rejects(
      () => analyze(makeCtx({ embedder: cloudEmbedder, llm: redactedLlm })),
      (err) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.message, 'The index was built with embedder "cloud-embed+redact" but the current embedder is "cloud-embed".');
        assert.match(err.hint, /Re-run `csf-tool ingest`/);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------- no outbound path around the factories ------------------------- */

test('STRUCTURE: providers are created only by the two factories, and network code lives only in provider modules', () => {
  const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
  const files = readdirSync(srcDir, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name: relative(srcDir, join(srcDir, name)).split('\\').join('/'), source: readFileSync(join(srcDir, name), 'utf8') }));
  const filesWhere = (pattern) => files.filter((f) => pattern.test(f.source)).map((f) => f.name).sort();

  // The modules that can send text off the machine.
  const PROVIDER_MODULES = ['embeddings/localTransformers.js', 'embeddings/openai.js', 'llm/ollama.js', 'llm/openai.js'];
  assert.deepEqual(
    filesWhere(/\bfetch\s*\(|import\(\s*['"](?:openai|@huggingface\/transformers)['"]\s*\)|['"]node:(?:https?|net|tls|dgram|http2)['"]|\bXMLHttpRequest\b|\bWebSocket\b/),
    PROVIDER_MODULES,
    'network access outside the provider modules: it would bypass redaction',
  );

  // Provider modules are loaded, and providers created, only inside the two factories ...
  const FACTORIES = ['embeddings/index.js', 'llm/index.js'];
  assert.deepEqual(filesWhere(/import\(\s*['"]\.\/(?:openai|ollama|mock|localTransformers)\.js['"]\s*\)/), FACTORIES);
  assert.deepEqual(filesWhere(/\.create(?:Llm|Embedder)\s*\(/), FACTORIES);
  assert.deepEqual(filesWhere(/from\s+['"][^'"]*(?:llm|embeddings)\/(?:openai|ollama|mock|localTransformers)\.js['"]/), []);
  // ... each of which hands a non-local provider to the redaction wrapper when the option is on ...
  for (const factory of FACTORIES) {
    const { source } = files.find((f) => f.name === factory);
    assert.match(source, /if \(!config\.privacy\?\.redact\) return \w+;\s+const \{ applyRedaction \} = await import\('\.\.\/privacy\/redactingProviders\.js'\);\s+return applyRedaction\(/);
  }
  // ... and the factories themselves are reached only through the run context.
  assert.deepEqual(filesWhere(/['"][^'"]*(?:llm|embeddings)\/index\.js['"]/), ['core/context.js']);
});
