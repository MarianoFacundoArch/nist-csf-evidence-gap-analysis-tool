import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chunkDocument } from '../src/ingest/chunker.js';
import { createRedactor, detect } from '../src/privacy/redactor.js';
import { chunkProtection, assertChunksFitForRedaction } from '../src/privacy/wholeIdentifiers.js';
import { applyRedaction } from '../src/privacy/redactingProviders.js';
import { createEmbedder as createMockEmbedder } from '../src/embeddings/mock.js';
import { ingest } from '../src/actions/ingest.js';
import { analyze } from '../src/actions/analyze.js';
import { defaultConfig } from '../src/core/defaults.js';
import { resolvePaths } from '../src/core/paths.js';
import { ConfigError } from '../src/core/errors.js';
import { readJsonSafe } from '../src/util/fsx.js';

// Redaction recognizes a value by its form, one chunk at a time. These tests
// are about the one thing it cannot do on its own: recognize a value that a
// chunk boundary cut in two.

const TERMS = ['Blue Ridge Financial Services', 'Northwind'];
const NOW = '2026-01-01T00:00:00.000Z';

// Values with parts distinctive enough to search for: if any `piece` shows up
// in a redacted chunk, part of the value went out in the clear.
const VALUES = [
  { value: 'https://intranet.corp.example/wiki/ProjectTitan/runbook?session=8f3a9c2e77', pieces: ['ProjectTitan', 'runbook', '8f3a9c2e77', 'intranet'] },
  { value: 'portal.corp.example:8443/admin/ConsoleZulu', pieces: ['ConsoleZulu', 'portal.corp', '8443/admin'] },
  { value: 'backup-operator@northwind-mail.example', pieces: ['backup-operator', 'northwind-mail', 'operator@'] },
  { value: '10.111.222.133', pieces: ['111.222', '222.133'] },
  { value: '2001:db8:aaaa:bbbb::cccc:dddd', pieces: ['aaaa:bbbb', 'cccc:dddd'] },
  { value: '00:1A:2B:3C:4D:5E', pieces: ['1A:2B', '3C:4D', '4D:5E'] },
  { value: 'db01.internal.corp.example', pieces: ['db01', 'internal.corp'] },
  { value: 'Blue Ridge Financial Services', pieces: ['Ridge', 'Financial', 'Blue'] },
  { value: 'Northwind', pieces: ['orthwin', 'Northw', 'thwind'] },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FILLER = ['The', 'policy', 'requires', 'that', 'every', 'access', 'request', 'is', 'approved', 'and', 'logged', 'before', 'provisioning.',
  'Reviews', 'are', 'performed', 'quarterly', 'by', 'the', 'system', 'owner.', 'Records', 'are', 'kept', 'for', 'one', 'year.'];

/** A document of ordinary sentences with the values dropped in at random places. */
function makeDocument(rand, words) {
  const out = [];
  for (let i = 0; i < words; i++) {
    out.push(rand() < 0.06 ? VALUES[Math.floor(rand() * VALUES.length)].value : FILLER[Math.floor(rand() * FILLER.length)]);
    if (rand() < 0.03) out.push('\n');
  }
  return out.join(' ');
}

const asDoc = (text) => ({ file: 'doc.txt', path: '/abs/doc.txt', format: 'txt', segments: [{ text, page: null }] });
const keepTogether = (text) => detect(text, { terms: TERMS });

/** Pieces of values that are still readable after each chunk is redacted on its own. */
function leakedPieces(chunks) {
  const redactor = createRedactor({ terms: TERMS });
  const leaked = [];
  for (const chunk of chunks) {
    const sent = redactor.session().redact(chunk.text);
    for (const { pieces } of VALUES) for (const piece of pieces) if (sent.includes(piece)) leaked.push(piece);
  }
  return leaked;
}

/* -------------------------------- the chunker ------------------------------- */

test('chunker: without keepTogether nothing changes; with it, no chunk begins or ends inside a protected span', () => {
  const rand = mulberry32(7);
  const text = makeDocument(rand, 3000);
  const options = { size: 600, overlap: 150 };

  // The option is additive: absent, null, or a callback that protects nothing
  // all give exactly the chunks the chunker has always produced.
  const plain = chunkDocument(asDoc(text), options);
  assert.deepEqual(chunkDocument(asDoc(text), { ...options, keepTogether: null }), plain);
  assert.deepEqual(chunkDocument(asDoc(text), { ...options, keepTogether: () => [] }), plain);

  const kept = chunkDocument(asDoc(text), { ...options, keepTogether });
  const normalized = text.replace(/[ \t\f\v]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  const spans = keepTogether(normalized);
  assert.ok(spans.length > 50, 'the document really contains values');
  for (const chunk of kept) {
    for (const edge of [chunk.char_start, chunk.char_end]) {
      const inside = spans.find((span) => span.start < edge && edge < span.end);
      assert.equal(inside, undefined, `a chunk edge at ${edge} splits ${JSON.stringify(inside?.value)}`);
    }
    assert.equal(chunk.text, normalized.slice(chunk.char_start, chunk.char_end));
  }
  // Still a proper chunking: every character covered, chunks overlap or touch, ids unique.
  const covered = new Uint8Array(normalized.length);
  for (const chunk of kept) covered.fill(1, chunk.char_start, chunk.char_end);
  assert.ok(covered.every((c) => c === 1), 'no source text is dropped');
  for (let i = 1; i < kept.length; i++) {
    assert.ok(kept[i].char_start <= kept[i - 1].char_end && kept[i].char_start > kept[i - 1].char_start);
  }
  assert.equal(new Set(kept.map((c) => c.id)).size, kept.length);
  // Plain chunking of the same text does split values — the option is what prevents it.
  assert.ok(plain.some((chunk) => spans.some((span) => span.start < chunk.char_start && chunk.char_start < span.end)));
});

test('chunker: a value longer than a whole chunk is still cut, and chunking still terminates and covers the text', () => {
  const longUrl = `https://intranet.corp.example/${'segment/'.repeat(60)}end`; // ~500 characters, no whitespace
  const text = `Intro sentence here. ${longUrl} and a closing sentence that goes on for a while. `.repeat(3);
  const chunks = chunkDocument(asDoc(text), { size: 200, overlap: 50, keepTogether: (t) => detect(t) });
  assert.ok(chunks.length > 3);
  const covered = new Uint8Array(text.length);
  for (const chunk of chunks) covered.fill(1, chunk.char_start, chunk.char_end);
  assert.ok(covered.every((c) => c === 1));
  // The shortest and longest possible spans are handled too.
  for (const size of [100, 150, 1200]) {
    for (const overlap of [0, 1, 99]) {
      const out = chunkDocument(asDoc(text), { size, overlap, keepTogether: (t) => detect(t) });
      const seen = new Uint8Array(text.length);
      for (const chunk of out) seen.fill(1, chunk.char_start, chunk.char_end);
      assert.ok(seen.every((c) => c === 1), `size ${size}, overlap ${overlap}`);
    }
  }
});

test('PROPERTY: with identifiers kept whole, no piece of a value survives the redaction of any chunk (200 documents)', () => {
  let leaksWithout = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rand = mulberry32(seed * 6151);
    const text = makeDocument(rand, 900);
    const size = [300, 600, 1200][seed % 3];
    const overlap = [50, 120, 200][seed % 3];

    const kept = chunkDocument(asDoc(text), { size, overlap, keepTogether });
    assert.deepEqual(leakedPieces(kept), [], `seed ${seed}`);

    leaksWithout += leakedPieces(chunkDocument(asDoc(text), { size, overlap })).length;
  }
  // The same documents cut the ordinary way do leak pieces: this is what the option is for.
  assert.ok(leaksWithout > 20, `ordinary chunking leaked ${leaksWithout} piece(s)`);
});

/* ------------------------------ ingest and guard ----------------------------- */

function spyEmbedder({ id = 'cloud-embed', isLocal = false } = {}) {
  const mock = createMockEmbedder();
  const batches = [];
  return { id, isLocal, dim: mock.dim, batches, async embed(texts) { batches.push(texts); return mock.embed(texts); } };
}

function noneLlm({ id = 'cloud-llm', isLocal = false } = {}) {
  const calls = [];
  return {
    id,
    isLocal,
    calls,
    async judge(args) {
      calls.push(args);
      const subcategory = /^Subcategory: (\S+)$/m.exec(args.user)[1];
      return JSON.stringify({ subcategory_id: subcategory, coverage: 'none', confidence: 0.2, evidence: [], rationale: 'No evidence.', needs_review: true });
    },
  };
}

async function withDocs(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'csf-whole-'));
  try {
    const docs = join(dir, 'docs');
    mkdirSync(docs);
    writeFileSync(join(docs, 'evidence.txt'), makeDocument(mulberry32(99), 2500));
    const logger = { info() {}, warn() {}, debug() {}, error() {} };
    const makeCtx = ({ privacy, embedder, llm }) => {
      const config = { ...defaultConfig(), docsPath: docs, workDir: join(dir, 'work'), fixedNow: NOW, chunk: { size: 600, overlap: 150 }, privacy };
      return {
        config,
        logger,
        paths: resolvePaths(config.workDir),
        getEmbedder: async () => (privacy.redact ? applyRedaction(embedder, 'embeddings', config, logger) : embedder),
        getLlm: async () => (privacy.redact ? applyRedaction(llm, 'llm', config, logger) : llm),
        now: () => NOW,
        ui: { isInteractive: false, info() {}, warn() {}, success() {}, note() {} },
      };
    };
    return await fn({ makeCtx });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('ingest: with redaction on, the embeddings provider never receives a piece of a value, and the index records how it was cut', async () => {
  await withDocs(async ({ makeCtx }) => {
    const embedder = spyEmbedder();
    const ctx = makeCtx({ privacy: { redact: true, terms: TERMS }, embedder, llm: noneLlm() });
    await ingest(ctx);

    const sent = embedder.batches.flat();
    assert.ok(sent.length > 10);
    for (const text of sent) {
      for (const { pieces } of VALUES) for (const piece of pieces) assert.ok(!text.includes(piece), `${JSON.stringify(piece)} left the machine`);
    }
    const index = await readJsonSafe(ctx.paths.index);
    assert.match(index.chunk_params.wholeIdentifiers, /^[a-f0-9]{12}$/);
    assert.deepEqual({ size: index.chunk_params.size, overlap: index.chunk_params.overlap }, { size: 600, overlap: 150 });
    assert.deepEqual((await readJsonSafe(ctx.paths.meta)).chunk_params, index.chunk_params);
    // The marker identifies the term list without containing it.
    assert.ok(!JSON.stringify(index.chunk_params).includes('Northwind'));
    assert.equal(index.chunk_params.wholeIdentifiers, chunkProtection(ctx.config).wholeIdentifiers);
  });
});

test('ingest: with redaction off, chunking and the recorded parameters are exactly as before', async () => {
  await withDocs(async ({ makeCtx }) => {
    const ctx = makeCtx({ privacy: { redact: false, terms: TERMS }, embedder: spyEmbedder({ isLocal: true }), llm: noneLlm() });
    await ingest(ctx);
    const index = await readJsonSafe(ctx.paths.index);
    assert.deepEqual(index.chunk_params, { size: 600, overlap: 150 });
    const expected = chunkDocument(asDoc(makeDocument(mulberry32(99), 2500)), { size: 600, overlap: 150 });
    assert.deepEqual(index.chunks.map((c) => c.text), expected.map((c) => c.text));
  });
});

test('guard: chunks are sent through a redacting provider only if they were cut for the current settings', () => {
  const config = { privacy: { redact: true, terms: TERMS } };
  const marker = chunkProtection(config).wholeIdentifiers;
  const redacting = { id: 'openai:gpt-4o-mini+redact' };
  const local = { id: 'local-transformers:Xenova/all-MiniLM-L6-v2' };

  // Cut for these settings: fine.
  assertChunksFitForRedaction({ chunk_params: { size: 1200, overlap: 200, wholeIdentifiers: marker } }, config, [local, redacting]);
  // No provider is redacting (all local): nothing to require, whatever the index says.
  assertChunksFitForRedaction({ chunk_params: { size: 1200, overlap: 200 } }, config, [local, { id: 'ollama:llama3.2' }]);
  assertChunksFitForRedaction({}, config, []);

  // Built without redaction.
  for (const index of [{ chunk_params: { size: 1200, overlap: 200 } }, { chunk_params: null }, {}]) {
    assert.throws(
      () => assertChunksFitForRedaction(index, config, [local, redacting]),
      (err) => err instanceof ConfigError && /built without it/.test(err.message) && /csf-tool ingest/.test(err.hint) && /--redact/.test(err.hint),
    );
  }
  // Built with redaction, but for a different list of terms (added, removed, or changed).
  for (const terms of [[...TERMS, 'Contoso'], ['Northwind'], []]) {
    assert.throws(
      () => assertChunksFitForRedaction({ chunk_params: { wholeIdentifiers: marker } }, { privacy: { redact: true, terms } }, [redacting]),
      (err) => err instanceof ConfigError && /privacy\.terms\) has changed/.test(err.message),
    );
  }
  // Order, duplicates and surrounding spaces in the list do not matter.
  assertChunksFitForRedaction({ chunk_params: { wholeIdentifiers: marker } }, { privacy: { redact: true, terms: [' Northwind ', ...TERMS] } }, [redacting]);
});

test('analyze: redaction switched on AFTER ingest is refused before anything is sent — also when only the reasoning provider is remote', async () => {
  await withDocs(async ({ makeCtx }) => {
    // Ingested without redaction, with an on-device embedder.
    const localEmbedder = spyEmbedder({ id: 'local-embed', isLocal: true });
    await ingest(makeCtx({ privacy: { redact: false, terms: [] }, embedder: localEmbedder, llm: noneLlm() }));

    // Now redaction is on and the reasoning provider is a remote one. The
    // embedder is local, so its id did not change and nothing else would stop this.
    const llm = noneLlm();
    await assert.rejects(
      () => analyze(makeCtx({ privacy: { redact: true, terms: TERMS }, embedder: localEmbedder, llm })),
      (err) => err instanceof ConfigError && /Redaction is on, but the index was built without it/.test(err.message),
    );
    assert.equal(llm.calls.length, 0);

    // Re-ingested with redaction on: accepted.
    const ctx = makeCtx({ privacy: { redact: true, terms: TERMS }, embedder: localEmbedder, llm });
    await ingest(ctx);
    const done = await analyze(ctx);
    assert.equal(done.assessed, 106);
    for (const call of llm.calls) {
      for (const { pieces } of VALUES) for (const piece of pieces) assert.ok(!call.user.includes(piece), `${JSON.stringify(piece)} left the machine`);
    }

    // The list of terms changes afterwards: refused again until the next ingest.
    const later = noneLlm();
    await assert.rejects(
      () => analyze(makeCtx({ privacy: { redact: true, terms: [...TERMS, 'Contoso'] }, embedder: localEmbedder, llm: later })),
      (err) => err instanceof ConfigError && /has changed since the index was built/.test(err.message),
    );
    assert.equal(later.calls.length, 0);

    // With every provider local there is nothing to protect, and nothing is refused.
    const allLocal = makeCtx({ privacy: { redact: true, terms: ['Other'] }, embedder: localEmbedder, llm: noneLlm({ id: 'local-llm', isLocal: true }) });
    assert.equal((await analyze(allLocal)).errors, 0);
  });
});
