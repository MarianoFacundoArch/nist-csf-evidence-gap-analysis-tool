import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCrosswalks } from '../src/crosswalk/loader.js';
import { isNistHostedUrl, REFERENCE_ID_MAX_LENGTH } from '../src/crosswalk/crosswalk.schema.js';
import { isDefaultCrosswalk } from '../src/crosswalk/select.js';
import { loadCsfCore } from '../src/csf/loader.js';
import { naturalCompare } from '../src/util/naturalSort.js';
import { CROSSWALK_ALLOWLIST, isNullMarker, serializeCrosswalkData } from '../scripts/build-crosswalks.js';

// The shipped crosswalk data is a deliverable in its own right. These tests pin
// its invariants — provenance present, identifiers only, clean and ordered, no
// third-party links — so a bad regeneration or a hand edit cannot ship
// silently. They deliberately do NOT pin counts: the mappings change when
// their developers publish updates.

const PATH = 'data/csf-crosswalks.json';
const RAW_TEXT = readFileSync(PATH, 'utf8');
const RAW = JSON.parse(RAW_TEXT);
const LEVEL_MAPS = ['functionMappings', 'categoryMappings', 'mappings'];

/** Every (crosswalk, level, CSF element, identifiers) of the file. */
function* relationships(data) {
  for (const c of data.crosswalks) {
    for (const level of LEVEL_MAPS) {
      for (const [elementId, ids] of Object.entries(c[level])) yield { c, level, elementId, ids, where: `${c.id} ${level} ${elementId}` };
    }
  }
}

test('shipped csf-crosswalks.json: schema-valid, with provenance for the file itself', async () => {
  const data = await loadCrosswalks(PATH, null);
  assert.ok(data, 'the shipped data file must load');
  assert.equal(data.frameworkVersion, 'CSF 2.0');
  assert.match(data.source, /National Online Informative References \(OLIR\) Program/);
  assert.match(data.retrievedAt, /^\d{4}-\d{2}-\d{2}$/);
  // The citation for every mapping: NIST's catalog of informative references.
  assert.equal(data.catalogUrl, 'https://csrc.nist.gov/projects/olir/informative-reference-catalog');
  assert.match(RAW._comment, /IDENTIFIERS ONLY/);
  assert.match(RAW._comment, /no links to third-party pages/);
  assert.match(RAW._comment, /npm run build-crosswalks/);
});

test('shipped csf-crosswalks.json: exactly the allowlisted crosswalks, in allowlist order, each with provenance', async () => {
  const data = await loadCrosswalks(PATH, null);
  assert.deepEqual(data.crosswalks.map((c) => c.id), CROSSWALK_ALLOWLIST.map((a) => a.id));
  for (const [i, c] of data.crosswalks.entries()) {
    const allowed = CROSSWALK_ALLOWLIST[i];
    assert.equal(c.framework, allowed.framework);
    assert.equal(c.olirName, allowed.olirName);
    for (const field of ['framework', 'olirName', 'olirVersion', 'developer', 'releaseDate']) {
      assert.equal(typeof c[field], 'string', `${c.id}.${field} must be text`);
      assert.ok(c[field].trim().length > 0, `${c.id}.${field} must not be empty`);
    }
    assert.match(c.releaseDate, /^\d{4}-\d{2}-\d{2}$/, `${c.id} release date`);
    // The developer is the one the allowlist entry was reviewed against.
    assert.equal(c.developer, allowed.developer, `${c.id} developer`);
    // Every level is present; a mapping records something at least at one.
    for (const level of LEVEL_MAPS) assert.equal(typeof c[level], 'object', `${c.id}.${level} must be present ({} when empty)`);
    assert.ok(LEVEL_MAPS.some((level) => Object.keys(c[level]).length > 0), `${c.id} maps nothing`);
  }
});

test('shipped csf-crosswalks.json: third-party mappings are flagged, and only those — they are the opt-in ones', async () => {
  const data = await loadCrosswalks(PATH, null);
  const flagged = data.crosswalks.filter((c) => c.thirdParty).map((c) => c.id);
  assert.deepEqual(flagged, ['iso27001-2022', 'pci-dss-4.0.1']);
  assert.deepEqual(flagged, CROSSWALK_ALLOWLIST.filter((a) => a.thirdParty).map((a) => a.id));
  assert.deepEqual(data.crosswalks.filter((c) => !isDefaultCrosswalk(c)).map((c) => c.id), flagged);
});

test('shipped csf-crosswalks.json: no link to a third-party page anywhere in the file', async () => {
  const data = await loadCrosswalks(PATH, null);
  for (const c of data.crosswalks) {
    assert.ok(c.sourceUrl === null || isNistHostedUrl(c.sourceUrl), `${c.id}: sourceUrl must be null or NIST-hosted (${c.sourceUrl})`);
  }
  // The rule must keep links as well as drop them: the mappings NIST itself
  // developed are documents NIST hosts, so their links are present. (A bug that
  // nulled every link would pass the check above.)
  for (const c of data.crosswalks.filter((x) => x.developer === 'National Institute of Standards and Technology')) {
    assert.ok(isNistHostedUrl(c.sourceUrl), `${c.id}: NIST's own mapping should keep its NIST-hosted document link`);
  }
  // Belt and braces: every URL in the raw text, comment included, is NIST-hosted.
  const urls = RAW_TEXT.match(/https?:\/\/[^\s"<>)]+/g) ?? [];
  assert.ok(urls.length >= 3);
  for (const url of urls) assert.equal(isNistHostedUrl(url), true, `not NIST-hosted: ${url}`);
});

test('shipped csf-crosswalks.json: every key is a Function, Category or Subcategory of the shipped Core, in CSF order', async () => {
  const data = await loadCrosswalks(PATH, null);
  const csf = await loadCsfCore('data/csf-core.json', null);
  const order = {
    mappings: csf.subcategories.map((s) => s.id),
    categoryMappings: [...new Set(csf.subcategories.map((s) => s.categoryId))],
    functionMappings: [...new Set(csf.subcategories.map((s) => s.functionId))],
  };
  assert.deepEqual([order.mappings.length, order.categoryMappings.length, order.functionMappings.length], [106, 22, 6]);
  for (const c of data.crosswalks) {
    for (const level of LEVEL_MAPS) {
      const keys = Object.keys(c[level]);
      for (const key of keys) assert.ok(order[level].includes(key), `${c.id} ${level}: "${key}" is not in the CSF 2.0 Core at that level`);
      const positions = keys.map((key) => order[level].indexOf(key));
      assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `${c.id} ${level}: keys are not in CSF order`);
    }
  }
});

test('shipped csf-crosswalks.json: identifiers are clean, unique, naturally ordered, and never a "None" marker', async () => {
  const data = await loadCrosswalks(PATH, null);
  let total = 0;
  for (const { ids, where } of relationships(data)) {
    assert.ok(ids.length > 0, `${where}: empty list (an unmapped element must be absent)`);
    assert.equal(new Set(ids).size, ids.length, `${where}: duplicate identifier`);
    assert.deepEqual(ids, [...ids].sort(naturalCompare), `${where}: not in natural order`);
    for (const id of ids) {
      total++;
      assert.equal(typeof id, 'string', `${where}: non-text identifier`);
      assert.ok(id.length > 0, `${where}: empty identifier`);
      assert.equal(id, id.trim(), `${where}: "${id}" is not trimmed`);
      assert.ok(!/\s{2,}/.test(id) && !/[^\S ]/.test(id), `${where}: "${id}" is not single-spaced`);
      assert.ok(!/[,;]$/.test(id), `${where}: "${id}" ends with a list separator`);
      assert.ok(!isNullMarker(id), `${where}: "${id}" is a null marker`);
      assert.ok(!/\bnone\b/i.test(id), `${where}: "${id}" contains a "None" marker`);
      // Identifiers are short. Anything long would be text, which must never ship.
      assert.ok(id.length <= REFERENCE_ID_MAX_LENGTH, `${where}: "${id}" is too long to be an identifier`);
    }
  }
  assert.ok(total > 1000, 'the file should hold the mappings, not a stub');
});

test('shipped csf-crosswalks.json: a reference related only to a whole Category is present', async () => {
  // NIST's own SP 800-53 mapping relates IR-09 to the Category RS.MA and to no
  // individual Subcategory. A Subcategory-only file would silently lack it.
  // (If NIST changes this relationship, update the example knowingly.)
  const data = await loadCrosswalks(PATH, null);
  const sp80053 = data.crosswalks.find((c) => c.id === 'sp800-53-r5');
  assert.ok(sp80053.categoryMappings['RS.MA'].includes('IR-09'));
  assert.ok(!Object.values(sp80053.mappings).flat().includes('IR-09'));
});

test('shipped csf-crosswalks.json: identifiers only — no title or text field anywhere', () => {
  const allowedTop = ['_comment', 'frameworkVersion', 'source', 'retrievedAt', 'catalogUrl', 'crosswalks'];
  const allowedCrosswalk = [
    'id', 'framework', 'olirName', 'olirVersion', 'developer', 'releaseDate', 'sourceUrl', 'thirdParty',
    ...LEVEL_MAPS,
  ];
  assert.deepEqual(Object.keys(RAW), allowedTop);
  for (const c of RAW.crosswalks) {
    assert.deepEqual(Object.keys(c), allowedCrosswalk, `${c.id}: unexpected or misordered fields`);
  }
  // The maps hold lists of strings and nothing else (no nested objects that could carry text).
  for (const { ids, where } of relationships(RAW)) {
    assert.ok(Array.isArray(ids), `${where}: not a list`);
    assert.ok(ids.every((id) => typeof id === 'string'), `${where}: non-text entry`);
  }
  assert.ok(!/"(title|text|description|statement|name)"\s*:/i.test(RAW_TEXT), 'a text-bearing field name appears in the file');
});

test('shipped csf-crosswalks.json: committed in the canonical serialization (one line per CSF element)', () => {
  // Byte-for-byte what the build script writes, so a hand edit or a reformat
  // shows up here instead of as a noisy diff at the next regeneration.
  assert.equal(RAW_TEXT, serializeCrosswalkData(RAW));
  assert.ok(RAW_TEXT.endsWith('}\n'));
  assert.ok(!RAW_TEXT.includes('\r'));
});
