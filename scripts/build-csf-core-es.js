#!/usr/bin/env node
/**
 * Regenerates data/csf-core.es.json — the Spanish text of the CSF 2.0 Core —
 * from NIST CSWP 29 spa, the official U.S. Government Spanish translation of
 * the NIST Cybersecurity Framework 2.0 (https://doi.org/10.6028/NIST.CSWP.29.spa).
 *
 * This is a MAINTAINER script (not part of the tool's runtime), the companion
 * of scripts/build-csf-core.js. It exists for the same reason: the tool never
 * writes framework text itself. Spanish reports show NIST's own Spanish wording
 * for every Function, Category, and Subcategory outcome, extracted verbatim and
 * reproducibly from the published translation — not a translation made here.
 *
 * What it does:
 *   1. Downloads the publication PDF (or reads one passed with --from-pdf).
 *   2. Extracts its text with `pdftotext -layout` (Poppler).
 *   3. Removes page furniture (running header, date line, page numbers) and
 *      parses Appendix A, "CSF Core": Function headings, Category bullets, and
 *      Subcategory bullets, joining wrapped lines.
 *   4. Cross-checks the result against data/csf-core.json: the same 6 Functions,
 *      22 Categories, and 106 Subcategories, in the same order. Any mismatch
 *      aborts the build — a partial or misaligned translation is never written.
 *   5. Writes data/csf-core.es.json.
 *
 * Scope: the publication contains the Core's Function, Category, and
 * Subcategory text. The Implementation Examples are a separate online resource
 * that NIST publishes in English only, so they are NOT part of this file;
 * Spanish reports show them in the original English, labeled as such.
 *
 * Names are taken verbatim from the Appendix A Core listing. The publication is
 * not uniform about the last Function ("RECUPERACIÓN (RC)" in the listing,
 * "Recuperar (RC)" in its Table 1); the listing is reproduced as printed rather
 * than normalized here.
 *
 * Requirements: network access (unless --from-pdf) and the `pdftotext` utility
 * from Poppler (macOS: `brew install poppler`; Debian/Ubuntu: `apt install
 * poppler-utils`). Run from the repo root: `node scripts/build-csf-core-es.js`.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PDF_URL = 'https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.spa.pdf';
const CORE_PATH = fileURLToPath(new URL('../data/csf-core.json', import.meta.url));
const OUT_PATH = fileURLToPath(new URL('../data/csf-core.es.json', import.meta.url));

const APPENDIX_START = 'Appendix A. CSF Core';
const APPENDIX_END = 'Appendix B. Niveles del CSF';

// Headings and bullets of the Core listing. A Function heading starts at
// column 0 in capitals; a Category is a "•" bullet; a Subcategory is an "o"
// sub-bullet whose text starts with its identifier.
const FUNCTION_RE = /^(\p{Lu}+) \(([A-Z]{2})\): (.+)$/u;
const CATEGORY_RE = /^(.+?) \(([A-Z]{2}\.[A-Z]{2})\): (.+)$/;
const SUBCATEGORY_RE = /^([A-Z]{2}\.[A-Z]{2}-\d{2}): (.+)$/;

/**
 * Drop the page furniture `pdftotext -layout` interleaves with the body: each
 * page break is a form feed followed by the running header and the publication
 * date line, preceded by the previous page's number. Removing exactly these
 * lines (and nothing else) lets an item that spans a page break be rejoined.
 */
export function stripPageFurniture(lines) {
  const drop = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('\f')) continue;
    drop.add(i); // running header
    // The publication date line directly under the header.
    if (/^\p{L}+ \d{1,2}, \d{4}$/u.test(lines[i + 1] ?? '')) drop.add(i + 1);
    // The previous page's number: the last non-blank line before the break.
    for (let j = i - 1; j >= 0; j--) {
      if (lines[j].trim() === '') continue;
      if (/^\s*\d+\s*$/.test(lines[j])) drop.add(j);
      break;
    }
  }
  return lines.filter((_, i) => !drop.has(i));
}

/** Collapse the whitespace introduced by layout extraction and line wrapping. */
function clean(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Parse the Appendix A Core listing out of the extracted publication text.
 * Pure (no I/O) so it can be unit-tested on a small fixture.
 *
 * @param {string} text full `pdftotext -layout` output
 * @returns {{functions: Array<{id:string,name:string,outcome:string}>,
 *   categories: Array<{id:string,name:string,outcome:string}>,
 *   subcategories: Array<{id:string,outcome:string}>}}
 */
export function parseSpanishCore(text) {
  const all = stripPageFurniture(text.split('\n'));
  // The headings also appear in the table of contents (followed by dot
  // leaders); the body occurrences are the exact, whole-line matches.
  const start = all.findIndex((l) => l.trim() === APPENDIX_START);
  const end = all.findIndex((l) => l.trim() === APPENDIX_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Could not locate Appendix A / Appendix B in the extracted text; the publication layout may have changed.');
  }

  // Group the region into items: a heading or bullet line opens an item and
  // every following line belongs to it until the next one opens. Blank lines do
  // not close an item — they are what a removed page break leaves behind.
  const items = [];
  let current = null;
  for (const raw of all.slice(start + 1, end)) {
    if (raw.trim() === '') continue;
    const bullet = /^\s*•\s+(.*)$/.exec(raw);
    const subBullet = /^\s*o\s+(.*)$/.exec(raw);
    if (FUNCTION_RE.test(raw)) {
      current = { kind: 'function', parts: [raw] };
      items.push(current);
    } else if (bullet) {
      current = { kind: 'category', parts: [bullet[1]] };
      items.push(current);
    } else if (subBullet) {
      current = { kind: 'subcategory', parts: [subBullet[1]] };
      items.push(current);
    } else if (current) {
      current.parts.push(raw);
    }
    // Lines before the first heading (the appendix introduction and Table 1)
    // have no open item and are ignored.
  }

  const functions = [];
  const categories = [];
  const subcategories = [];
  for (const item of items) {
    // A wrapped word must never be silently glued or split: a line ending in a
    // letter-hyphen would mean the extractor hyphenated it. Stop and let a
    // maintainer look rather than guess.
    const hyphenated = item.parts.slice(0, -1).find((p) => /\p{L}-$/u.test(p.trimEnd()));
    if (hyphenated) {
      throw new Error(`A line ends with a hyphenated word and cannot be rejoined safely: "${hyphenated.trim()}"`);
    }
    const joined = clean(item.parts.join(' '));
    if (item.kind === 'function') {
      const m = FUNCTION_RE.exec(joined);
      if (!m) throw new Error(`Unparseable Function heading: "${joined}"`);
      functions.push({ id: m[2], name: m[1], outcome: m[3] });
    } else if (item.kind === 'category') {
      const m = CATEGORY_RE.exec(joined);
      if (!m) throw new Error(`Unparseable Category bullet: "${joined}"`);
      categories.push({ id: m[2], name: m[1], outcome: m[3] });
    } else {
      const m = SUBCATEGORY_RE.exec(joined);
      if (!m) throw new Error(`Unparseable Subcategory bullet: "${joined}"`);
      subcategories.push({ id: m[1], outcome: m[2] });
    }
  }
  return { functions, categories, subcategories };
}

/**
 * Cross-check the parsed Spanish Core against the shipped English Core and
 * assemble the data file. Throws on any structural difference.
 */
export function buildSpanishCore(parsed, core) {
  const expectFunctions = core.functions.map((f) => f.id);
  const expectSubs = core.subcategories.map((s) => s.id);
  const expectCategories = [...new Set(expectSubs.map((id) => id.split('-')[0]))];

  const same = (label, got, want) => {
    if (got.length !== want.length || got.some((id, i) => id !== want[i])) {
      const missing = want.filter((id) => !got.includes(id));
      const extra = got.filter((id) => !want.includes(id));
      throw new Error(
        `${label} do not match data/csf-core.json (got ${got.length}, expected ${want.length}` +
          `${missing.length ? `; missing: ${missing.slice(0, 8).join(', ')}` : ''}` +
          `${extra.length ? `; unexpected: ${extra.slice(0, 8).join(', ')}` : ''}` +
          `${!missing.length && !extra.length ? '; same ids, different order' : ''}).`,
      );
    }
  };
  same('Functions', parsed.functions.map((f) => f.id), expectFunctions);
  same('Categories', parsed.categories.map((c) => c.id), expectCategories);
  same('Subcategories', parsed.subcategories.map((s) => s.id), expectSubs);

  for (const entry of [...parsed.functions, ...parsed.categories, ...parsed.subcategories]) {
    for (const value of [entry.name, entry.outcome]) {
      if (value === undefined) continue;
      if (!value || /NIST CSWP|\f/.test(value)) {
        throw new Error(`Suspicious text for ${entry.id} (empty or contains page furniture): "${value}"`);
      }
    }
  }

  return {
    _comment:
      'Spanish text of the NIST Cybersecurity Framework (CSF) 2.0 Core: the names and outcome statements of all 6 Functions, 22 Categories, and 106 Subcategories, reproduced verbatim from Appendix A of NIST CSWP 29 spa, the official U.S. Government Spanish translation published by NIST. It carries no Implementation Examples (NIST publishes those in English only). Keyed by the same identifiers as data/csf-core.json, which remains the authoritative English Core used for the assessment itself. Regenerate with scripts/build-csf-core-es.js.',
    language: 'es',
    frameworkVersion: core.frameworkVersion ?? 'CSF 2.0',
    source: 'NIST CSWP 29 spa — El Marco de Seguridad Cibernética (CSF) 2.0 del NIST (official U.S. Government translation), https://doi.org/10.6028/NIST.CSWP.29.spa',
    citation:
      'Instituto Nacional de Estándares y Tecnología (2024) El Marco de Seguridad Cibernética (CSF) 2.0 del NIST. (National Institute of Standards and Technology, Gaithersburg, MD), NIST Cybersecurity White Paper (CSWP) NIST CSWP 29 spa. https://doi.org/10.6028/NIST.CSWP.29.spa — Republished courtesy of the National Institute of Standards and Technology.',
    functions: parsed.functions,
    categories: parsed.categories,
    subcategories: parsed.subcategories,
  };
}

async function main() {
  const fromPdf = argValue('--from-pdf');
  const work = mkdtempSync(join(tmpdir(), 'csf-es-build-'));
  try {
    let pdfPath = fromPdf;
    if (!pdfPath) {
      console.error(`Downloading the Spanish translation from ${PDF_URL} ...`);
      const res = await fetch(PDF_URL);
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      pdfPath = join(work, 'csf-es.pdf');
      writeFileSync(pdfPath, Buffer.from(await res.arrayBuffer()));
    }

    console.error('Extracting text with pdftotext ...');
    let text;
    try {
      text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (err) {
      throw new Error(`pdftotext failed (${err.message}). Install Poppler (macOS: brew install poppler; Debian/Ubuntu: apt install poppler-utils).`);
    }

    const core = JSON.parse(readFileSync(CORE_PATH, 'utf8'));
    const out = buildSpanishCore(parseSpanishCore(text), core);
    writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
    console.error(
      `Wrote ${out.functions.length} Functions, ${out.categories.length} Categories, ` +
        `${out.subcategories.length} Subcategories to ${OUT_PATH}`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

// Run only when executed directly, so the parsing functions can be imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('build-csf-core-es failed:', err.message);
    process.exitCode = 1;
  });
}
