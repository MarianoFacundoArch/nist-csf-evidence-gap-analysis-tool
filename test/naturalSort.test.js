import { test } from 'node:test';
import assert from 'node:assert/strict';
import { naturalCompare } from '../src/util/naturalSort.js';

const sorted = (ids) => [...ids].sort(naturalCompare);

test('numbers inside identifiers are ordered by value, not character by character', () => {
  assert.deepEqual(sorted(['AC-10', 'AC-2', 'AC-1', 'AC-02', 'AC-21']), ['AC-1', 'AC-02', 'AC-2', 'AC-10', 'AC-21']);
  assert.deepEqual(sorted(['3.10', '3.9', '3.1', '12.1', '3.2']), ['3.1', '3.2', '3.9', '3.10', '12.1']);
  assert.deepEqual(
    sorted(['12.10.4.1', '9.5.1.2.1', '12.10.4', '12.2.1', '9.5.1']),
    ['9.5.1', '9.5.1.2.1', '12.2.1', '12.10.4', '12.10.4.1'],
  );
});

test('a shorter identifier sorts before the ones that extend it', () => {
  assert.deepEqual(
    sorted(['SA-15(07)', 'SA-15', 'SA-15(13)', 'SA-15(08)', 'SA']),
    ['SA', 'SA-15', 'SA-15(07)', 'SA-15(08)', 'SA-15(13)'],
  );
  assert.deepEqual(sorted(['GV.OC-01.02', 'GV.OC-01', 'GV.OC-01.01']), ['GV.OC-01', 'GV.OC-01.01', 'GV.OC-01.02']);
});

test('labelled identifiers group by label, then by number', () => {
  assert.deepEqual(
    sorted(['Mandatory Clause: 6.11', 'Annex A Controls: 5.10', 'Mandatory Clause: 6.1.2', 'Annex A Controls: 5.9', 'Mandatory Clause: 6.1']),
    ['Annex A Controls: 5.9', 'Annex A Controls: 5.10', 'Mandatory Clause: 6.1', 'Mandatory Clause: 6.1.2', 'Mandatory Clause: 6.11'],
  );
});

test('a number sorts before text at the same position', () => {
  assert.deepEqual(sorted(['A1', '1A', 'AA', '10', '9']), ['1A', '9', '10', 'A1', 'AA']);
});

test('the order is total: different spellings of one value never compare equal', () => {
  assert.notEqual(naturalCompare('1.01', '1.1'), 0);
  assert.equal(Math.sign(naturalCompare('1.01', '1.1')), -Math.sign(naturalCompare('1.1', '1.01')));
  assert.equal(naturalCompare('AC-02', 'AC-02'), 0);
  // Every input order yields the same output.
  const ids = ['03.11.01', '3.11.1', '03.11.1', '3.11.01', '3.2.1'];
  const expected = sorted(ids);
  assert.deepEqual(sorted([...ids].reverse()), expected);
  assert.deepEqual(sorted([ids[2], ids[4], ids[0], ids[3], ids[1]]), expected);
});

test('digit runs longer than a safe integer still compare by value', () => {
  assert.ok(naturalCompare('X-90071992547409931', 'X-90071992547409932') < 0);
  assert.ok(naturalCompare('X-100000000000000000000', 'X-99999999999999999999') > 0);
});

test('ordering uses code units only (no locale): uppercase before lowercase, ASCII before accents', () => {
  assert.deepEqual(sorted(['b', 'B', 'a', 'A', 'é', 'z']), ['A', 'B', 'a', 'b', 'z', 'é']);
});
