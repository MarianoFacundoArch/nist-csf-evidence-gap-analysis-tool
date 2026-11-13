import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildCrosswalks,
  normalizeReferenceId,
  isNullMarker,
  serializeCrosswalkData,
} from '../scripts/build-crosswalks.js';
import { isNistHostedUrl, RESERVED_CROSSWALK_IDS } from '../src/crosswalk/crosswalk.schema.js';
import { loadCrosswalks, validateCrosswalkData } from '../src/crosswalk/loader.js';
import {
  selectCrosswalks,
  loadSelectedCrosswalks,
  isDefaultCrosswalk,
  SELECT_ALL,
  SELECT_DEFAULT,
} from '../src/crosswalk/select.js';
import { buildCrosswalkView, crosswalkDashboardData } from '../src/crosswalk/view.js';
import { buildCrosswalkListing, renderCrosswalkListing } from '../src/crosswalk/listing.js';
import { renderCrosswalkCsv } from '../src/report/crosswalkCsv.js';
import { renderCrosswalkMarkdown } from '../src/report/crosswalkMarkdown.js';
import { renderGapMarkdown } from '../src/report/gapMarkdown.js';
import { renderEvidenceCsv } from '../src/report/evidenceCsv.js';
import { renderDashboardHtml } from '../src/report/htmlDashboard.js';
import { renderReports } from '../src/report/index.js';
import { buildDocumentView } from '../src/report/documentView.js';
import { buildProfile } from '../src/report/profile.js';
import { resolvePaths } from '../src/core/paths.js';
import { fileExists } from '../src/util/fsx.js';
import { hashAssessment } from '../src/util/hash.js';
import { CrosswalkDataError } from '../src/core/errors.js';

const CATALOG_URL = 'https://csrc.nist.gov/projects/olir/informative-reference-catalog';

/* ------------------------------------------------------------------------- *
 * Part 1 — the build: NIST's responses in, the data file out.
 * A small synthetic source that reproduces every shape the real one has.
 * ------------------------------------------------------------------------- */

const CORE = {
  frameworkVersion: 'CSF 2.0',
  subcategories: [
    { id: 'GV.OC-01', outcome: 'Mission understood' },
    { id: 'GV.OC-02', outcome: 'Stakeholders understood' },
    { id: 'PR.AA-01', outcome: 'Identities managed' },
  ],
};

const ALLOWLIST = [
  { id: 'map-a', framework: 'Framework A', olirName: 'Map A', thirdParty: false, developer: 'Example Standards Body', referenceDocument: 'FW_A_1_0' },
  { id: 'map-b', framework: 'Framework B', olirName: 'Map B', thirdParty: true, developer: 'An Independent Author', referenceDocument: 'FW_B_2022' },
];

// A relationship as the service returns it: the identifier plus title/text that
// must never reach the output.
function focal(id, olirName) {
  return {
    elementIdentifier: id,
    elementTypeIdentifier: 'control',
    title: 'SECRET CONTROL TITLE',
    text: 'SECRET CONTROL TEXT',
    relationIdentifier: 'olir_focal',
    olirEntryElementId: 1,
    shortName: 'short',
    olirName,
  };
}

function subcategory(id, text, relationships = [], children = []) {
  return {
    elementIdentifier: id,
    elementTypeIdentifier: 'subcategory',
    title: '',
    text,
    elements: children,
    externalRelationships: relationships,
  };
}

function source() {
  const elements = {
    response: {
      elements: [
        // The service lists PROTECT before GOVERN here; the Core's order is GV, PR.
        {
          elementIdentifier: 'PR',
          elementTypeIdentifier: 'function',
          // Function-level relationship: recorded for the whole Function.
          externalRelationships: [focal('FN-PR-1', 'Map A')],
          elements: [
            {
              elementIdentifier: 'PR.AA',
              elementTypeIdentifier: 'category',
              // Category-level relationships: recorded for the whole Category.
              externalRelationships: [
                focal('CAT-10', 'Map A'),
                focal('CAT-2', 'Map A'),
                focal('CAT-10 ', 'Map A'), // repeat once tidied: kept once
                focal('Clause: None', 'Map A'), // null marker: not a relationship
                focal('B-CAT', 'Map B'),
              ],
              elements: [
                subcategory('PR.AA-01', 'Identities managed', [
                  focal('AC-10', 'Map A'),
                  focal('AC-2', 'Map A'),
                  focal('AC-2', 'Map A'), // exact duplicate
                  focal('AC  1 ', 'Map A'), // whitespace run + trailing space
                  focal('AC-2(1)', 'Map A'),
                  focal('B-1', ' Map B '), // name needs trimming to join
                ]),
              ],
            },
          ],
        },
        {
          elementIdentifier: 'GV',
          elementTypeIdentifier: 'function',
          externalRelationships: [focal('FN-GV-1', 'Map A'), focal('X-8', 'A mapping that is not allowlisted')],
          elements: [
            {
              elementIdentifier: 'GV.OC',
              elementTypeIdentifier: 'category',
              externalRelationships: [
                focal('CAT-1', 'Map A'),
                focal('None', 'Map B'), // only a null marker => GV.OC absent from Map B's categoryMappings
              ],
              elements: [
                subcategory('GV.OC-01', 'Mission understood', [
                  focal('Clause: None', 'Map A'), // null marker
                  focal('Annex:', 'Map A'), // null marker with an empty value
                  focal('Clause:  6.1,', 'Map A'), // whitespace run + dangling separator
                  focal('Clause: 6.1', 'Map A'), // duplicate once normalized
                  focal('X-9', 'A mapping that is not allowlisted'),
                  // Not an entry of a published mapping: no olirName.
                  { elementIdentifier: 'PM', elementTypeIdentifier: 'family', title: 'FAMILY TITLE', relationIdentifier: 'external_reference', shortName: 'SP 800-53' },
                  // The relationship type decides, not the presence of a name.
                  { ...focal('EXT-1', 'Map A'), relationIdentifier: 'external_reference' },
                  // olir_focal without an olirName cannot be attributed: skipped.
                  { elementIdentifier: 'ORPHAN', relationIdentifier: 'olir_focal' },
                ]),
                subcategory('GV.OC-02', 'Stakeholders understood', [
                  focal('None', 'Map A'), // only a null marker => Subcategory absent from Map A
                  focal('B-10', 'Map B'),
                  focal('B-9', 'Map B'),
                ]),
                // A withdrawn CSF v1.1 entry at canonical depth (not in the core).
                // Under its withdrawal note it points at the live id it moved to:
                // same id, deeper in the tree — must be ignored.
                subcategory('ID.BE-01', 'Old outcome', [], [
                  {
                    elementIdentifier: 'WR-ID.BE-01',
                    elementTypeIdentifier: 'withdraw_reason',
                    elements: [
                      {
                        elementIdentifier: 'GV.OC-01',
                        elementTypeIdentifier: 'subcategory',
                        text: 'A different text that must not be compared',
                        externalRelationships: [focal('DEEP-1', 'Map A')],
                      },
                    ],
                  },
                ]),
              ],
            },
            // A subcategory that is not under a Category is not canonical either.
            {
              elementIdentifier: 'WR-GV',
              elementTypeIdentifier: 'withdraw_reason',
              elements: [subcategory('PR.AA-01', 'Stray copy', [focal('STRAY-1', 'Map A')])],
            },
          ],
        },
      ],
    },
  };
  const olirs = {
    response: {
      informativeReferenceDocs: [
        // A page on the developer's own site: the link must not be shipped.
        { name: 'Map B', version: '2.1.0', webSite: 'https://mapping-author.example.org/map-b', releaseDate: '2025-06-30', developerId: 'An  Independent   Author', referenceFrameworkVersionIdentifier: 'FW_B_2022' },
        { name: 'A mapping that is not allowlisted', version: '1.0.0', webSite: 'https://example.org/x', releaseDate: '2025-01-01', developerId: 'Someone', referenceFrameworkVersionIdentifier: 'X_1' },
        // A submission document hosted by NIST: the link is kept as listed.
        { name: ' Map A ', version: '1.0.0', webSite: 'https://csrc.nist.gov/csrc/media/Projects/olir/documents/submissions/map-a_draft.xlsx', releaseDate: '2025-01-02', developerId: 'Example Standards Body', referenceFrameworkVersionIdentifier: 'FW_A_1_0' },
      ],
    },
  };
  return { elements, olirs };
}

function build(mutate = () => {}, overrides = {}) {
  const { elements, olirs } = source();
  const args = { elements, olirs, core: structuredClone(CORE), retrievedAt: '2026-11-13', allowlist: ALLOWLIST, ...overrides };
  mutate(args);
  return buildCrosswalks(args);
}

const functionOf = (args, id) => args.elements.response.elements.find((f) => f.elementIdentifier === id);
const categoryOf = (args, fn, id) => functionOf(args, fn).elements.find((c) => c.elementIdentifier === id);
const subOf = (args, fn, cat, id) => categoryOf(args, fn, cat).elements.find((s) => s.elementIdentifier === id);
const catalogDoc = (args, name) => args.olirs.response.informativeReferenceDocs.find((d) => d.name.trim() === name);

test('build: allowlist order and provenance taken from the catalog', () => {
  const { data } = build();
  assert.equal(data.frameworkVersion, 'CSF 2.0');
  assert.equal(data.retrievedAt, '2026-11-13');
  assert.match(data.source, /OLIR/);
  assert.equal(data.catalogUrl, CATALOG_URL);
  assert.deepEqual(data.crosswalks.map((c) => c.id), ['map-a', 'map-b']);

  const [a, b] = data.crosswalks;
  const { functionMappings: _f, categoryMappings: _c, mappings: _m, ...provenance } = a;
  assert.deepEqual(provenance, {
    id: 'map-a', framework: 'Framework A', olirName: 'Map A', olirVersion: '1.0.0',
    developer: 'Example Standards Body', releaseDate: '2025-01-02',
    sourceUrl: 'https://csrc.nist.gov/csrc/media/Projects/olir/documents/submissions/map-a_draft.xlsx',
    thirdParty: false,
  });
  assert.equal(b.thirdParty, true);
  assert.equal(b.developer, 'An Independent Author'); // catalog text is tidied too
  assert.equal(b.olirVersion, '2.1.0');
});

test('build: each relationship is kept at the level its mapping records it, in CSF order', () => {
  const { data } = build();
  const [a, b] = data.crosswalks;
  // Keys follow the CSF core's order (GV before PR) at every level, not the
  // service's tree order (PR first).
  assert.deepEqual(a.functionMappings, { GV: ['FN-GV-1'], PR: ['FN-PR-1'] });
  assert.deepEqual(a.categoryMappings, { 'GV.OC': ['CAT-1'], 'PR.AA': ['CAT-2', 'CAT-10'] });
  assert.deepEqual(Object.keys(a.mappings), ['GV.OC-01', 'PR.AA-01']);
  assert.deepEqual(Object.keys(b.mappings), ['GV.OC-02', 'PR.AA-01']);
  assert.deepEqual(b.categoryMappings, { 'PR.AA': ['B-CAT'] });
  // A level the mapping records nothing at is an empty map — always present.
  assert.deepEqual(b.functionMappings, {});

  // A Category-level relationship is not copied onto the Category's Subcategories.
  const subcategoryLevel = Object.values(a.mappings).flat();
  for (const id of ['CAT-1', 'CAT-2', 'CAT-10', 'FN-GV-1', 'FN-PR-1']) {
    assert.ok(!subcategoryLevel.includes(id), `${id} was recorded for a whole Category or Function`);
  }
});

test('build: identifiers are normalized, deduplicated, and naturally sorted', () => {
  const { data, stats } = build();
  const [a, b] = data.crosswalks;
  // "AC  1 " -> "AC 1"; duplicate "AC-2" dropped; AC-2 < AC-2(1) < AC-10.
  assert.deepEqual(a.mappings['PR.AA-01'], ['AC 1', 'AC-2', 'AC-2(1)', 'AC-10']);
  // "Clause:  6.1," and "Clause: 6.1" are one identifier once tidied.
  assert.deepEqual(a.mappings['GV.OC-01'], ['Clause: 6.1']);
  assert.deepEqual(b.mappings['GV.OC-02'], ['B-9', 'B-10']);
  // The same rules apply one level up: "CAT-10 " repeats "CAT-10"; CAT-2 < CAT-10.
  assert.deepEqual(a.categoryMappings['PR.AA'], ['CAT-2', 'CAT-10']);

  assert.deepEqual(stats['map-a'], {
    identifiers: 10,
    sourceUrlKept: true,
    function: { elements: 2, relationships: 2, kept: 2, normalized: 0, nullMarkers: 0, duplicates: 0 },
    category: { elements: 2, relationships: 5, kept: 3, normalized: 1, nullMarkers: 1, duplicates: 1 },
    subcategory: { elements: 2, relationships: 10, kept: 5, normalized: 2, nullMarkers: 3, duplicates: 2 },
  });
  assert.deepEqual(stats['map-b'], {
    identifiers: 4,
    sourceUrlKept: false,
    function: { elements: 0, relationships: 0, kept: 0, normalized: 0, nullMarkers: 0, duplicates: 0 },
    category: { elements: 1, relationships: 2, kept: 1, normalized: 0, nullMarkers: 1, duplicates: 0 },
    subcategory: { elements: 2, relationships: 3, kept: 3, normalized: 0, nullMarkers: 0, duplicates: 0 },
  });
});

test('build: null markers are dropped, and an element left with nothing is absent', () => {
  const { data } = build();
  const [a, b] = data.crosswalks;
  assert.ok(!('GV.OC-02' in a.mappings), 'a Subcategory mapped only to "None" must be absent, not empty');
  assert.ok(!('GV.OC' in b.categoryMappings), 'a Category mapped only to "None" must be absent, not empty');
  const all = data.crosswalks.flatMap((c) => [c.functionMappings, c.categoryMappings, c.mappings].flatMap((m) => Object.values(m).flat()));
  assert.ok(all.every((id) => !/none/i.test(id) && !id.endsWith(':')));
});

test('build: only olir_focal relationships of allowlisted mappings on canonical elements are kept', () => {
  const { data } = build();
  const all = data.crosswalks.flatMap((c) => [c.functionMappings, c.categoryMappings, c.mappings].flatMap((m) => Object.values(m).flat()));
  assert.ok(!all.includes('PM'), 'external_reference must be excluded');
  assert.ok(!all.includes('EXT-1'), 'external_reference must be excluded even if it names an allowlisted mapping');
  assert.ok(!all.includes('ORPHAN'), 'olir_focal without an olirName must be excluded');
  assert.ok(!all.includes('X-9') && !all.includes('X-8'), 'a mapping outside the allowlist must be excluded');
  assert.ok(!all.includes('DEEP-1'), 'the deeper copy of a live id must be ignored');
  assert.ok(!all.includes('STRAY-1'), 'a subcategory outside Function > Category must be ignored');
});

test('build: identifiers only — no title or text from the source reaches the output', () => {
  const { data } = build();
  const text = serializeCrosswalkData(data);
  assert.ok(!/SECRET|FAMILY TITLE/.test(text));
  for (const c of data.crosswalks) {
    assert.deepEqual(Object.keys(c), [
      'id', 'framework', 'olirName', 'olirVersion', 'developer', 'releaseDate', 'sourceUrl', 'thirdParty',
      'functionMappings', 'categoryMappings', 'mappings',
    ]);
  }
  // And what is written is exactly what the runtime loader accepts.
  assert.doesNotThrow(() => validateCrosswalkData(JSON.parse(text)));
});

test('build: a source link is shipped only when NIST hosts the document', () => {
  const sourceUrlOf = (webSite, name = 'Map A') => {
    const { data } = build((args) => {
      if (webSite === undefined) delete catalogDoc(args, name).webSite;
      else catalogDoc(args, name).webSite = webSite;
    });
    return data.crosswalks.find((c) => c.olirName === name).sourceUrl;
  };
  // Kept exactly as the catalog lists it (no rewriting, "_draft" included).
  assert.equal(
    sourceUrlOf('https://csrc.nist.gov/csrc/media/projects/olir/documents/submissions/x_5_2_0_draft.xlsx'),
    'https://csrc.nist.gov/csrc/media/projects/olir/documents/submissions/x_5_2_0_draft.xlsx',
  );
  assert.equal(sourceUrlOf('https://nist.gov/a'), 'https://nist.gov/a');
  // The developer's own site, a shared spreadsheet, a code-hosting repository: never shipped.
  assert.equal(sourceUrlOf('https://mapping-author.example.org/post/mapping'), null);
  assert.equal(sourceUrlOf('https://docs.example.com/spreadsheets/d/abc/edit?gid=1#gid=1'), null);
  // The host decides, not the text: these only look like NIST.
  assert.equal(sourceUrlOf('https://nist.gov.example.com/x'), null);
  assert.equal(sourceUrlOf('https://example.com/csrc.nist.gov/x'), null);
  assert.equal(sourceUrlOf('https://csrc.nist.gov@example.com/x'), null);
  // Nothing usable in the catalog: no link — the catalog itself is the citation.
  assert.equal(sourceUrlOf(''), null);
  assert.equal(sourceUrlOf(undefined), null);
  assert.equal(sourceUrlOf('javascript:alert(1)'), null);
  // Map B's catalog link is a third-party page; the developer's name is kept regardless.
  const { data } = build();
  assert.equal(data.crosswalks[1].sourceUrl, null);
  assert.equal(data.crosswalks[1].developer, 'An Independent Author');
});

test('build: deterministic — input order does not change the output, and the file round-trips', () => {
  const first = build();
  const second = build((args) => {
    // Reverse every list the transformation reads.
    args.elements.response.elements.reverse();
    for (const fn of args.elements.response.elements) {
      fn.externalRelationships?.reverse();
      for (const cat of fn.elements) {
        cat.externalRelationships?.reverse();
        for (const sub of cat.elements ?? []) sub.externalRelationships?.reverse();
      }
    }
    args.olirs.response.informativeReferenceDocs.reverse();
  });
  assert.deepEqual(second.data, first.data);

  const text = serializeCrosswalkData(first.data);
  assert.equal(serializeCrosswalkData(second.data), text);
  assert.deepEqual(JSON.parse(text), first.data);
  // One line per CSF element, identifiers inline; an empty level on one line.
  assert.ok(text.includes(
    '      "functionMappings": {\n        "GV": ["FN-GV-1"],\n        "PR": ["FN-PR-1"]\n      },\n' +
    '      "categoryMappings": {\n        "GV.OC": ["CAT-1"],\n        "PR.AA": ["CAT-2", "CAT-10"]\n      },\n' +
    '      "mappings": {\n        "GV.OC-01": ["Clause: 6.1"],\n        "PR.AA-01": ["AC 1", "AC-2", "AC-2(1)", "AC-10"]\n      }\n',
  ));
  assert.ok(text.includes('      "sourceUrl": null,\n      "thirdParty": true,\n      "functionMappings": {},\n'));
  assert.ok(text.endsWith('}\n'));
});

test('build fails loudly: a core Subcategory missing from the canonical depth', () => {
  assert.throws(
    () => build((args) => { categoryOf(args, 'GV', 'GV.OC').elements.shift(); }),
    /Expected each of the 3 Subcategories .* exactly once .* 1 are missing \(GV\.OC-01\)/,
  );
  // A category whose type changed is no longer canonical either.
  assert.throws(
    () => build((args) => { categoryOf(args, 'PR', 'PR.AA').elementTypeIdentifier = 'group'; }),
    /1 are missing \(PR\.AA-01\)/,
  );
  assert.throws(() => build((args) => { args.elements = { response: {} }; }), /no `response\.elements` list/);
});

test('build fails loudly: a core Subcategory repeated at the canonical depth', () => {
  assert.throws(
    () => build((args) => {
      categoryOf(args, 'GV', 'GV.OC').elements.push(subcategory('GV.OC-02', 'Stakeholders understood'));
    }),
    /1 are repeated \(GV\.OC-02\)/,
  );
});

test('build fails loudly: the service text differs from the shipped outcome', () => {
  assert.throws(
    () => build((args) => { subOf(args, 'GV', 'GV.OC', 'GV.OC-02').text = 'Stakeholders are understood'; }),
    /1 Subcategory text\(s\) from the service differ from the shipped outcome \(GV\.OC-02\)/,
  );
});

test('build fails loudly: an allowlisted mapping missing from, or ambiguous in, the catalog', () => {
  assert.throws(
    () => build((args) => { args.olirs.response.informativeReferenceDocs.pop(); }),
    /Crosswalk "map-a": no entry named "Map A" in NIST's catalog/,
  );
  assert.throws(
    () => build((args) => {
      const docs = args.olirs.response.informativeReferenceDocs;
      docs.push({ ...docs[0] });
    }),
    /Crosswalk "map-b": 2 catalog entries are named "Map B"/,
  );
  assert.throws(() => build((args) => { args.olirs = { response: {} }; }), /no `response\.informativeReferenceDocs` list/);
});

test('build fails loudly: an allowlisted mapping with no usable relationship', () => {
  const withMapC = (args, attach) => {
    args.olirs.response.informativeReferenceDocs.push({
      name: 'Map C', version: '1', webSite: 'https://example.org/c', releaseDate: '2025-01-01', developerId: 'C',
      referenceFrameworkVersionIdentifier: 'FW_C',
    });
    attach(args);
    args.allowlist = [
      ...ALLOWLIST,
      { id: 'map-c', framework: 'Framework C', olirName: 'Map C', thirdParty: false, developer: 'C', referenceDocument: 'FW_C' },
    ];
  };
  // In the catalog, but attached to nothing.
  assert.throws(
    () => build((args) => withMapC(args, () => {})),
    /Crosswalk "map-c": no usable relationship named "Map C" was found on any Function, Category or Subcategory \(0 raw\)/,
  );
  // Attached, but nothing survives normalization.
  assert.throws(
    () => build((args) => withMapC(args, (a) => { subOf(a, 'GV', 'GV.OC', 'GV.OC-02').externalRelationships.push(focal('Label: None', 'Map C')); })),
    /Crosswalk "map-c": .* \(1 raw\)/,
  );
  // A mapping that only records Category-level relationships is not empty.
  const { data } = build((args) => withMapC(args, (a) => { categoryOf(a, 'GV', 'GV.OC').externalRelationships.push(focal('C-1', 'Map C')); }));
  assert.deepEqual(data.crosswalks[2].categoryMappings, { 'GV.OC': ['C-1'] });
  assert.deepEqual(data.crosswalks[2].mappings, {});
});

test('build fails loudly: a relationship on an element outside the shipped core', () => {
  assert.throws(
    () => build((args) => {
      subOf(args, 'GV', 'GV.OC', 'ID.BE-01').externalRelationships.push(focal('AC-1', 'Map A'));
    }),
    /1 relationship\(s\) of allowlisted mappings belong to elements that are not in the CSF core \(ID\.BE-01\)/,
  );
  // The same holds one and two levels up: a Category or Function the core does not have.
  assert.throws(
    () => build((args) => {
      functionOf(args, 'GV').elements.push({
        elementIdentifier: 'ID.BE', elementTypeIdentifier: 'category', elements: [], externalRelationships: [focal('AC-1', 'Map B')],
      });
    }),
    /not in the CSF core \(ID\.BE\)/,
  );
  assert.throws(
    () => build((args) => {
      args.elements.response.elements.push({
        elementIdentifier: 'ZZ', elementTypeIdentifier: 'function', elements: [], externalRelationships: [focal('AC-1', 'Map A')],
      });
    }),
    /not in the CSF core \(ZZ\)/,
  );
});

test('build fails loudly: the catalog no longer says what the allowlist entry was reviewed against', () => {
  // The developer changed: the thirdParty flag may no longer be right.
  assert.throws(
    () => build((args) => { catalogDoc(args, 'Map A').developerId = 'Independent'; }),
    /Crosswalk "map-a": the catalog entry no longer matches the allowlist — developer "Independent" \(reviewed as "Example Standards Body"\)/,
  );
  // The reference document changed: the display label may no longer be right.
  assert.throws(
    () => build((args) => { catalogDoc(args, 'Map B').referenceFrameworkVersionIdentifier = 'FW_B_2025'; }),
    /Crosswalk "map-b": .* reference document "FW_B_2025" \(reviewed as "FW_B_2022"\)/,
  );
  // A misspelled flag must not silently become "not third-party".
  const { thirdParty: _flag, ...unflagged } = ALLOWLIST[1];
  assert.throws(
    () => build(() => {}, { allowlist: [ALLOWLIST[0], { ...unflagged, thirdparty: true }] }),
    /Crosswalk "map-b": the allowlist entry must set thirdParty to true or false/,
  );
});

test('build fails loudly: incomplete or unusable provenance', () => {
  assert.throws(() => build((args) => { catalogDoc(args, 'Map A').developerId = '  '; }), /Crosswalk "map-a": the catalog entry has no "developerId"/);
  assert.throws(() => build((args) => { delete catalogDoc(args, 'Map A').version; }), /has no "version"/);
  assert.throws(() => build((args) => { catalogDoc(args, 'Map B').releaseDate = '30 June 2025'; }), /releaseDate "30 June 2025" is not a YYYY-MM-DD date/);
  for (const retrievedAt of [undefined, '', '2026-11-1', '2026-13-01', '2026-02-30', '13/11/2026']) {
    assert.throws(() => build(() => {}, { retrievedAt }), /retrievedAt must be a YYYY-MM-DD date/, String(retrievedAt));
  }
});

test('build fails loudly: text where an identifier is expected, and a malformed allowlist', () => {
  const text = 'The organization develops, documents, and disseminates an access control policy that addresses purpose';
  assert.throws(
    () => build((args) => { subOf(args, 'PR', 'PR.AA', 'PR.AA-01').externalRelationships.push(focal(text, 'Map A')); }),
    /Crosswalk "map-a", PR\.AA-01: .* is too long to be an identifier/,
  );
  // The identifiers-only tripwire guards every level.
  assert.throws(
    () => build((args) => { categoryOf(args, 'PR', 'PR.AA').externalRelationships.push(focal(text, 'Map A')); }),
    /Crosswalk "map-a", PR\.AA: .* is too long to be an identifier/,
  );
  assert.throws(
    () => build((args) => { functionOf(args, 'GV').externalRelationships.push(focal(42, 'Map A')); }),
    /Crosswalk "map-a", GV: a relationship has a non-text identifier \(42\)/,
  );
  assert.throws(() => build(() => {}, { allowlist: [ALLOWLIST[0], { ...ALLOWLIST[1], id: 'map-a' }] }), /allowlist repeats/);
  assert.throws(() => build(() => {}, { core: { subcategories: [] } }), /CSF core has no subcategories/);
});

test('normalizeReferenceId tidies without changing what is identified', () => {
  // Whitespace cleanup.
  assert.equal(normalizeReferenceId('Control  5.26'), 'Control 5.26');
  assert.equal(normalizeReferenceId('  AC-02\t(01)\n'), 'AC-02 (01)');
  assert.equal(normalizeReferenceId('A B'), 'A B'); // non-breaking space is whitespace too
  // Punctuation cleanup: a dangling list separator at the end.
  assert.equal(normalizeReferenceId('Mandatory Clause:  6.1,'), 'Mandatory Clause: 6.1');
  assert.equal(normalizeReferenceId('6.1 ;'), '6.1');
  // Not rewritten: a list inside one entry, a spelling variant, a non-specific
  // entry, a number that looks wrong, punctuation that belongs to the id.
  assert.equal(normalizeReferenceId('Mandatory Clause: 7.1, 7.2'), 'Mandatory Clause: 7.1, 7.2');
  assert.equal(normalizeReferenceId('Mandatory Clause: 4.2 (a)'), 'Mandatory Clause: 4.2 (a)');
  assert.equal(normalizeReferenceId('Annex A Controls: All applicable controls'), 'Annex A Controls: All applicable controls');
  assert.equal(normalizeReferenceId('Mandatory Clause: 6.11'), 'Mandatory Clause: 6.11');
  assert.equal(normalizeReferenceId('A&A-01'), 'A&A-01');
  assert.equal(normalizeReferenceId('CP-02(08)'), 'CP-02(08)');
});

test('isNullMarker recognizes "no reference" entries and nothing else', () => {
  for (const id of ['Mandatory Clause: None', 'Annex A Controls: none', 'Annex A Controls:', 'None', 'NONE', '']) {
    assert.equal(isNullMarker(id), true, JSON.stringify(id));
  }
  for (const id of ['Mandatory Clause: 4.1', 'AC-01', 'NONE-01', 'Nonesuch', 'Annex A Controls: 5.1', 'ISO/IEC 27001:2022', 'Annex A Controls: All applicable controls']) {
    assert.equal(isNullMarker(id), false, JSON.stringify(id));
  }
});

/* ------------------------------------------------------------------------- *
 * Part 2 — runtime: loader, selection, view, renderers, report wiring.
 * ------------------------------------------------------------------------- */

/**
 * Three crosswalks. alpha records relationships at all three levels and its
 * document is NIST-hosted; beta is a third-party mapping (opt-in, no link);
 * gamma is a plain default one.
 */
function crosswalkData() {
  return {
    frameworkVersion: 'CSF 2.0',
    source: 'Test source (OLIR)',
    retrievedAt: '2026-11-13',
    catalogUrl: CATALOG_URL,
    crosswalks: [
      {
        id: 'alpha', framework: 'Alpha Controls v1', olirName: 'Alpha-to-CSF', olirVersion: '1.0.0',
        developer: 'Alpha Standards Body', releaseDate: '2025-03-01',
        sourceUrl: 'https://csrc.nist.gov/media/alpha.xlsx', thirdParty: false,
        // A-30 is related only to the whole Function GV.
        functionMappings: { GV: ['A-30'] },
        // A-1 is ALSO related to PR.AA-01 directly; A-20 only to the Category.
        categoryMappings: { 'PR.AA': ['A-20', 'A-1'], 'ZZ.ZZ': ['A-78'] },
        mappings: {
          'GV.OC-01': ['A-2', 'A-10'],
          'GV.OC-02': ['A-10'],
          'PR.AA-01': ['A-2', 'A-1'], // deliberately not in natural order
          'ZZ.ZZ-99': ['A-77'], // not part of the assessment below
        },
      },
      {
        id: 'beta', framework: 'Beta Standard 2022', olirName: 'Beta-to-CSF', olirVersion: '2.0.0',
        developer: 'An Independent Author', releaseDate: '2025-07-18', sourceUrl: null, thirdParty: true,
        // No functionMappings / categoryMappings: absent means none.
        mappings: { 'PR.AA-05': ['Clause: 4.2(a)'] },
      },
      {
        id: 'gamma', framework: 'Gamma Baseline', olirName: 'Gamma-to-CSF', olirVersion: '1.0.0',
        developer: 'Gamma Council', releaseDate: '2024-09-30', sourceUrl: null, thirdParty: false,
        functionMappings: {},
        categoryMappings: {},
        mappings: { 'GV.OC-01': ['G.1'] },
      },
    ],
  };
}

const allOf = (data) => selectCrosswalks(data, [SELECT_ALL]);

function capture() {
  const warnings = [];
  return { warnings, logger: { warn: (m) => warnings.push(m), info: () => {}, debug: () => {} } };
}

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'csf-crosswalk-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('isNistHostedUrl: the host of the parsed URL decides, not the text', () => {
  for (const url of [
    'https://nist.gov/x',
    'https://csrc.nist.gov/projects/olir/informative-reference-catalog',
    'https://CSRC.NIST.GOV/Projects',
    'http://www.nist.gov/',
    'https://csrc.nist.gov/csrc/media/x_draft.xlsx?download=1#top',
  ]) {
    assert.equal(isNistHostedUrl(url), true, url);
  }
  for (const url of [
    'https://nist.gov.example.com/x', // "nist.gov" is only a label of example.com
    'https://example.com/nist.gov', // ...or part of the path
    'https://example.com/?u=https://csrc.nist.gov/', // ...or of the query
    'https://evilnist.gov/x', // not a subdomain
    'https://nist.gov@example.com/', // userinfo, host is example.com
    'https://user:secret@csrc.nist.gov/', // credentials have no place in a citation
    'ftp://csrc.nist.gov/x',
    'javascript:alert(1)//nist.gov',
    'csrc.nist.gov/x', // not a URL
    'https://csrc.nist.gov/a b', // would break out of a Markdown autolink
    'https://csrc.nist.gov/<x>',
    '',
    null,
    undefined,
    42,
  ]) {
    assert.equal(isNistHostedUrl(url), false, String(url));
  }
});

test('loader: a missing data file is not an error — crosswalks are optional', async () => {
  await withTempDir(async (dir) => {
    assert.equal(await loadCrosswalks(join(dir, 'absent.json'), null), null);
    assert.equal(await loadCrosswalks(undefined, null), null);
  });
});

test('loader: a valid file loads without its _comment', async () => {
  await withTempDir(async (dir) => {
    const path = join(dir, 'crosswalks.json');
    await writeFile(path, JSON.stringify({ _comment: 'note', ...crosswalkData() }));
    const data = await loadCrosswalks(path, null);
    assert.deepEqual(data, crosswalkData());
  });
});

test('loader: a malformed file stops with a typed, explained error', async () => {
  await withTempDir(async (dir) => {
    const path = join(dir, 'crosswalks.json');
    const expectError = async (content, pattern) => {
      await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content));
      await assert.rejects(loadCrosswalks(path, null), (err) => {
        assert.ok(err instanceof CrosswalkDataError, `expected CrosswalkDataError, got ${err?.name}`);
        assert.match(err.message, pattern);
        assert.match(err.hint, /build-crosswalks/);
        assert.match(err.hint, /--crosswalk none/);
        return true;
      });
    };
    const mutated = (mutate) => {
      const data = crosswalkData();
      mutate(data);
      return data;
    };

    await expectError('{ not json', /not valid JSON/);
    await expectError({ crosswalks: [] }, /malformed/);
    // The identifiers-only rule is structural: text-bearing fields are rejected.
    await expectError(mutated((d) => { d.crosswalks[0].title = 'Access Control'; }), /unexpected field "title"/);
    await expectError(mutated((d) => { d.crosswalks[0].mappings['GV.OC-01'] = [{ id: 'A-1', text: 'x' }]; }), /malformed/);
    await expectError(mutated((d) => { d.crosswalks[0].categoryMappings['PR.AA'] = [{ id: 'A-1', title: 'x' }]; }), /malformed/);
    await expectError(mutated((d) => { d.crosswalks[0].mappings['GV.OC-01'] = ['A-1 ']; }), /no leading, trailing or repeated spaces/);
    await expectError(mutated((d) => { d.crosswalks[0].functionMappings.GV = ['A  1']; }), /functionMappings\/GV\/0 must be a single-line identifier .* repeated spaces/);
    // A zero-width space would make two identifiers look the same in every deliverable.
    await expectError(mutated((d) => { d.crosswalks[0].mappings['GV.OC-01'] = ['A​-1']; }), /invisible characters/);
    await expectError(mutated((d) => { d.crosswalks[0].mappings['GV.OC-01'] = ['A-1', 'A-1']; }), /duplicate items/);
    await expectError(mutated((d) => { d.crosswalks[0].mappings['GV.OC-01'] = []; }), /fewer than 1 items/);
    await expectError(mutated((d) => { d.crosswalks[0].mappings[' GV.OC-01'] = ['A-1']; }), /invalid key " GV\.OC-01"/);
    await expectError(mutated((d) => { d.crosswalks[0].releaseDate = 'March 2025'; }), /releaseDate must be a YYYY-MM-DD date/);
    await expectError(mutated((d) => { d.crosswalks[0].id = 'Alpha Controls'; }), /id must be a lowercase id/);
    await expectError(mutated((d) => { d.crosswalks[0].developer = 'line one\nline two'; }), /developer must be one line of text/);
    await expectError(mutated((d) => { d.crosswalks[0].framework = 'Alpha Controls v1 '; }), /framework must be one line of text with no leading or trailing space/);
    await expectError(mutated((d) => { d.crosswalks[0].framework = ''; }), /framework must be one line of text/);
    await expectError(mutated((d) => { delete d.crosswalks[1].thirdParty; }), /thirdParty/);
    await expectError(mutated((d) => { d.crosswalks[1].id = 'alpha'; }), /lists the crosswalk id "alpha" more than once/);
    // Links: only documents NIST itself hosts, checked on the parsed host.
    await expectError(mutated((d) => { d.crosswalks[0].sourceUrl = 'https://mapping-author.example.org/post'; }), /\/crosswalks\/0\/sourceUrl \(when not null\) must be a link to a page hosted on nist\.gov/);
    await expectError(mutated((d) => { d.crosswalks[0].sourceUrl = 'https://nist.gov.example.com/x'; }), /hosted on nist\.gov/);
    await expectError(mutated((d) => { d.crosswalks[0].sourceUrl = 'javascript:alert(1)'; }), /hosted on nist\.gov/);
    await expectError(mutated((d) => { delete d.crosswalks[0].sourceUrl; }), /sourceUrl/);
    await expectError(mutated((d) => { d.catalogUrl = 'https://example.org/catalog'; }), /\/catalogUrl must be a link to a page hosted on nist\.gov/);
    await expectError(mutated((d) => { delete d.catalogUrl; }), /catalogUrl/);
    // Words that already mean something in a selection cannot be ids.
    for (const word of RESERVED_CROSSWALK_IDS) {
      await expectError(mutated((d) => { d.crosswalks[2].id = word; }), /\/crosswalks\/2\/id is a reserved word/);
    }
  });
  assert.ok(RESERVED_CROSSWALK_IDS.includes(SELECT_ALL) && RESERVED_CROSSWALK_IDS.includes(SELECT_DEFAULT));
});

test('selection: by default every crosswalk except third-party mappings; [] selects nothing', () => {
  const data = crosswalkData();
  // beta is a third-party mapping: available, but never included unasked.
  assert.deepEqual(selectCrosswalks(data, null).crosswalks.map((c) => c.id), ['alpha', 'gamma']);
  assert.deepEqual(selectCrosswalks(data, undefined).crosswalks.map((c) => c.id), ['alpha', 'gamma']);
  assert.deepEqual(data.crosswalks.map(isDefaultCrosswalk), [true, false, true]);
  assert.equal(selectCrosswalks(data, []), null);
  assert.equal(selectCrosswalks(null, null), null);
  // A file holding only third-party mappings has an empty default set.
  assert.equal(selectCrosswalks({ ...data, crosswalks: [data.crosswalks[1]] }, null), null);
  // Provenance of the data file travels with the selection; the input is not modified.
  const selected = selectCrosswalks(data, null);
  assert.equal(selected.retrievedAt, '2026-11-13');
  assert.equal(selected.source, 'Test source (OLIR)');
  assert.equal(selected.catalogUrl, CATALOG_URL);
  assert.equal(data.crosswalks.length, 3);
});

test('selection: a list selects exactly those ids — the way a third-party mapping is chosen', () => {
  const data = crosswalkData();
  const ids = (selection) => selectCrosswalks(data, selection)?.crosswalks.map((c) => c.id) ?? [];
  assert.deepEqual(ids(['beta']), ['beta']);
  // Requested in reverse, with a repeat and different case: still data-file order, once each.
  assert.deepEqual(ids(['gamma', 'BETA', ' gamma ']), ['beta', 'gamma']);
  // "all" in the list: every crosswalk in the file, third-party included.
  assert.deepEqual(ids(['all']), ['alpha', 'beta', 'gamma']);
  assert.deepEqual(ids(['ALL']), ['alpha', 'beta', 'gamma']);
  assert.deepEqual(ids(['gamma', 'all']), ['alpha', 'beta', 'gamma']);
  // "default" in the list: the default set, to which a third-party id can be added.
  assert.deepEqual(ids(['default']), ['alpha', 'gamma']);
  assert.deepEqual(ids(['default', 'beta']), ['alpha', 'beta', 'gamma']);
  // Naming a default one alone does not pull the others in.
  assert.deepEqual(ids(['gamma']), ['gamma']);
});

test('selection: unknown ids produce ONE warning that lists the known ids, then are ignored', () => {
  const { warnings, logger } = capture();
  const selected = selectCrosswalks(crosswalkData(), ['beta', 'nope', 'iso-27001'], logger);
  assert.deepEqual(selected.crosswalks.map((c) => c.id), ['beta']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Unknown crosswalk id\(s\) ignored: nope, iso-27001\./);
  assert.match(warnings[0], /Known ids: alpha, beta, gamma \(or "default", "all"\)\./);

  // Nothing valid left: no crosswalks at all, still exactly one warning.
  const again = capture();
  assert.equal(selectCrosswalks(crosswalkData(), ['typo'], again.logger), null);
  assert.equal(again.warnings.length, 1);

  // The keywords are not ids: they never show up as unknown, and a typo next to "all" is still reported.
  const keywords = capture();
  assert.equal(selectCrosswalks(crosswalkData(), ['all', 'default'], keywords.logger).crosswalks.length, 3);
  assert.equal(keywords.warnings.length, 0);
  const mixed = capture();
  assert.equal(selectCrosswalks(crosswalkData(), ['all', 'typo'], mixed.logger).crosswalks.length, 3);
  assert.match(mixed.warnings[0], /Unknown crosswalk id\(s\) ignored: typo\./);
});

test('loadSelectedCrosswalks: "none" never reads the file; a missing file is a warning, not a failure', async () => {
  await withTempDir(async (dir) => {
    const broken = join(dir, 'broken.json');
    await writeFile(broken, '{ not json');
    // An explicit empty selection must work even when the data file is broken.
    assert.equal(await loadSelectedCrosswalks({ crosswalkPath: broken, report: { crosswalks: [] } }, null), null);
    // ...whereas asking for crosswalks from a broken file is a loud, typed error.
    await assert.rejects(loadSelectedCrosswalks({ crosswalkPath: broken, report: { crosswalks: null } }, null), CrosswalkDataError);

    const { warnings, logger } = capture();
    assert.equal(await loadSelectedCrosswalks({ crosswalkPath: join(dir, 'absent.json'), report: { crosswalks: null } }, logger), null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Crosswalk data file not found: .*absent\.json/);
    assert.match(warnings[0], /--crosswalk none/);

    const good = join(dir, 'good.json');
    await writeFile(good, JSON.stringify(crosswalkData()));
    const ids = async (crosswalks) => (await loadSelectedCrosswalks({ crosswalkPath: good, report: { crosswalks } }, logger)).crosswalks.map((c) => c.id);
    assert.deepEqual(await ids(null), ['alpha', 'gamma']);
    assert.deepEqual(await ids(['beta']), ['beta']);
    assert.deepEqual(await ids(['all']), ['alpha', 'beta', 'gamma']);
    // A config without a report section behaves like the default.
    assert.deepEqual((await loadSelectedCrosswalks({ crosswalkPath: good }, logger)).crosswalks.map((c) => c.id), ['alpha', 'gamma']);
  });
});

// --- a small assessed profile -------------------------------------------------

const NOW = '2026-01-01T00:00:00.000Z';
const CSF = {
  frameworkVersion: 'CSF 2.0',
  sample: false,
  functions: [{ id: 'GV', name: 'GOVERN' }, { id: 'PR', name: 'PROTECT' }],
  subcategories: [
    csfSub('GV.OC-01', 'Mission understood', 'GV', 'GOVERN', 'Organizational Context (GV.OC)'),
    csfSub('GV.OC-02', 'Stakeholders understood', 'GV', 'GOVERN', 'Organizational Context (GV.OC)'),
    csfSub('PR.AA-01', 'Identities managed', 'PR', 'PROTECT', 'Identity Management (PR.AA)'),
    csfSub('PR.AA-05', 'Access enforced', 'PR', 'PROTECT', 'Identity Management (PR.AA)'),
  ],
};

function csfSub(id, outcome, functionId, functionName, category) {
  return { id, outcome, function: functionName, category, functionId, functionName, categoryId: id.split('-')[0], implementationExamples: [] };
}

function assessment(id, coverage) {
  return {
    subcategory_id: id,
    coverage,
    confidence: 0.9,
    evidence: coverage === 'none' ? [] : [{ source_file: 'policy.md', page: 1, score: 0.5, quote: `evidence quote for ${id}`, verified: true }],
    rationale: `rationale for ${id}`,
    needs_review: false,
    verification: { quotes_checked: 1, quotes_verified: 1, downgraded: false },
  };
}

function accepted(a) {
  return { subcategory_id: a.subcategory_id, decision: 'accept', final_coverage: a.coverage, note: null, reviewed_by: 'r', reviewed_at: NOW, reviewed_against: hashAssessment(a) };
}

const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' }, report: { evidenceQuoteMaxChars: 300 } },
  now: () => NOW,
};

const DEFAULT_COVERAGE = { 'GV.OC-01': 'substantial', 'GV.OC-02': 'none', 'PR.AA-01': 'full', 'PR.AA-05': 'partial' };

/**
 * GV.OC-01 substantial, GV.OC-02 none, PR.AA-01 full, PR.AA-05 partial. By
 * default GV.OC-02 is unreviewed and PR.AA-01 has a stale review; the rest are
 * reviewed. Pass other id lists (or coverage levels) to change that.
 */
function profileFixture({ unreviewed = ['GV.OC-02'], stale = ['PR.AA-01'], coverage = DEFAULT_COVERAGE } = {}) {
  const assessments = Object.fromEntries(Object.entries(coverage).map(([id, level]) => [id, assessment(id, level)]));
  const reviews = {};
  for (const [id, a] of Object.entries(assessments)) {
    if (unreviewed.includes(id)) continue;
    // A review made against an older assessment is stale.
    reviews[id] = stale.includes(id) ? { ...accepted(a), reviewed_against: 'an-older-assessment' } : accepted(a);
  }
  return { assessments, reviews, profile: buildProfile(CTX, { csf: CSF, assessments, reviews, meta: {} }) };
}

const PR_AA = {
  level: 'category', id: 'PR.AA', name: 'Identity Management (PR.AA)', function: 'PROTECT', category: 'Identity Management (PR.AA)',
  outcomes: 2, coverage: { none: 0, partial: 1, substantial: 0, full: 1 }, review: { reviewed: 1, unreviewed: 0, stale: 1 },
};
const GV = {
  level: 'function', id: 'GV', name: 'GOVERN (GV)', function: 'GOVERN', category: '',
  outcomes: 2, coverage: { none: 1, partial: 0, substantial: 1, full: 0 }, review: { reviewed: 1, unreviewed: 1, stale: 0 },
};

test('view: one canonical object — references in natural order, the three levels kept apart', () => {
  const { profile } = profileFixture();
  const view = buildCrosswalkView(profile, crosswalkData());
  assert.equal(view.retrievedAt, '2026-11-13');
  assert.equal(view.source, 'Test source (OLIR)');
  assert.equal(view.catalogUrl, CATALOG_URL);
  assert.deepEqual(view.crosswalks.map((c) => c.id), ['alpha', 'beta', 'gamma']);

  const alpha = view.crosswalks[0];
  // Every reference the mapping names, whatever the level: A-20 and A-30 are
  // related only to a whole Category / Function and are listed all the same.
  assert.deepEqual(alpha.references.map((r) => r.reference_id), ['A-1', 'A-2', 'A-10', 'A-20', 'A-30']);

  // Subcategory-level relationships, in CSF order.
  assert.deepEqual(alpha.references[1].related, [
    { subcategory_id: 'GV.OC-01', function: 'GOVERN', category: 'Organizational Context (GV.OC)', coverage: 'substantial', review_status: 'reviewed' },
    { subcategory_id: 'PR.AA-01', function: 'PROTECT', category: 'Identity Management (PR.AA)', coverage: 'full', review_status: 'stale' },
  ]);
  assert.deepEqual(alpha.references[1].groups, []);
  assert.deepEqual(alpha.references[2].related.map((r) => r.subcategory_id), ['GV.OC-01', 'GV.OC-02']);

  // Category- and Function-level relationships: the element and how its
  // outcomes are distributed — never a single coverage value.
  assert.deepEqual(alpha.references[0].related.map((r) => r.subcategory_id), ['PR.AA-01']);
  assert.deepEqual(alpha.references[0].groups, [PR_AA]);
  assert.deepEqual(alpha.references[3], { reference_id: 'A-20', has_gap: true, pending_review: true, related: [], groups: [PR_AA] });
  assert.deepEqual(alpha.references[4], { reference_id: 'A-30', has_gap: true, pending_review: true, related: [], groups: [GV] });
  for (const r of alpha.references) for (const g of r.groups) assert.ok(!('subcategory_coverage' in g) && typeof g.coverage === 'object');

  assert.deepEqual(alpha.summary, {
    references: 5,
    relationships: 8, // 5 Subcategory-level + 3 Category/Function-level
    subcategoriesMapped: 3,
    totalSubcategories: 4,
    categoriesMapped: 1,
    totalCategories: 2,
    functionsMapped: 1,
    totalFunctions: 2,
    referencesWithGap: 4, // every reference except A-2
    referencesPendingReview: 5,
    subcategoriesNotAssessed: 1, // ZZ.ZZ-99 is not in this assessment
    groupsNotAssessed: 1, // nor is Category ZZ.ZZ
  });
  // Per-element ids are sorted even though the data file was not.
  assert.deepEqual(alpha.bySubcategory, { 'GV.OC-01': ['A-2', 'A-10'], 'GV.OC-02': ['A-10'], 'PR.AA-01': ['A-1', 'A-2'] });
  assert.deepEqual(alpha.byCategory, { 'PR.AA': ['A-1', 'A-20'] });
  assert.deepEqual(alpha.byFunction, { GV: ['A-30'] });

  // The view carries provenance and never a figure about a reference itself.
  assert.equal(alpha.sourceUrl, 'https://csrc.nist.gov/media/alpha.xlsx');
  assert.equal(view.crosswalks[1].thirdParty, true);
  assert.equal(view.crosswalks[1].sourceUrl, null);
  assert.equal(view.crosswalks[1].developer, 'An Independent Author');
  assert.ok(!JSON.stringify(view).includes('pct'));
  assert.ok(!('referencesAllAddressed' in alpha.summary), 'no count of "all covered" references');
});

test('view: a gap is counted over the EXPANDED set — a whole Category or Function means every outcome under it', () => {
  const { profile } = profileFixture();
  const [alpha] = buildCrosswalkView(profile, crosswalkData()).crosswalks;
  const byId = Object.fromEntries(alpha.references.map((r) => [r.reference_id, r]));

  // A-1 is present at two levels. Directly it relates only to PR.AA-01, which
  // is full — no gap there. But the mapping also relates it to the whole
  // Category PR.AA, and PR.AA-05 is partial: A-1 has a gap among its related outcomes.
  assert.deepEqual(byId['A-1'].related.map((r) => [r.subcategory_id, r.coverage]), [['PR.AA-01', 'full']]);
  assert.equal(byId['A-1'].has_gap, true);
  // A-2 relates to GV.OC-01 (substantial) and PR.AA-01 (full) and to no group: no gap.
  assert.equal(byId['A-2'].has_gap, false);
  // A-30 relates only to Function GV; GV.OC-02 is none.
  assert.equal(byId['A-30'].has_gap, true);
  // Review state expands the same way: A-20 has no direct outcome, PR.AA-01's review is stale.
  assert.equal(byId['A-20'].pending_review, true);

  // The same mapping against an assessment where PR.AA is fully addressed:
  // the Category no longer contributes a gap, for A-1 and for A-20 alike.
  const addressed = profileFixture({ coverage: { ...DEFAULT_COVERAGE, 'PR.AA-05': 'substantial' }, unreviewed: [], stale: [] });
  const [again] = buildCrosswalkView(addressed.profile, crosswalkData()).crosswalks;
  const after = Object.fromEntries(again.references.map((r) => [r.reference_id, r]));
  assert.equal(after['A-1'].has_gap, false);
  assert.equal(after['A-20'].has_gap, false);
  assert.equal(after['A-20'].pending_review, false);
  assert.equal(after['A-30'].has_gap, true); // GV.OC-02 is still none
  assert.equal(again.summary.referencesWithGap, 2); // A-10 and A-30
});

test('view: a gap is none OR partial; substantial and full are not', () => {
  const { profile } = profileFixture();
  const [, beta, gamma] = buildCrosswalkView(profile, crosswalkData()).crosswalks;
  // beta's only reference relates to PR.AA-05, which is partial (and reviewed).
  assert.deepEqual(beta.references.map((r) => [r.reference_id, r.has_gap, r.pending_review]), [['Clause: 4.2(a)', true, false]]);
  assert.deepEqual([beta.summary.referencesWithGap, beta.summary.referencesPendingReview], [1, 0]);
  // A crosswalk without group-level maps simply has none.
  assert.deepEqual([beta.byCategory, beta.byFunction, beta.summary.categoriesMapped, beta.summary.functionsMapped], [{}, {}, 0, 0]);
  // gamma's only reference relates to GV.OC-01, which is substantial.
  assert.deepEqual(gamma.references.map((r) => [r.reference_id, r.has_gap]), [['G.1', false]]);
  assert.equal(gamma.summary.referencesWithGap, 0);

  // Every coverage level, one reference each.
  const each = profileFixture({ coverage: { 'GV.OC-01': 'none', 'GV.OC-02': 'partial', 'PR.AA-01': 'substantial', 'PR.AA-05': 'full' } });
  const data = crosswalkData();
  data.crosswalks = [{ ...data.crosswalks[2], mappings: { 'GV.OC-01': ['R-none'], 'GV.OC-02': ['R-partial'], 'PR.AA-01': ['R-substantial'], 'PR.AA-05': ['R-full'] } }];
  const [only] = buildCrosswalkView(each.profile, data).crosswalks;
  assert.deepEqual(
    Object.fromEntries(only.references.map((r) => [r.reference_id, r.has_gap])),
    { 'R-full': false, 'R-none': true, 'R-partial': true, 'R-substantial': false },
  );
});

test('view: relationships to elements outside the assessment are left out, and counted', () => {
  const { profile } = profileFixture();
  const data = crosswalkData();
  data.crosswalks = [{
    ...data.crosswalks[0],
    functionMappings: { ZZ: ['A-79'] },
    categoryMappings: { 'ZZ.ZZ': ['A-78'] },
    mappings: { 'ZZ.ZZ-99': ['A-77'], 'ZZ.ZZ-98': ['A-78'] },
  }];
  const view = buildCrosswalkView(profile, data);
  assert.deepEqual(view.crosswalks[0].references, []);
  assert.equal(view.crosswalks[0].summary.subcategoriesNotAssessed, 2);
  assert.equal(view.crosswalks[0].summary.groupsNotAssessed, 2);
  assert.equal(view.crosswalks[0].summary.references, 0);
  // Renderers explain the empty result instead of printing an empty table.
  const md = renderCrosswalkMarkdown(profile, view);
  assert.ok(md.includes('- Not shown: this mapping also covers 2 Subcategory(ies) and 2 Category(ies) or Function(s) that are not part of this assessment.\n'));
  assert.ok(md.includes('_This mapping has no reference related to an outcome in this assessment._'));
  assert.ok(!md.includes('| Reference |'));
});

const CSV_HEADER =
  'crosswalk_id,framework,reference,reference_id,csf_level,csf_id,function,category,' +
  'subcategory_coverage,subcategory_review_status,mapping_developer,mapping_release_date,third_party_mapping';

function csvLines(csv) {
  assert.ok(csv.startsWith('﻿'), 'UTF-8 BOM, like evidence-map.csv');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.pop(), '', 'ends with CRLF');
  return lines;
}

test('crosswalk.csv: one row per relationship — Subcategory, Category and Function rows, in the documented order', () => {
  const { profile } = profileFixture();
  const lines = csvLines(renderCrosswalkCsv(buildCrosswalkView(profile, crosswalkData())));
  assert.equal(lines[0], CSV_HEADER);
  assert.deepEqual(lines.slice(1), [
    // A-1: its Subcategory row first, then the Category it is related to as a whole.
    'alpha,Alpha Controls v1,alpha:A-1,A-1,subcategory,PR.AA-01,PROTECT,Identity Management (PR.AA),full,stale,Alpha Standards Body,2025-03-01,no',
    'alpha,Alpha Controls v1,alpha:A-1,A-1,category,PR.AA,PROTECT,Identity Management (PR.AA),,,Alpha Standards Body,2025-03-01,no',
    'alpha,Alpha Controls v1,alpha:A-2,A-2,subcategory,GV.OC-01,GOVERN,Organizational Context (GV.OC),substantial,reviewed,Alpha Standards Body,2025-03-01,no',
    'alpha,Alpha Controls v1,alpha:A-2,A-2,subcategory,PR.AA-01,PROTECT,Identity Management (PR.AA),full,stale,Alpha Standards Body,2025-03-01,no',
    'alpha,Alpha Controls v1,alpha:A-10,A-10,subcategory,GV.OC-01,GOVERN,Organizational Context (GV.OC),substantial,reviewed,Alpha Standards Body,2025-03-01,no',
    'alpha,Alpha Controls v1,alpha:A-10,A-10,subcategory,GV.OC-02,GOVERN,Organizational Context (GV.OC),none,unreviewed,Alpha Standards Body,2025-03-01,no',
    // A-20 and A-30 exist only at Category / Function level.
    'alpha,Alpha Controls v1,alpha:A-20,A-20,category,PR.AA,PROTECT,Identity Management (PR.AA),,,Alpha Standards Body,2025-03-01,no',
    'alpha,Alpha Controls v1,alpha:A-30,A-30,function,GV,GOVERN,,,,Alpha Standards Body,2025-03-01,no',
    'beta,Beta Standard 2022,beta:Clause: 4.2(a),Clause: 4.2(a),subcategory,PR.AA-05,PROTECT,Identity Management (PR.AA),partial,reviewed,An Independent Author,2025-07-18,yes',
    'gamma,Gamma Baseline,gamma:G.1,G.1,subcategory,GV.OC-01,GOVERN,Organizational Context (GV.OC),substantial,reviewed,Gamma Council,2024-09-30,no',
  ]);
});

test('crosswalk.csv: a Category or Function row never carries a coverage value', () => {
  const { profile } = profileFixture();
  const view = buildCrosswalkView(profile, crosswalkData());
  const lines = csvLines(renderCrosswalkCsv(view));
  const columns = lines[0].split(',');
  const col = (name) => columns.indexOf(name);
  const rows = lines.slice(1).map((line) => line.split(','));
  const kinds = { subcategory: 0, category: 0, function: 0 };
  for (const row of rows) {
    const level = row[col('csf_level')];
    kinds[level]++;
    const coverage = row[col('subcategory_coverage')];
    const review = row[col('subcategory_review_status')];
    if (level === 'subcategory') {
      assert.match(coverage, /^(none|partial|substantial|full)$/);
      assert.match(review, /^(reviewed|unreviewed|stale)$/);
      assert.match(row[col('csf_id')], /^[A-Z]{2}\.[A-Z]{2}-\d{2}$/);
    } else {
      assert.equal(coverage, '', `${level} row with a coverage value`);
      assert.equal(review, '', `${level} row with a review status`);
      assert.match(row[col('csf_id')], level === 'category' ? /^[A-Z]{2}\.[A-Z]{2}$/ : /^[A-Z]{2}$/);
    }
    // The composite key repeats the identifier with its crosswalk id.
    assert.equal(row[col('reference')], `${row[col('crosswalk_id')]}:${row[col('reference_id')]}`);
  }
  assert.deepEqual(kinds, { subcategory: 7, category: 2, function: 1 });
  // One row per relationship: the row count is the view's own count.
  assert.equal(rows.length, view.crosswalks.reduce((n, c) => n + c.summary.relationships, 0));
});

test('crosswalk.csv: identifiers go through the shared CSV writer, and `reference` cannot be read as a number', () => {
  const { profile } = profileFixture();
  const data = crosswalkData();
  data.crosswalks = [{ ...data.crosswalks[2], mappings: { 'GV.OC-01': ['=HYPERLINK("http://x")', 'Clause 7.1, 7.2', '3.10'] } }];
  const csv = renderCrosswalkCsv(buildCrosswalkView(profile, data));
  assert.ok(csv.includes(',"\'=HYPERLINK(""http://x"")",'), 'a leading "=" is defused and the field quoted');
  assert.ok(csv.includes(',"Clause 7.1, 7.2",'), 'a comma inside an identifier is quoted');
  // A numeric-looking identifier is written verbatim in reference_id — and
  // next to it in a form no spreadsheet turns into the number 3.1.
  assert.ok(csv.includes(',gamma:3.10,3.10,subcategory,GV.OC-01,'));
  for (const line of csvLines(csv).slice(1)) assert.ok(!/^\d+(\.\d+)?$/.test(line.split(',')[2]));
});

test('crosswalk.md: says what a mapping is and is not, before anything else', () => {
  const { profile } = profileFixture();
  const md = renderCrosswalkMarkdown(profile, buildCrosswalkView(profile, crosswalkData()));
  const firstTable = md.indexOf('| Crosswalk |');
  assert.ok(firstTable > 0);
  for (const statement of [
    '**Related, not equivalent.** A mapping records that a CSF 2.0 outcome and a reference in another framework are related.',
    'It does not say that achieving one satisfies the other.',
    '**Coverage is about the CSF outcome only.**',
    'It is not a determination of conformance with the referenced control or requirement',
    '**Three levels of relationship.** A mapping relates a reference to one CSF outcome (a Subcategory), to a whole Category, or to a whole Function.',
    'it does not pick one, because the mapping does not',
    '**Identifiers only.** No control or requirement text from the referenced frameworks is reproduced here.',
    '**Who made each mapping.** The mappings come from: Test source (OLIR).',
    'not by this project, which adds no mappings of its own',
    'Inclusion here is not an endorsement by NIST or by this project.',
  ]) {
    const at = md.indexOf(statement);
    assert.ok(at >= 0, `missing statement: ${statement}`);
    assert.ok(at < firstTable, `statement must come before the data: ${statement}`);
  }
  // The earlier "only Subcategory-level relationships are listed" notice is gone: all three levels are shown.
  assert.ok(!/Subcategory-level relationships only|Not shown: \d+ relationship/.test(md));
});

test('crosswalk.md: never a percentage or anything that reads like a conformance score', () => {
  const { profile } = profileFixture();
  const md = renderCrosswalkMarkdown(profile, buildCrosswalkView(profile, crosswalkData()));
  assert.ok(!md.includes('%'), 'no percentage anywhere in the report');
  assert.ok(!/\bcomplian(t|ce)\b/i.test(md), 'the report does not use compliance vocabulary');
  assert.ok(!/\b(score|rating|pass(ed)?|fail(ed)?|satisfied by|met by)\b/i.test(md.replace(/whether a reference is satisfied/g, '')));
  // No count of references whose related outcomes are all covered: it reads as "these are fine".
  assert.ok(!/all substantial or full/i.test(md));
  // Every use of "conformance" is a denial.
  const uses = md.match(/[^.]*\bconformance\b[^.]*\./g) ?? [];
  assert.ok(uses.length >= 4);
  for (const sentence of uses) assert.match(sentence, /\bnot\b/, `"conformance" used without a denial: ${sentence.trim()}`);
  // The counts come with their caveat, once per crosswalk.
  assert.equal(md.split('they do not say whether a reference is satisfied').length - 1, 3);
});

test('crosswalk.md: provenance per crosswalk cites the catalog; a document link only when NIST hosts it', () => {
  const { profile } = profileFixture();
  const md = renderCrosswalkMarkdown(profile, buildCrosswalkView(profile, crosswalkData()));
  const section = (heading, next) => md.slice(md.indexOf(heading), next ? md.indexOf(next) : undefined);
  const alpha = section('## Alpha Controls v1', '## Beta Standard 2022');
  const beta = section('## Beta Standard 2022', '## Gamma Baseline');
  const gamma = section('## Gamma Baseline');

  assert.ok(md.includes('- CSF source: NIST CPRT — CSF 2.0 Core (public domain).\n'));
  assert.ok(md.includes('- Mapping source: Test source (OLIR) — retrieved 2026-11-13\n'));
  assert.ok(md.includes(`- Catalog where each mapping and its developer are listed: <${CATALOG_URL}>\n`));
  assert.ok(md.includes('- Coverage: from the Current Profile (current-profile.json) — reviewed 2, unreviewed 1, stale 1\n'));
  assert.ok(md.includes('- Crosswalks included: 3\n'));
  assert.ok(md.includes('| `alpha` | Alpha Controls v1 | Alpha Standards Body | 2025-03-01 | 5 | 3 of 4 |\n'));

  assert.ok(alpha.startsWith('## Alpha Controls v1\n'));
  assert.ok(alpha.includes('- Crosswalk id: `alpha`\n'));
  assert.ok(alpha.includes('- Mapping: Alpha-to-CSF, version 1.0.0, released 2025-03-01\n'));
  assert.ok(alpha.includes('- Mapping developer (as listed in the mapping source): Alpha Standards Body\n'));
  assert.ok(alpha.includes('- Relationships recorded for: 3 of 4 Subcategories, 1 of 2 Categories, 1 of 2 Functions\n'));
  assert.ok(alpha.includes('- Not shown: this mapping also covers 1 Subcategory(ies) and 1 Category(ies) or Function(s) that are not part of this assessment.\n'));
  // Every crosswalk cites the catalog...
  for (const part of [alpha, beta, gamma]) {
    assert.ok(part.includes(`- Catalog where this mapping and its developer are listed: <${CATALOG_URL}>\n`));
  }
  // ...and only the one whose document NIST hosts links to it.
  assert.ok(alpha.includes('- Mapping document (hosted by NIST): <https://csrc.nist.gov/media/alpha.xlsx>\n'));
  assert.ok(!beta.includes('Mapping document') && !gamma.includes('Mapping document'));
  // The only links in the whole report are NIST-hosted.
  for (const link of md.match(/<https?:[^>]+>/g)) assert.equal(isNistHostedUrl(link.slice(1, -1)), true, link);
  assert.ok(!gamma.includes('Not shown'));
});

test('crosswalk.md: third-party mappings are labeled everywhere they appear, and only they', () => {
  const { profile } = profileFixture();
  const md = renderCrosswalkMarkdown(profile, buildCrosswalkView(profile, crosswalkData()));
  // beta: overview row, heading, and an explicit line that says what "as published" implies.
  assert.ok(md.includes('| `beta` | Beta Standard 2022 — third-party mapping | An Independent Author | 2025-07-18 | 1 | 1 of 4 |\n'));
  assert.ok(md.includes('## Beta Standard 2022 (third-party mapping)\n'));
  assert.ok(md.includes(
    "- **Third-party mapping — not produced by the framework's publisher.** It is reproduced as published, " +
    'including any entries that are non-specific or appear to be errors.\n',
  ));
  assert.equal(md.split('**Third-party mapping').length - 1, 1);
  assert.ok(!/Alpha Controls v1[^\n]*third-party/.test(md));
  assert.ok(!/Gamma Baseline[^\n]*third-party/.test(md));
});

test('crosswalk.md: provenance sentences come from the data file, not from fixed text', () => {
  const { profile } = profileFixture();
  const data = crosswalkData();
  data.source = 'Another build of the catalog data';
  data.catalogUrl = 'https://csrc.nist.gov/another/catalog-page';
  const md = renderCrosswalkMarkdown(profile, buildCrosswalkView(profile, data));
  assert.ok(md.includes('**Who made each mapping.** The mappings come from: Another build of the catalog data.'));
  assert.ok(md.includes('- Mapping source: Another build of the catalog data — retrieved 2026-11-13\n'));
  assert.equal(md.split('<https://csrc.nist.gov/another/catalog-page>').length - 1, 4); // overview + 3 crosswalks
  assert.ok(!md.includes('OLIR'));
  assert.ok(!md.includes(CATALOG_URL));
});

test('crosswalk.md: the count and both tables are derived from the view', () => {
  const { profile } = profileFixture();
  const md = renderCrosswalkMarkdown(profile, buildCrosswalkView(profile, crosswalkData()));
  const alpha = md.slice(md.indexOf('## Alpha Controls v1'), md.indexOf('## Beta Standard 2022'));
  assert.ok(alpha.includes('a reference related to a whole Category or Function is related to every outcome under it'));
  assert.ok(alpha.includes('- References listed: 5\n'));
  assert.ok(alpha.includes('- References with at least one related outcome at none or partial: 4\n'));
  assert.ok(alpha.includes('- References with at least one related outcome still unreviewed or stale: 5\n'));

  // First table: relationships to individual outcomes, natural order, with
  // unreviewed/stale outcomes marked inline. A-20 and A-30 have none and are not here.
  const first = alpha.slice(alpha.indexOf('**References related to individual outcomes (Subcategories)**'), alpha.indexOf('**References related to a whole Category or Function**'));
  assert.ok(first.includes('| Reference | Related CSF 2.0 outcomes (coverage) |\n| --- | --- |\n'));
  assert.deepEqual(first.split('\n').filter((line) => line.startsWith('| A-')), [
    '| A-1 | PR.AA-01 (full, ⚠ STALE REVIEW) — also related to a whole Category or Function (next table) |',
    '| A-2 | GV.OC-01 (substantial), PR.AA-01 (full, ⚠ STALE REVIEW) |',
    '| A-10 | GV.OC-01 (substantial), GV.OC-02 (none, ⚠ UNREVIEWED) |',
  ]);

  // Second table: one row per (reference, Category or Function) with the
  // distribution of the outcomes under it — not one row per Subcategory.
  const second = alpha.slice(alpha.indexOf('**References related to a whole Category or Function**'));
  assert.ok(second.includes('not to one outcome in it'));
  assert.ok(second.includes('| Reference | Related Category or Function | Outcomes under it, by coverage |\n| --- | --- | --- |\n'));
  assert.deepEqual(second.split('\n').filter((line) => line.startsWith('| A-')), [
    '| A-1 | Category: Identity Management (PR.AA) | 2 outcomes: partial 1, full 1 (⚠ 1 stale) |',
    '| A-20 | Category: Identity Management (PR.AA) | 2 outcomes: partial 1, full 1 (⚠ 1 stale) |',
    '| A-30 | Function: GOVERN (GV) | 2 outcomes: none 1, substantial 1 (⚠ 1 unreviewed) |',
  ]);

  // beta: its one reference relates to a partial outcome — a gap — and nothing
  // awaits review. It records nothing above Subcategory level: one table only.
  const beta = md.slice(md.indexOf('## Beta Standard 2022'), md.indexOf('## Gamma Baseline'));
  assert.ok(beta.includes('- Relationships recorded for: 1 of 4 Subcategories, 0 of 2 Categories, 0 of 2 Functions\n'));
  assert.ok(beta.includes('- References listed: 1\n'));
  assert.ok(beta.includes('- References with at least one related outcome at none or partial: 1\n'));
  assert.ok(!beta.includes('still unreviewed or stale'));
  assert.ok(beta.includes('| Clause: 4.2(a) | PR.AA-05 (partial) |\n'));
  assert.ok(!beta.includes('whole Category or Function**'));

  const gamma = md.slice(md.indexOf('## Gamma Baseline'));
  assert.ok(gamma.includes('- References with at least one related outcome at none or partial: 0\n'));
});

test('crosswalk.md: a Category row shows a distribution, including a single outcome and a fully reviewed one', () => {
  const fixture = profileFixture({ unreviewed: [], stale: [] });
  const data = crosswalkData();
  data.crosswalks = [{ ...data.crosswalks[2], functionMappings: { PR: ['F-1'] }, categoryMappings: { 'GV.OC': ['C-1'] }, mappings: {} }];
  const md = renderCrosswalkMarkdown(fixture.profile, buildCrosswalkView(fixture.profile, data));
  assert.ok(md.includes('| C-1 | Category: Organizational Context (GV.OC) | 2 outcomes: none 1, substantial 1 |\n'));
  assert.ok(md.includes('| F-1 | Function: PROTECT (PR) | 2 outcomes: partial 1, full 1 |\n'));
  // Only Category/Function-level relationships: no (empty) first table.
  assert.ok(!md.includes('**References related to individual outcomes (Subcategories)**'));
  assert.ok(md.includes('- References listed: 2\n'));

  const one = buildProfile(CTX, { csf: { ...CSF, subcategories: [CSF.subcategories[0]] }, assessments: { 'GV.OC-01': assessment('GV.OC-01', 'full') }, reviews: {}, meta: {} });
  const single = renderCrosswalkMarkdown(one, buildCrosswalkView(one, data));
  assert.ok(single.includes('| C-1 | Category: Organizational Context (GV.OC) | 1 outcome: full 1 (⚠ 1 unreviewed) |\n'));
});

test('crosswalk.md: a partial CSF core is announced the same way the gap analysis announces it', () => {
  const { assessments } = profileFixture();
  const partial = buildProfile(CTX, { csf: { ...CSF, sample: true }, assessments, reviews: {}, meta: {} });
  const md = renderCrosswalkMarkdown(partial, buildCrosswalkView(partial, crosswalkData()));
  assert.match(partial.csfSource, /PARTIAL CSF subset/);
  assert.ok(md.includes(`- CSF source: ${partial.csfSource}\n`));
});

test('crosswalk.md: DRAFT banner follows the same rule as the gap analysis', () => {
  const BANNER = '**DRAFT — not fully reviewed.**';
  const cases = [
    { name: 'one unreviewed, one stale', fixture: profileFixture(), unreviewed: 1, stale: 1 },
    { name: 'unreviewed only', fixture: profileFixture({ unreviewed: ['GV.OC-01', 'GV.OC-02', 'PR.AA-05'], stale: [] }), unreviewed: 3, stale: 0 },
    { name: 'stale only', fixture: profileFixture({ unreviewed: [], stale: ['PR.AA-01', 'PR.AA-05'] }), unreviewed: 0, stale: 2 },
    { name: 'fully reviewed', fixture: profileFixture({ unreviewed: [], stale: [] }), unreviewed: 0, stale: 0 },
  ];
  for (const c of cases) {
    const { profile } = c.fixture;
    assert.deepEqual([profile.summary.unreviewed, profile.summary.stale], [c.unreviewed, c.stale], c.name);
    const md = renderCrosswalkMarkdown(profile, buildCrosswalkView(profile, crosswalkData()));
    const draft = md.includes(BANNER);
    // The rule itself, and agreement with the deliverable it is copied from.
    assert.equal(draft, c.unreviewed + c.stale > 0, c.name);
    assert.equal(draft, renderGapMarkdown(profile, {}).includes(BANNER), `${c.name}: differs from gap-analysis.md`);
    if (draft) {
      assert.ok(
        md.includes(`> ${BANNER} ${c.unreviewed} unreviewed and ${c.stale} stale item(s) remain in the assessment;`),
        `${c.name}: banner must state the assessment's own counts`,
      );
    } else {
      assert.ok(!md.includes('DRAFT'), c.name);
      assert.ok(!md.includes('⚠'), c.name);
      assert.ok(!md.includes('still unreviewed or stale'), c.name);
    }
  }
});

test('crosswalk.md: the DRAFT banner describes the assessment, even when no listed outcome is affected', () => {
  // GV.OC-02 is unreviewed and PR.AA-01 stale, but beta only relates to PR.AA-05 (reviewed).
  const { profile } = profileFixture();
  const md = renderCrosswalkMarkdown(profile, buildCrosswalkView(profile, selectCrosswalks(crosswalkData(), ['beta'])));
  assert.ok(md.includes('1 unreviewed and 1 stale item(s) remain in the assessment; any of them that appear below are marked.'));
  assert.ok(!md.includes('⚠'), 'no listed outcome is unreviewed or stale, so none is marked');
  assert.ok(!md.includes('still unreviewed or stale'));
});

test('crosswalk.md: data-file text cannot break the tables or inject markup', () => {
  const { profile } = profileFixture();
  const data = crosswalkData();
  data.crosswalks = [{
    ...data.crosswalks[2],
    framework: 'Evil | <script>alert(1)</script>',
    developer: '[link](javascript:alert(1))',
    categoryMappings: { 'GV.OC': ['C|D', '<b>x</b>'] },
    mappings: { 'GV.OC-01': ['A|B', '<img src=x>', '*bold*'] },
  }];
  const md = renderCrosswalkMarkdown(profile, buildCrosswalkView(profile, data));
  // Markup characters arrive backslash-escaped, i.e. as literal text.
  assert.ok(md.includes('Evil \\| \\<script\\>alert(1)\\</script\\>'));
  assert.ok(md.includes('| \\<img src=x\\> |'));
  assert.ok(md.includes('\\[link\\](javascript:alert(1))'));
  assert.ok(md.includes('| A\\|B | GV.OC-01 (substantial) |'));
  assert.ok(md.includes('| \\*bold\\* |'));
  assert.ok(md.includes('| C\\|D | Category: Organizational Context (GV.OC) | 2 outcomes: none 1, substantial 1 (⚠ 1 unreviewed) |'));
  assert.ok(md.includes('| \\<b\\>x\\</b\\> | Category:'));
  // The only unescaped "<" left in the report opens a NIST-hosted autolink.
  assert.deepEqual([...new Set(md.match(/(?<!\\)<[^>\n]{0,12}/g))], ['<https://csrc']);
  // Every row of the reference tables still has exactly its two or three cells.
  const cells = (row) => row.replace(/\\\|/g, '').split('|').length - 2;
  const rows = md.split('\n').filter((line) => line.endsWith('| GV.OC-01 (substantial) |'));
  assert.equal(rows.length, 3);
  for (const row of rows) assert.equal(cells(row), 2);
  for (const row of md.split('\n').filter((line) => line.includes('| Category: '))) assert.equal(cells(row), 3);
});

test('listing: provenance, default set vs opt-in, coverage of the core in use, and the current selection', () => {
  const ids = CSF.subcategories.map((s) => s.id);
  const { warnings, logger } = capture();
  const listing = buildCrosswalkListing({ data: crosswalkData(), selection: ['beta', 'typo'], subcategoryIds: ids, path: 'data/x.json', logger });
  assert.equal(warnings.length, 1);
  assert.deepEqual(listing.selectedIds, ['beta']);
  assert.equal(listing.catalogUrl, CATALOG_URL);
  assert.deepEqual(
    listing.crosswalks.map((c) => [c.id, c.inDefaultSet, c.thirdParty, c.selected, c.mapped, c.total, c.categoriesMapped, c.functionsMapped, c.sourceUrl]),
    [
      // ZZ.ZZ-99 and ZZ.ZZ are not in the core in use, so they are not counted.
      ['alpha', true, false, false, 3, 4, 1, 1, 'https://csrc.nist.gov/media/alpha.xlsx'],
      ['beta', false, true, true, 1, 4, 0, 0, null],
      ['gamma', true, false, false, 1, 4, 0, 0, null],
    ],
  );

  const text = renderCrosswalkListing(listing);
  assert.ok(text.includes('Data file: data/x.json\n'));
  assert.ok(text.includes('Source: Test source (OLIR)\n'));
  assert.ok(text.includes(`Catalog where each mapping and its developer are listed: ${CATALOG_URL}\n`));
  assert.ok(text.includes('Retrieved: 2026-11-13 · CSF 2.0\n'));
  assert.ok(text.includes(
    '— alpha  Alpha Controls v1 · default set\n' +
    '         mapping by Alpha Standards Body · released 2025-03-01\n' +
    '         relates to 3/4 Subcategories, 1 whole Category, 1 whole Function\n' +
    '         mapping document: https://csrc.nist.gov/media/alpha.xlsx\n',
  ));
  // A third-party mapping is opt-in and says so; it carries no link.
  assert.ok(text.includes(
    "✓ beta   Beta Standard 2022 · opt-in · third-party mapping (not produced by the framework's publisher)\n" +
    '         mapping by An Independent Author · released 2025-07-18\n' +
    '         relates to 1/4 Subcategories, 0 whole Categories, 0 whole Functions\n' +
    '— gamma  Gamma Baseline · default set\n',
  ));
  assert.ok(text.includes('Selected by the current configuration: 1 of 3 (beta).\n'));
  assert.ok(text.includes('Select with --crosswalk <ids|default|all|none> or "report.crosswalks" in the config file.\n'));
  assert.ok(text.includes('Third-party mappings are opt-in'));
  assert.ok(text.includes('not a determination of conformance'));
  // No link other than NIST-hosted ones is ever printed.
  for (const url of text.match(/https?:\/\/\S+/g)) assert.equal(isNistHostedUrl(url), true, url);

  const render = (selection) => renderCrosswalkListing(buildCrosswalkListing({ data: crosswalkData(), selection, subcategoryIds: ids, path: 'p' }));
  const byDefault = render(null);
  assert.ok(byDefault.includes('Selected by the current configuration: the default set, 2 of 3 ("report.crosswalks" is not set).\n'));
  assert.ok(byDefault.includes('✓ alpha ') && byDefault.includes('— beta ') && byDefault.includes('✓ gamma '));
  assert.ok(render(['all']).includes('Selected by the current configuration: all 3.\n'));
  assert.ok(render([]).includes('Selected by the current configuration: none — reports omit the crosswalk deliverables.\n'));
});

test('renderReports: writes both crosswalk files when selected, and removes them when not', async () => {
  await withTempDir(async (dir) => {
    const { assessments, reviews } = profileFixture();
    const ctx = { ...CTX, paths: resolvePaths(dir) };
    const inputs = { csf: CSF, assessments, reviews, meta: {} };

    const withCrosswalks = await renderReports(ctx, { ...inputs, crosswalks: selectCrosswalks(crosswalkData(), ['alpha', 'beta']) });
    assert.equal(withCrosswalks.crosswalkCsvPath, ctx.paths.crosswalkCsv);
    assert.equal(withCrosswalks.crosswalkReportPath, ctx.paths.crosswalkReport);
    assert.deepEqual(withCrosswalks.crosswalkView.crosswalks.map((c) => c.id), ['alpha', 'beta']);
    const csv = await readFile(ctx.paths.crosswalkCsv, 'utf8');
    const md = await readFile(ctx.paths.crosswalkReport, 'utf8');
    assert.ok(csv.includes('\r\nalpha,Alpha Controls v1,alpha:A-1,A-1,subcategory,'));
    assert.ok(csv.includes('\r\nalpha,Alpha Controls v1,alpha:A-20,A-20,category,PR.AA,'));
    assert.ok(!csv.includes('gamma'), 'an unselected crosswalk must not be rendered');
    assert.match(md, /## Beta Standard 2022 \(third-party mapping\)/);
    assert.ok(!md.includes('Gamma Baseline'));
    // All three deliverables come from the same view.
    assert.deepEqual(embeddedData(await readFile(ctx.paths.dashboard, 'utf8')).crosswalk, crosswalkDashboardData(withCrosswalks.crosswalkView));
    // The Current Profile's shape is untouched by crosswalks.
    const profileJson = JSON.parse(await readFile(ctx.paths.currentProfile, 'utf8'));
    assert.ok(!JSON.stringify(profileJson).includes('crosswalk'));

    // Same work directory, crosswalks no longer selected: earlier output must go.
    for (const crosswalks of [null, undefined, { ...crosswalkData(), crosswalks: [] }]) {
      await writeFile(ctx.paths.crosswalkCsv, 'stale');
      await writeFile(ctx.paths.crosswalkReport, 'stale');
      const without = await renderReports(ctx, { ...inputs, crosswalks });
      assert.equal(without.crosswalkView, null);
      assert.equal(without.crosswalkCsvPath, null);
      assert.equal(without.crosswalkReportPath, null);
      assert.equal(await fileExists(ctx.paths.crosswalkCsv), false, 'stale crosswalk.csv must be removed');
      assert.equal(await fileExists(ctx.paths.crosswalkReport), false, 'stale crosswalk.md must be removed');
      assert.ok(!('crosswalk' in embeddedData(await readFile(ctx.paths.dashboard, 'utf8'))));
    }
  });
});

test('renderReports: crosswalks are optional, and no other deliverable depends on them', async () => {
  await withTempDir(async (dir) => {
    const { assessments, reviews } = profileFixture();
    const inputs = { csf: CSF, assessments, reviews, meta: {} };
    const read = (path) => readFile(path, 'utf8');

    // A caller that predates crosswalks: no parameter, and no crosswalk paths.
    const paths = resolvePaths(dir);
    delete paths.crosswalkCsv;
    delete paths.crosswalkReport;
    const legacy = await renderReports({ ...CTX, paths }, inputs);
    assert.equal(legacy.crosswalkView, null);
    // Each file is exactly what its own renderer produces from the profile —
    // the dashboard included, with the one section the report stage always
    // passes (the document view) and nothing about crosswalks.
    const documentView = buildDocumentView(legacy.profile, { assessments, meta: {} });
    const expected = {
      gapReport: renderGapMarkdown(legacy.profile, { evidenceQuoteMaxChars: 300, targetView: null }),
      evidenceMap: renderEvidenceCsv(legacy.profile),
      dashboard: renderDashboardHtml(legacy.profile, null, { documentView }),
      currentProfile: `${JSON.stringify(legacy.profile, null, 2)}\n`,
    };
    for (const [key, content] of Object.entries(expected)) assert.equal(await read(paths[key]), content, `${key} (no crosswalks)`);

    // An explicit null, with the full path set: the same files, and no crosswalk files.
    const full = resolvePaths(dir);
    await renderReports({ ...CTX, paths: full }, { ...inputs, crosswalks: null });
    for (const [key, content] of Object.entries(expected)) assert.equal(await read(full[key]), content, `${key} (null)`);
    assert.equal(await fileExists(full.crosswalkCsv), false);
    assert.equal(await fileExists(full.crosswalkReport), false);

    // With crosswalks selected, only the dashboard gains anything.
    await renderReports({ ...CTX, paths: full }, { ...inputs, crosswalks: allOf(crosswalkData()) });
    for (const key of ['gapReport', 'evidenceMap', 'currentProfile']) {
      assert.equal(await read(full[key]), expected[key], `${key} (with crosswalks)`);
    }
    assert.notEqual(await read(full.dashboard), expected.dashboard);
    assert.equal(await fileExists(full.crosswalkCsv), true);
  });
});

function embeddedData(html) {
  const m = /<script id="csf-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'embedded data block present');
  return JSON.parse(m[1]);
}
