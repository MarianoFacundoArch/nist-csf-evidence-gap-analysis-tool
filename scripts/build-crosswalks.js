#!/usr/bin/env node
/**
 * Regenerates data/csf-crosswalks.json — the informative-reference crosswalks
 * from CSF 2.0 to identifiers in other frameworks — from NIST's CSF 2.0
 * reference data service.
 *
 * This is a MAINTAINER script (not part of the tool's runtime). It exists for
 * the same reason as build-csf-core.js: shipped data must be reproducible from
 * the official source and its provenance auditable. The mappings are the ones
 * published through NIST's National Online Informative References (OLIR)
 * Program. This script selects and tidies them; it never authors one.
 *
 * What it does:
 *   1. Downloads two JSON documents from the service (or reads saved copies
 *      with --from-dir, for offline and reproducible builds):
 *        .../csf/elements   the CSF 2.0 Core tree; each element carries its
 *                           relationships to other frameworks
 *        .../csf/olirs      the catalog of mappings: name, version, developer
 *                           of record, release date, source location
 *   2. Finds the Core's elements at their canonical places in the tree:
 *      Function > Category > Subcategory. The same ids also appear deeper in
 *      the tree, under the withdrawal notes of CSF v1.1 entries that moved to
 *      them; those are pointers, not Core elements, and are ignored.
 *   3. Checks integrity and FAILS LOUDLY rather than writing doubtful data:
 *      every Subcategory in data/csf-core.json is found exactly once; each
 *      one's text equals the shipped outcome; every allowlisted mapping is in
 *      the catalog exactly once, still has the developer and reference
 *      document its allowlist entry was reviewed against, and is not empty; no
 *      relationship of an allowlisted mapping hangs off a Function, Category
 *      or Subcategory that the shipped Core does not have.
 *   4. Keeps, for each allowlisted mapping, the relationships of type
 *      `olir_focal` whose `olirName` equals the mapping's catalog name. (The
 *      other type, `external_reference`, carries no `olirName`: it is not an
 *      entry of a catalogued mapping, so nothing says who published it.)
 *      A mapping records each relationship at the level its developer chose —
 *      one Subcategory, a whole Category, or a whole Function — and the file
 *      keeps the three apart (`mappings`, `categoryMappings`,
 *      `functionMappings`). A Category-level relationship is NOT copied onto
 *      the Category's Subcategories: that would publish relationships nobody
 *      recorded. What it implies for coverage is the report stage's concern.
 *   5. Normalizes the identifiers (see normalizeReferenceId / isNullMarker).
 *      Whitespace cleanup: runs are collapsed and the ends trimmed
 *      ("Control  5.26"). Punctuation cleanup: a dangling "," or ";" left at
 *      the end by a list is removed ("Mandatory Clause:  6.1,"). Entries that
 *      say "nothing here" instead of naming a reference — the value after the
 *      label is empty or literally "None", e.g. "Mandatory Clause: None" — are
 *      dropped, and so are exact duplicates within one element. Nothing else
 *      is rewritten: an entry that lists two identifiers, spells one in two
 *      ways, is non-specific, or looks wrong is kept as its developer
 *      published it.
 *   6. Writes data/csf-crosswalks.json deterministically: mappings in
 *      allowlist order, CSF elements in data/csf-core.json order, identifiers
 *      in natural order (src/util/naturalSort.js, locale-independent).
 *
 * IDENTIFIERS ONLY. Only each relationship's identifier is read. The titles
 * and text the service returns alongside it are never written: several of the
 * referenced frameworks are copyrighted by their publishers, and one uniform
 * rule is simpler to audit than a per-framework one.
 *
 * LINKS ARE LIMITED TO NIST-HOSTED DOCUMENTS. The catalog gives each mapping
 * a source location. Some are submission files NIST itself hosts; the rest
 * are pages on the developer's own site, which can move or change and which
 * this data has no business carrying. One rule for every mapping: the link is
 * kept (`sourceUrl`) only when its host is nist.gov or a subdomain of it,
 * otherwise `sourceUrl` is null. The file's `catalogUrl` — NIST's catalog of
 * informative references, where every mapping and its developer are listed —
 * is the citation in both cases. The developer's NAME is always kept, exactly
 * as the catalog gives it: who made a mapping is a fact about it.
 *
 * WHICH MAPPINGS ARE SHIPPED (the explicit allowlist below). The rule its
 * entries meet: the mapping's developer of record in NIST's catalog is NIST
 * itself or the body that publishes the mapped framework. Two widely requested
 * standards whose publishers have not submitted a mapping are included as
 * exceptions — ISO/IEC 27001:2022 and PCI DSS v4.0.1 — flagged `thirdParty:
 * true` and labeled as third-party mappings wherever they are shown. The
 * allowlist is a selection, not everything the rule would admit (for example,
 * where the catalog holds mappings for two versions of a framework, only the
 * one for the newer version is listed). The catalog also contains mappings to
 * vendor products and services; those are intentionally not shipped (this
 * project promotes no product anywhere in code, docs or output). Adding a
 * mapping means adding one entry to the allowlist.
 *
 * THIRD-PARTY MAPPINGS ARE OPT-IN. By default the deliverables carry only
 * mappings developed by NIST or by the body that publishes the mapped
 * framework. Mappings by other parties are available but must be chosen
 * deliberately (see src/crosswalk/select.js), and they are reproduced as
 * published — including entries that are non-specific ("Annex A Controls: All
 * applicable controls") or appear erroneous ("Mandatory Clause: 6.11" and
 * "6.13" name clauses the standard does not have). Correcting them here would
 * be authoring a mapping, which this script never does.
 *
 * The `thirdParty` flag and the display label are judgments made by a person
 * reading the catalog, so each entry also records the two catalog facts they
 * were made against — the developer of record and the reference document's
 * identifier. If either changes, the build stops: the entry has to be looked
 * at again before anything is shipped under its label.
 *
 * Requirements: network access (no other tool), or saved copies of the two
 * responses. Run from the repo root:
 *   node scripts/build-crosswalks.js
 *   node scripts/build-crosswalks.js --from-dir <dir> --retrieved-at <YYYY-MM-DD>
 * --from-dir expects nist-csf-elements.json and nist-csf-olirs.json in <dir>
 * (save them with `curl -o <file> <url>` from the two URLs below).
 * `retrievedAt` in the output is the day the responses were obtained: today
 * (UTC) for a network build, --retrieved-at for saved copies.
 */

import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { naturalCompare } from '../src/util/naturalSort.js';
import { validateCrosswalkData } from '../src/crosswalk/loader.js';
import { REFERENCE_ID_MAX_LENGTH, isNistHostedUrl } from '../src/crosswalk/crosswalk.schema.js';

const ELEMENTS_URL = 'https://csrc.nist.gov/extensions/nudp/services/json/csf/elements';
const OLIRS_URL = 'https://csrc.nist.gov/extensions/nudp/services/json/csf/olirs';
// NIST's catalog of informative references: the page where every mapping below
// and its developer are listed. The citation for all of them.
const CATALOG_URL = 'https://csrc.nist.gov/projects/olir/informative-reference-catalog';
const ELEMENTS_FILE = 'nist-csf-elements.json';
const OLIRS_FILE = 'nist-csf-olirs.json';
const CORE_PATH = fileURLToPath(new URL('../data/csf-core.json', import.meta.url));
const OUT_PATH = fileURLToPath(new URL('../data/csf-crosswalks.json', import.meta.url));
const DOWNLOAD_TIMEOUT_MS = 120_000;

const SOURCE =
  'NIST National Online Informative References (OLIR) Program, via the NIST CSF 2.0 reference data service';

const COMMENT =
  'Informative-reference crosswalks from the NIST Cybersecurity Framework (CSF) 2.0 to identifiers in other ' +
  'frameworks, as published through NIST\'s National Online Informative References (OLIR) Program and retrieved ' +
  `from the NIST CSF 2.0 reference data service (${ELEMENTS_URL} and ${OLIRS_URL}). IDENTIFIERS ONLY: no control ` +
  'or requirement text and no control titles of any referenced framework are included, and each framework ' +
  'remains the property of its publisher. A mapping records that a CSF element and a reference are related; it ' +
  'is not an equivalence and not a determination of conformance. Each relationship is kept at the level its ' +
  'mapping records it: "mappings" for one Subcategory, "categoryMappings" for a whole Category, ' +
  '"functionMappings" for a whole Function. "developer" is the mapping\'s developer of record in NIST\'s catalog ' +
  '("catalogUrl"); "thirdParty": true marks a mapping developed by neither NIST nor the publisher of the ' +
  'referenced framework, reproduced as published. "sourceUrl" is the mapping\'s own document when NIST hosts ' +
  'it, otherwise null: this file carries no links to third-party pages. Regenerate with ' +
  'scripts/build-crosswalks.js (npm run build-crosswalks).';

/**
 * The mappings to ship, in output order (selection rule: see the header).
 *   id, framework   stable id and display label used in every deliverable
 *   olirName        must equal the catalog entry's `name`
 *   thirdParty      true when the developer is neither NIST nor the publisher
 *                   of the mapped framework
 *   developer, referenceDocument
 *                   the catalog's `developerId` and
 *                   `referenceFrameworkVersionIdentifier` when the entry was
 *                   reviewed; the build fails if the catalog no longer agrees
 */
const NIST = 'National Institute of Standards and Technology';

export const CROSSWALK_ALLOWLIST = [
  {
    id: 'sp800-53-r5', framework: 'NIST SP 800-53 Rev. 5.2.0', thirdParty: false,
    olirName: 'Cybersecurity-Framework-v2.0-to-SP-800-53-Rev-5-2-0',
    developer: NIST, referenceDocument: 'SP_800_53_5_2_0',
  },
  {
    id: 'sp800-171-r3', framework: 'NIST SP 800-171 Rev. 3', thirdParty: false,
    olirName: 'CSF 2.0 to SP 800-171 Rev 3',
    developer: NIST, referenceDocument: 'SP_800_171_3_0_0',
  },
  {
    id: 'sp800-218-ssdf', framework: 'NIST SP 800-218 (SSDF) v1.1', thirdParty: false,
    olirName: 'SSDF-Version-1.1-to-Cybersecurity-Framework-v2.0',
    developer: NIST, referenceDocument: 'SP_800_218_1_1_0',
  },
  {
    id: 'csf-1.1', framework: 'NIST Cybersecurity Framework v1.1', thirdParty: false,
    olirName: 'Cybersecurity-Framework-v1.1-to-Cybersecurity-Framework-v2.0',
    developer: NIST, referenceDocument: 'CSF_1_1_0',
  },
  {
    id: 'cis-v8.1', framework: 'CIS Critical Security Controls v8.1', thirdParty: false,
    olirName: 'CIS-Controls-8.1-to-Cybersecurity-Framework-v2.0',
    developer: 'Center for Internet Security (CIS)', referenceDocument: 'CISv8.0_8_1_8_1',
  },
  {
    id: 'csa-ccm-v4', framework: 'CSA Cloud Controls Matrix v4.0', thirdParty: false,
    olirName: 'Cloud-Controls-Matrix-(CCM)-Version-4.0-to-Cybersecurity-Framework-v2.0',
    developer: 'Cloud Security Alliance (CSA)', referenceDocument: 'CCMv4.0_4_0',
  },
  {
    id: 'cri-profile-v2', framework: 'CRI Profile v2.0', thirdParty: false,
    olirName: 'CRI-Profile-v2.0-to-CSF-v2.0',
    developer: 'Cyber Risk Institute (CRI)', referenceDocument: 'CRI_v2.0_2_0',
  },
  {
    id: 'scf-2024.4', framework: 'Secure Controls Framework (SCF) 2024.4', thirdParty: false,
    olirName: 'NIST CSF 2.0 To Secure Controls Framework (SCF)',
    developer: 'SCF Council', referenceDocument: 'SCF2024.4_2024_4',
  },
  // The catalog holds two ISO/IEC 27001:2022 mappings, both third-party. One
  // mapping per framework is shipped: this one, which covers all 106
  // Subcategories. The other ("ISO/IEC-27001:2022-to-NIST-Cybersecurity-
  // Framework-v2.0") is newer but much narrower — it covers 39.
  {
    id: 'iso27001-2022', framework: 'ISO/IEC 27001:2022', thirdParty: true,
    olirName: 'ISO/IEC-27001:2022-to-Cybersecurity-Framework-v2.0',
    developer: 'Razilio', referenceDocument: 'ISO/IEC_27001:2022_2022',
  },
  {
    id: 'pci-dss-4.0.1', framework: 'PCI DSS v4.0.1', thirdParty: true,
    olirName: 'Payment-Card-Industry-Data-Security-Standards-(PCI-DSS)-4.0.1-to-Cybersecurity-Framework-v2.0',
    developer: 'Independent', referenceDocument: 'PCI_DSS_4_0_1_4_0_1',
  },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The three levels at which a mapping can record a relationship, and the
// field of the output that holds each.
const LEVELS = ['function', 'category', 'subcategory'];
const MAP_FIELD = { function: 'functionMappings', category: 'categoryMappings', subcategory: 'mappings' };

function fail(message) {
  throw new Error(message);
}

/** First few ids of a list, for an error message that stays readable. */
function sample(ids, max = 8) {
  return ids.slice(0, max).join(', ') + (ids.length > max ? ', …' : '');
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Tidy one raw identifier without changing what it identifies. Whitespace
 * cleanup: collapse runs to one space and trim ("Control  5.26"). Punctuation
 * cleanup: remove a dangling list separator at the end ("… 6.1,").
 * @param {string} raw the relationship's `elementIdentifier`
 * @returns {string}
 */
export function normalizeReferenceId(raw) {
  if (typeof raw !== 'string') fail(`A relationship has a non-text identifier: ${JSON.stringify(raw)}.`);
  return raw.replace(/\s+/g, ' ').trim().replace(/[,;]+$/, '').trimEnd();
}

/**
 * True for an entry that states "no reference" instead of naming one. Some
 * mappings fill every row of their source sheet, writing a label and then
 * "None" (or nothing) where the framework has no counterpart: "Mandatory
 * Clause: None", "Annex A Controls:". The value is what follows the last
 * colon — the whole identifier when there is none.
 * @param {string} id a normalized identifier
 */
export function isNullMarker(id) {
  const value = id.slice(id.lastIndexOf(':') + 1).trim();
  return value === '' || value.toLowerCase() === 'none';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * The elements at their canonical places in the tree, in tree order:
 * Functions at the top, Categories under a Function, Subcategories under a
 * Category. Anything else with one of those types sits deeper and is ignored.
 */
function canonicalElements(elements) {
  const top = elements?.response?.elements;
  if (!Array.isArray(top) || top.length === 0) {
    fail('The elements response has no `response.elements` list. The service format may have changed; review the extraction.');
  }
  const found = { function: [], category: [], subcategory: [] };
  for (const fn of top) {
    if (fn?.elementTypeIdentifier !== 'function') continue;
    found.function.push(fn);
    for (const category of asArray(fn.elements)) {
      if (category?.elementTypeIdentifier !== 'category') continue;
      found.category.push(category);
      for (const sub of asArray(category.elements)) {
        if (sub?.elementTypeIdentifier === 'subcategory') found.subcategory.push(sub);
      }
    }
  }
  return found;
}

/**
 * Normalize the raw identifiers one element carries for one mapping: tidy
 * each, drop null markers and repeats. Returns the survivors and what was
 * dropped. `where` names the element in a failure message.
 */
function cleanIdentifiers(rawIds, where) {
  const kept = new Set();
  const counts = { normalized: 0, nullMarkers: 0, duplicates: 0 };
  for (const raw of rawIds) {
    if (typeof raw !== 'string') fail(`${where}: a relationship has a non-text identifier (${JSON.stringify(raw)}).`);
    const id = normalizeReferenceId(raw);
    if (id !== raw) counts.normalized++;
    if (isNullMarker(id)) {
      counts.nullMarkers++;
    } else if (kept.has(id)) {
      counts.duplicates++;
    } else if (id.length > REFERENCE_ID_MAX_LENGTH) {
      // Tripwire for the identifiers-only rule: an identifier this long is
      // text, which this file must never carry.
      fail(`${where}: "${id.slice(0, 80)}…" is too long to be an identifier.`);
    } else {
      kept.add(id);
    }
  }
  return { kept, counts };
}

/** The catalog entry named `olirName` — exactly one, or a loud failure. */
function catalogEntry(docs, olirName, id) {
  const matches = docs.filter((d) => typeof d?.name === 'string' && d.name.trim() === olirName);
  if (matches.length === 0) {
    fail(
      `Crosswalk "${id}": no entry named "${olirName}" in NIST's catalog. It may have been renamed or ` +
        `withdrawn; review the allowlist. Catalog names: ${docs.map((d) => d?.name).join(' | ')}`,
    );
  }
  if (matches.length > 1) fail(`Crosswalk "${id}": ${matches.length} catalog entries are named "${olirName}".`);
  return matches[0];
}

function catalogText(entry, field, id) {
  const value = typeof entry[field] === 'string' ? entry[field].replace(/\s+/g, ' ').trim() : '';
  if (!value) fail(`Crosswalk "${id}": the catalog entry has no "${field}".`);
  return value;
}

/**
 * The pure transformation: NIST's two responses + the shipped CSF core in,
 * the crosswalk data object out. No I/O, no clock — `retrievedAt` is passed in
 * — so the same inputs always produce the same output, and every integrity
 * rule can be unit-tested. Throws an Error naming the rule that failed.
 *
 * @param {object} args
 * @param {object} args.elements parsed .../csf/elements response
 * @param {object} args.olirs parsed .../csf/olirs response
 * @param {{frameworkVersion?:string, subcategories:Array<{id:string, outcome:string}>}} args.core
 *   parsed data/csf-core.json
 * @param {string} args.retrievedAt YYYY-MM-DD day the responses were obtained
 * @param {typeof CROSSWALK_ALLOWLIST} [args.allowlist]
 * @returns {{data: object, stats: Record<string, {identifiers:number,
 *   sourceUrlKept:boolean, function:object, category:object,
 *   subcategory:object}>}} the file content and, per crosswalk id, what the
 *   build did: for each level `{elements, relationships, kept, normalized,
 *   nullMarkers, duplicates}`, plus the number of distinct identifiers and
 *   whether the catalog's source link was NIST-hosted and kept
 */
export function buildCrosswalks({ elements, olirs, core, retrievedAt, allowlist = CROSSWALK_ALLOWLIST }) {
  if (!isCalendarDate(retrievedAt)) fail(`retrievedAt must be a YYYY-MM-DD date, got ${JSON.stringify(retrievedAt)}.`);

  const coreSubs = asArray(core?.subcategories);
  if (coreSubs.length === 0) fail('The CSF core has no subcategories; cannot check the source against it.');
  const coreIds = coreSubs.map((s) => s.id);
  const outcomeById = new Map(coreSubs.map((s) => [s.id, s.outcome]));

  const ids = new Set(allowlist.map((a) => a.id));
  const names = new Set(allowlist.map((a) => a.olirName));
  if (ids.size !== allowlist.length || names.size !== allowlist.length) {
    fail('The allowlist repeats a crosswalk id or a catalog name; each must appear once.');
  }

  // --- Integrity of the source against the shipped Core ----------------------
  const canonical = canonicalElements(elements);
  const liveById = new Map();
  const repeated = [];
  for (const el of canonical.subcategory) {
    // Not in the shipped Core: a withdrawn CSF v1.1 entry kept for migration.
    if (!outcomeById.has(el.elementIdentifier)) continue;
    if (liveById.has(el.elementIdentifier)) repeated.push(el.elementIdentifier);
    else liveById.set(el.elementIdentifier, el);
  }
  const missing = coreIds.filter((id) => !liveById.has(id));
  if (missing.length > 0 || repeated.length > 0) {
    fail(
      `Expected each of the ${coreIds.length} Subcategories of the CSF core exactly once at ` +
        `Function > Category > Subcategory, but ${missing.length} are missing` +
        `${missing.length ? ` (${sample(missing)})` : ''} and ${repeated.length} are repeated` +
        `${repeated.length ? ` (${sample(repeated)})` : ''}. The service format may have changed; review the extraction.`,
    );
  }
  const changed = coreIds.filter((id) => liveById.get(id).text !== outcomeById.get(id));
  if (changed.length > 0) {
    fail(
      `${changed.length} Subcategory text(s) from the service differ from the shipped outcome (${sample(changed)}). ` +
        'Regenerate data/csf-core.json first (npm run build-csf-core) and review the difference.',
    );
  }

  // --- Relationships of the allowlisted mappings, by the level they hang off --
  // The Core's ids at each level, in CSF order: "GV.OC-01" belongs to Category
  // "GV.OC" and Function "GV".
  const order = {
    function: [...new Set(coreIds.map((id) => id.split('.')[0]))],
    category: [...new Set(coreIds.map((id) => id.split('-')[0]))],
    subcategory: coreIds,
  };
  const rawByName = new Map(
    allowlist.map((a) => [a.olirName, { function: new Map(), category: new Map(), subcategory: new Map() }]),
  );
  const outside = [];
  for (const level of LEVELS) {
    const known = new Set(order[level]);
    for (const el of canonical[level]) {
      for (const rel of asArray(el.externalRelationships)) {
        // Only entries of a published mapping; `external_reference` has no olirName.
        if (rel?.relationIdentifier !== 'olir_focal') continue;
        const name = typeof rel.olirName === 'string' ? rel.olirName.trim() : '';
        const byLevel = rawByName.get(name);
        if (!byLevel) continue;
        if (!known.has(el.elementIdentifier)) {
          outside.push(el.elementIdentifier);
          continue;
        }
        const byElement = byLevel[level];
        if (!byElement.has(el.elementIdentifier)) byElement.set(el.elementIdentifier, []);
        byElement.get(el.elementIdentifier).push(rel.elementIdentifier);
      }
    }
  }
  if (outside.length > 0) {
    fail(
      `${outside.length} relationship(s) of allowlisted mappings belong to elements that are not in the CSF core ` +
        `(${sample([...new Set(outside)])}). Regenerate data/csf-core.json first, or review the extraction.`,
    );
  }

  const docs = olirs?.response?.informativeReferenceDocs;
  if (!Array.isArray(docs) || docs.length === 0) {
    fail('The catalog response has no `response.informativeReferenceDocs` list. The service format may have changed.');
  }

  const stats = {};
  const crosswalks = allowlist.map((allowed) => {
    const where = `Crosswalk "${allowed.id}"`;
    const entry = catalogEntry(docs, allowed.olirName, allowed.id);

    // The label and the thirdParty flag were decided against these two facts.
    if (typeof allowed.thirdParty !== 'boolean') fail(`${where}: the allowlist entry must set thirdParty to true or false.`);
    const developer = catalogText(entry, 'developerId', allowed.id);
    const referenceDocument = catalogText(entry, 'referenceFrameworkVersionIdentifier', allowed.id);
    if (developer !== allowed.developer || referenceDocument !== allowed.referenceDocument) {
      fail(
        `${where}: the catalog entry no longer matches the allowlist — developer "${developer}" ` +
          `(reviewed as "${allowed.developer}"), reference document "${referenceDocument}" ` +
          `(reviewed as "${allowed.referenceDocument}"). Review the entry's label and thirdParty flag, then update it.`,
      );
    }
    const releaseDate = catalogText(entry, 'releaseDate', allowed.id);
    if (!isCalendarDate(releaseDate)) fail(`${where}: catalog releaseDate "${releaseDate}" is not a YYYY-MM-DD date.`);

    // Links: only a document NIST itself hosts (header, "LINKS ARE LIMITED...").
    // The link is taken exactly as the catalog lists it, or not at all.
    const webSite = typeof entry.webSite === 'string' ? entry.webSite.trim() : '';
    const sourceUrl = isNistHostedUrl(webSite) ? webSite : null;

    // One map per level, CSF elements in Core order so the file diffs cleanly
    // against the framework's own order.
    const byLevel = rawByName.get(allowed.olirName);
    const counts = { identifiers: 0, sourceUrlKept: sourceUrl !== null };
    const distinct = new Set();
    const maps = {};
    for (const level of LEVELS) {
      const map = {};
      const tally = { elements: 0, relationships: 0, kept: 0, normalized: 0, nullMarkers: 0, duplicates: 0 };
      for (const elementId of order[level]) {
        const rawIds = byLevel[level].get(elementId);
        if (!rawIds) continue;
        const cleaned = cleanIdentifiers(rawIds, `${where}, ${elementId}`);
        tally.relationships += rawIds.length;
        tally.normalized += cleaned.counts.normalized;
        tally.nullMarkers += cleaned.counts.nullMarkers;
        tally.duplicates += cleaned.counts.duplicates;
        if (cleaned.kept.size === 0) continue; // only null markers: the element is absent
        map[elementId] = [...cleaned.kept].sort(naturalCompare);
        tally.elements++;
        tally.kept += cleaned.kept.size;
        for (const refId of cleaned.kept) distinct.add(refId);
      }
      maps[level] = map;
      counts[level] = tally;
    }
    counts.identifiers = distinct.size;
    if (distinct.size === 0) {
      const raw = LEVELS.reduce((n, level) => n + counts[level].relationships, 0);
      fail(
        `${where}: no usable relationship named "${allowed.olirName}" was found on any Function, Category or ` +
          `Subcategory (${raw} raw). The mapping may have been withdrawn or renamed; review the allowlist.`,
      );
    }
    stats[allowed.id] = counts;

    return {
      id: allowed.id,
      framework: allowed.framework,
      olirName: allowed.olirName,
      olirVersion: catalogText(entry, 'version', allowed.id),
      developer,
      releaseDate,
      sourceUrl,
      thirdParty: allowed.thirdParty,
      // Always present, {} when the mapping records nothing at that level.
      [MAP_FIELD.function]: maps.function,
      [MAP_FIELD.category]: maps.category,
      [MAP_FIELD.subcategory]: maps.subcategory,
    };
  });

  return {
    data: {
      _comment: COMMENT,
      frameworkVersion: core.frameworkVersion ?? 'CSF 2.0',
      source: SOURCE,
      retrievedAt,
      catalogUrl: CATALOG_URL,
      crosswalks,
    },
    stats,
  };
}

/**
 * Serialize the data object as JSON with one line per CSF element — the unit a
 * reviewer wants to see in a diff when a mapping changes (a default
 * pretty-print puts every identifier on its own line: several times longer and
 * no clearer). The result is plain JSON; the caller checks it round-trips.
 * @param {object} data buildCrosswalks(...).data
 * @returns {string}
 */
export function serializeCrosswalkData(data) {
  const mapFields = Object.values(MAP_FIELD);
  const { crosswalks, ...head } = data;
  const lines = ['{'];
  for (const [key, value] of Object.entries(head)) lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  lines.push('  "crosswalks": [');
  crosswalks.forEach((crosswalk, i) => {
    lines.push('    {');
    const fields = Object.entries(crosswalk);
    fields.forEach(([key, value], j) => {
      const comma = j < fields.length - 1 ? ',' : '';
      if (!mapFields.includes(key)) {
        lines.push(`      ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`);
        return;
      }
      const elementIds = Object.keys(value);
      if (elementIds.length === 0) {
        lines.push(`      ${JSON.stringify(key)}: {}${comma}`);
        return;
      }
      lines.push(`      ${JSON.stringify(key)}: {`);
      elementIds.forEach((elementId, k) => {
        const refs = value[elementId].map((id) => JSON.stringify(id)).join(', ');
        lines.push(`        ${JSON.stringify(elementId)}: [${refs}]${k < elementIds.length - 1 ? ',' : ''}`);
      });
      lines.push(`      }${comma}`);
    });
    lines.push(`    }${i < crosswalks.length - 1 ? ',' : ''}`);
  });
  lines.push('  ]');
  lines.push('}');
  return lines.join('\n') + '\n';
}

function readSaved(dir, file) {
  const path = join(dir, file);
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    fail(`Cannot read ${path} (${err.code ?? err.message}). --from-dir expects ${ELEMENTS_FILE} and ${OLIRS_FILE}.`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    return fail(`${path} is not valid JSON (${err.message}).`);
  }
}

async function download(url) {
  console.error(`Downloading ${url} ...`);
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch (err) {
    return fail(
      `Download failed for ${url} (${err.cause?.code ?? err.name ?? err.message}). ` +
        'Check the network, or build from saved copies with --from-dir.',
    );
  }
  if (!res.ok) fail(`Download failed: HTTP ${res.status} for ${url}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    return fail(`The response from ${url} is not valid JSON (${err.message}).`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: { 'from-dir': { type: 'string' }, 'retrieved-at': { type: 'string' } },
  });
  const fromDir = values['from-dir'];
  let retrievedAt = values['retrieved-at'];

  let elements;
  let olirs;
  if (fromDir !== undefined) {
    if (retrievedAt === undefined) {
      fail('--from-dir needs --retrieved-at <YYYY-MM-DD>: the day the saved responses were downloaded.');
    }
    console.error(`Reading saved responses from ${fromDir} ...`);
    elements = readSaved(fromDir, ELEMENTS_FILE);
    olirs = readSaved(fromDir, OLIRS_FILE);
  } else {
    // A network build was retrieved now; a date passed by hand could only be wrong.
    if (retrievedAt !== undefined) {
      fail('--retrieved-at applies only with --from-dir; a network build records today\'s date (UTC).');
    }
    elements = await download(ELEMENTS_URL);
    olirs = await download(OLIRS_URL);
    retrievedAt = new Date().toISOString().slice(0, 10);
  }

  const core = JSON.parse(readFileSync(CORE_PATH, 'utf8'));
  if (core.subcategories?.length !== 106) {
    fail(
      `data/csf-core.json has ${core.subcategories?.length ?? 0} Subcategories, expected the complete 106. ` +
        'Regenerate it first (npm run build-csf-core).',
    );
  }

  const { data, stats } = buildCrosswalks({ elements, olirs, core, retrievedAt });

  const text = serializeCrosswalkData(data);
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(data)) fail('Internal error: the serialized file does not round-trip.');
  // The file must be one the tool itself accepts (same schema the loader uses).
  validateCrosswalkData(JSON.parse(text), 'generated crosswalk data');

  writeFileSync(OUT_PATH, text);
  console.error(`Wrote ${data.crosswalks.length} crosswalks to ${OUT_PATH} (retrieved ${retrievedAt}, ${Buffer.byteLength(text)} bytes):`);
  for (const crosswalk of data.crosswalks) {
    const s = stats[crosswalk.id];
    const sum = (field) => LEVELS.reduce((n, level) => n + s[level][field], 0);
    console.error(
      `  ${crosswalk.id.padEnd(15)} ${String(s.subcategory.elements).padStart(3)} Subcategories, ` +
        `${String(s.category.elements).padStart(2)} Categories, ${s.function.elements} Functions mapped; ` +
        `${String(sum('kept')).padStart(3)} relationships, ${String(s.identifiers).padStart(3)} identifiers` +
        ` — dropped ${sum('nullMarkers')} null marker(s), ${sum('duplicates')} duplicate(s); tidied ${sum('normalized')}; ` +
        `source link ${s.sourceUrlKept ? 'kept (NIST-hosted)' : 'omitted (not NIST-hosted)'}` +
        `${crosswalk.thirdParty ? ' [third-party mapping]' : ''}`,
    );
  }
}

// Run only when executed directly, so tests can import the pure functions.
function isMainModule() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((err) => {
    console.error('build-crosswalks failed:', err.message);
    process.exitCode = 1;
  });
}
