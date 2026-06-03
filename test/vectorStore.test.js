import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topK, buildIndex } from '../src/store/vectorStore.js';
import { l2normalize, dot } from '../src/embeddings/normalize.js';

test('l2normalize returns unit-length vectors and guards zero/NaN', () => {
  const v = l2normalize([3, 4]); // -> [0.6, 0.8]
  assert.ok(Math.abs(Math.hypot(v[0], v[1]) - 1) < 1e-6);
  const z = l2normalize([0, 0]);
  assert.deepEqual(Array.from(z), [0, 0]); // no division by zero
});

test('cosine equals dot product for unit vectors', () => {
  const a = l2normalize([1, 1]);
  const b = l2normalize([1, 0]);
  assert.ok(Math.abs(dot(a, b) - Math.SQRT1_2) < 1e-6);
});

test('topK ranks by similarity and respects k', () => {
  const mk = (id, vec) => ({ id, source_file: `${id}.txt`, page: null, text: id });
  const vectors = [
    l2normalize([1, 0]),
    l2normalize([0.9, 0.1]),
    l2normalize([0, 1]),
  ];
  const index = {
    dim: 2,
    chunks: [mk('a'), mk('b'), mk('c')],
    vectors,
  };
  const results = topK(index, [1, 0], 2);
  assert.equal(results.length, 2);
  assert.equal(results[0].chunk.id, 'a'); // closest
  assert.equal(results[1].chunk.id, 'b');
  assert.ok(results[0].score >= results[1].score);
});

test('buildIndex index_id is content-derived (stable across createdAt, changes with content)', () => {
  const chunks = [{ id: 'a~h#na#c0', source_file: 'a.md', page: null, char_start: 0, char_end: 5, text: 'hello' }];
  const v = [[1, 0]];
  const common = { vectors: v, embedderId: 'mock', dim: 2, chunkParams: { size: 1, overlap: 0 } };
  const i1 = buildIndex({ chunks, ...common, createdAt: 't1' });
  const i2 = buildIndex({ chunks, ...common, createdAt: 't2' });
  assert.equal(i1.index_id, i2.index_id); // wall-clock differs -> id unchanged
  const i3 = buildIndex({ chunks: [{ ...chunks[0], text: 'world' }], ...common, createdAt: 't1' });
  assert.notEqual(i1.index_id, i3.index_id); // content differs -> id changes
});
