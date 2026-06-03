import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessSubcategory, extractJsonObject } from '../src/engine/mapping.js';
import { createEmbedder } from '../src/embeddings/mock.js';
import { createLlm } from '../src/llm/mock.js';

const CONFIG = {
  retrieval: { topK: 2 },
  analysis: { confidenceThreshold: 0.6, critique: false },
};
const NOW = '2026-01-01T00:00:00.000Z';

async function makeIndex() {
  const embedder = createEmbedder();
  const chunks = [
    {
      id: 'asset.md#c0',
      source_file: 'asset.md',
      page: null,
      text: 'Inventories of hardware managed by the organization are maintained in our CMDB. Every laptop and server is recorded and reconciled monthly.',
    },
    {
      id: 'policy.md#c0',
      source_file: 'policy.md',
      page: null,
      text: 'Our mission is to protect client data, and leadership supports the cybersecurity program.',
    },
  ];
  const vectors = await embedder.embed(chunks.map((c) => c.text));
  const index = { dim: embedder.dim, embedder_id: embedder.id, chunks, vectors: vectors.map((v) => Float32Array.from(v)) };
  return { embedder, index };
}

const sub = (id, outcome, fnId, fnName, catId, cat) => ({
  id, outcome, functionId: fnId, functionName: fnName, categoryId: catId, category: cat,
});

test('end-to-end (mock): a covered outcome yields a verified verbatim quote', async () => {
  const { embedder, index } = await makeIndex();
  const llm = createLlm();
  const a = await assessSubcategory({
    sub: sub('ID.AM-01', 'Inventories of hardware managed by the organization are maintained', 'ID', 'IDENTIFY', 'ID.AM', 'Asset Management (ID.AM)'),
    index, embedder, llm, config: CONFIG, engineSig: 'sig1', now: NOW,
  });
  assert.notEqual(a.coverage, 'none');
  assert.ok(a.evidence.length >= 1);
  assert.ok(a.evidence.every((e) => e.verified));
  // The quote is a real substring of a retrieved chunk.
  const haystack = index.chunks.map((c) => c.text).join(' ');
  assert.ok(haystack.includes(a.evidence[0].quote));
  assert.equal(a.engine_sig, 'sig1');
});

test('end-to-end (mock): the fabricated GV.OC-01 quote is downgraded to none', async () => {
  const { embedder, index } = await makeIndex();
  const llm = createLlm();
  const a = await assessSubcategory({
    sub: sub('GV.OC-01', 'The organizational mission is understood and informs cybersecurity risk management', 'GV', 'GOVERN', 'GV.OC', 'Organizational Context (GV.OC)'),
    index, embedder, llm, config: CONFIG, engineSig: 'sig1', now: NOW,
  });
  assert.equal(a.coverage, 'none');
  assert.equal(a.verifier_action, 'downgraded_to_none_no_valid_quote');
  assert.equal(a.needs_review, true);
});

test('malformed model output falls back to none + needs_review (never throws)', async () => {
  const { embedder, index } = await makeIndex();
  const badLlm = { id: 'bad', isLocal: true, async judge() { return 'not json, just prose'; } };
  const a = await assessSubcategory({
    sub: sub('PR.DS-01', 'The confidentiality, integrity, and availability of data-at-rest are protected', 'PR', 'PROTECT', 'PR.DS', 'Data Security (PR.DS)'),
    index, embedder, llm: badLlm, config: CONFIG, engineSig: 'sig1', now: NOW,
  });
  assert.equal(a.coverage, 'none');
  assert.equal(a.fallback, true);
  assert.equal(a.needs_review, true);
});

test('extractJsonObject tolerates code fences and surrounding prose', () => {
  assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJsonObject('Here you go: {"a":1} thanks'), { a: 1 });
  assert.equal(extractJsonObject('no json here'), null);
});
