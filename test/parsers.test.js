import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile } from '../src/ingest/parsers/index.js';
import { loadCsfCore } from '../src/csf/loader.js';

test('parses the markdown sample', async () => {
  const doc = await parseFile('examples/sample-docs/information-security-policy.md');
  assert.equal(doc.format, 'md');
  assert.equal(doc.segments.length, 1);
  assert.equal(doc.segments[0].page, null);
  assert.match(doc.segments[0].text, /Security Committee/);
});

test('parses the .docx sample (mammoth)', async () => {
  const doc = await parseFile('examples/sample-docs/asset-inventory-procedure.docx');
  assert.equal(doc.format, 'docx');
  assert.match(doc.segments[0].text, /CMDB/);
});

test('parses the .pdf sample with real page numbers', async () => {
  const doc = await parseFile('examples/sample-docs/incident-response-plan.pdf');
  assert.equal(doc.format, 'pdf');
  assert.deepEqual(doc.segments.map((s) => s.page).sort((a, b) => a - b), [1, 2]);
  assert.match(doc.segments[0].text, /incident response plan is executed/);
});

test('unsupported extensions throw a typed, friendly ParseError', async () => {
  await assert.rejects(() => parseFile('something.xyz'), /Unsupported file type/);
});

test('the shipped CSF core has all 106 subcategories across 6 functions', async () => {
  const csf = await loadCsfCore('data/csf-core.json');
  assert.equal(csf.subcategories.length, 106);
  assert.equal(csf.functions.length, 6);
  assert.equal(csf.sample, false);
  // ids are unique and well-formed
  const ids = new Set(csf.subcategories.map((s) => s.id));
  assert.equal(ids.size, 106);
  assert.ok(csf.subcategories.every((s) => /^[A-Z]{2}\.[A-Z]{2}-\d{2}$/.test(s.id)));
});
