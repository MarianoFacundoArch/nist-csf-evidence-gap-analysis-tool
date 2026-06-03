import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkDocument } from '../src/ingest/chunker.js';

test('a short document produces a single chunk with provenance', () => {
  const doc = { file: 'note.txt', path: '/abs/note.txt', format: 'txt', segments: [{ text: 'Short body.', page: null }] };
  const chunks = chunkDocument(doc, { size: 1200, overlap: 200 });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].source_file, 'note.txt');
  assert.equal(chunks[0].page, null);
  assert.equal(chunks[0].text, 'Short body.');
});

test('a long document is split into overlapping chunks that terminate', () => {
  const sentence = 'This is a sentence about cybersecurity controls and evidence. ';
  const text = sentence.repeat(120); // ~7000 chars
  const doc = { file: 'big.md', path: '/abs/big.md', format: 'md', segments: [{ text, page: null }] };
  const chunks = chunkDocument(doc, { size: 1000, overlap: 150 });
  assert.ok(chunks.length > 1, 'should produce multiple chunks');
  // Each chunk respects the size bound (plus small boundary snap tolerance).
  for (const c of chunks) assert.ok(c.text.length <= 1000);
  // Adjacent chunks overlap (the start of chunk N+1 precedes the end of chunk N).
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i].char_start < chunks[i - 1].char_end, 'chunks should overlap');
  }
  // Chunk ids are unique.
  assert.equal(new Set(chunks.map((c) => c.id)).size, chunks.length);
});

test('each PDF page becomes its own chunk with its page number', () => {
  const doc = {
    file: 'plan.pdf',
    path: '/abs/plan.pdf',
    format: 'pdf',
    segments: [
      { text: 'Page one content about incidents.', page: 1 },
      { text: 'Page two content about recovery.', page: 2 },
    ],
  };
  const chunks = chunkDocument(doc, { size: 1200, overlap: 200 });
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.map((c) => c.page).sort(), [1, 2]);
});

test('no source text is dropped with a small stride and long no-whitespace runs', () => {
  // Regression: a short boundary snap used to skip [end, start+stride).
  let s = '';
  for (let b = 0; b < 8; b++) s += 'The control is defined here. ' + 'q'.repeat(130) + ' ';
  const doc = { file: 'p.txt', path: '/abs/p.txt', format: 'txt', segments: [{ text: s, page: null }] };
  const chunks = chunkDocument(doc, { size: 150, overlap: 99 });
  const norm = s.replace(/[ \t\f\v]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  const covered = new Array(norm.length).fill(false);
  for (const c of chunks) for (let i = c.char_start; i < c.char_end; i++) covered[i] = true;
  assert.equal(covered.filter((x) => !x).length, 0, 'every source character must be covered by some chunk');
});

test('chunk ids are unique across same-basename files in different folders', () => {
  const a = chunkDocument({ file: 'policy.txt', path: '/x/dirA/policy.txt', format: 'txt', segments: [{ text: 'Policy A about access reviews.', page: null }] });
  const b = chunkDocument({ file: 'policy.txt', path: '/x/dirB/policy.txt', format: 'txt', segments: [{ text: 'Policy B about encryption at rest.', page: null }] });
  assert.notEqual(a[0].id, b[0].id);
});

test('blank segments are skipped and absurd overlap is clamped (no infinite loop)', () => {
  const doc = {
    file: 'x.txt',
    path: '/abs/x.txt',
    format: 'txt',
    segments: [{ text: '   \n  ', page: null }, { text: 'a'.repeat(500), page: null }],
  };
  // overlap >= size should be clamped internally.
  const chunks = chunkDocument(doc, { size: 100, overlap: 999 });
  assert.ok(chunks.length >= 1);
  assert.ok(chunks.every((c) => c.text.trim().length > 0));
});
