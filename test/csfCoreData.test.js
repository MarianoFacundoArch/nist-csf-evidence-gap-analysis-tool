import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCsfCore } from '../src/csf/loader.js';

// The shipped CSF core is a deliverable in its own right: the COMPLETE 106
// Subcategories, each carrying its official NIST Implementation Examples.
// These tests pin that completeness so a bad regeneration can't ship silently.

test('shipped csf-core.json: complete 106 Subcategories across 6 Functions', async () => {
  const csf = await loadCsfCore('data/csf-core.json', null);
  assert.equal(csf.sample, false);
  assert.equal(csf.functions.length, 6);
  assert.equal(csf.subcategories.length, 106);
  assert.equal(new Set(csf.subcategories.map((s) => s.categoryId)).size, 22);
});

test('shipped csf-core.json: every Subcategory has clean Implementation Examples', async () => {
  const csf = await loadCsfCore('data/csf-core.json', null);
  for (const s of csf.subcategories) {
    assert.ok(Array.isArray(s.implementationExamples), `${s.id} examples missing`);
    assert.ok(s.implementationExamples.length >= 1, `${s.id} has no examples`);
    for (const ex of s.implementationExamples) {
      assert.ok(ex.length > 10, `${s.id} example suspiciously short: "${ex}"`);
      assert.ok(!/^Ex\d+/.test(ex), `${s.id} example still carries its ExN marker`);
      assert.ok(!/\n/.test(ex), `${s.id} example carries raw newlines`);
    }
  }
});
