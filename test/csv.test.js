import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../src/util/csv.js';

test('fields with commas, quotes, and newlines are RFC-4180 quoted', () => {
  const csv = toCsv(['a', 'b'], [['x,y', 'he said "hi"\nbye']], { bom: false });
  // Records are terminated by CRLF; a field's embedded "\n" stays inside its
  // quoted field (RFC-4180), so this is a single logical record.
  const records = csv.split('\r\n');
  assert.equal(records[0], 'a,b');
  assert.equal(records[1], '"x,y","he said ""hi""\nbye"');
  assert.ok(records[1].includes('""hi""')); // embedded double-quote doubled
  assert.ok(records[1].includes('\n')); // embedded newline preserved
});

test('formula-leading fields are neutralized (CSV injection guard)', () => {
  const csv = toCsv(['x'], [['=SUM(A1:A2)'], ['+1'], ['@cmd'], ['-2']], { bom: false });
  const rows = csv.split('\r\n');
  assert.ok(rows[1].startsWith("'=SUM"));
  assert.ok(rows[2].startsWith("'+1"));
  assert.ok(rows[3].startsWith("'@cmd"));
  assert.ok(rows[4].startsWith("'-2"));
});

test('BOM is prepended when requested', () => {
  const csv = toCsv(['a'], [['1']], { bom: true });
  assert.equal(csv.charCodeAt(0), 0xfeff);
});
