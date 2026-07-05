#!/usr/bin/env node
/**
 * Regenerates data/csf-core.json from the authoritative NIST CPRT export.
 *
 * This is a MAINTAINER script (not part of the tool's runtime). It exists so
 * the shipped CSF 2.0 Core data is fully reproducible and its provenance is
 * auditable — important because the tool is intended for NIST's CSF 2.0
 * community resources. CSF 2.0 subcategory text is in the public domain.
 *
 * What it does:
 *   1. Downloads the CSF 2.0 reference export (an .xlsx workbook) from CPRT.
 *   2. Unzips it (an .xlsx is a ZIP of XML parts) using the system `unzip`.
 *   3. Parses the "CSF 2.0" worksheet, keeping only the 22 official CSF 2.0
 *      Categories (the workbook also lists withdrawn CSF v1.1 categories for
 *      migration reference) and dropping "[Withdrawn: ...]" placeholder rows.
 *   4. Writes the 106 live Subcategory outcomes — each with its official NIST
 *      Implementation Examples (the workbook's "Implementation Examples"
 *      column, one "Ex N:" entry per example) — to data/csf-core.json.
 *
 * Requirements: network access and the `unzip` utility (preinstalled on macOS
 * and most Linux). Run from the repo root: `node scripts/build-csf-core.js`.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// NOTE: no query parameters — the service's former `?olirids=all` parameter now
// returns HTTP 500 (the parameterless export is the one CPRT itself serves).
const EXPORT_URL = 'https://csrc.nist.gov/extensions/nudp/services/json/csf/download';
const OUT_PATH = fileURLToPath(new URL('../data/csf-core.json', import.meta.url));

// The 22 official CSF 2.0 Categories. Anything else in the workbook is a
// withdrawn CSF v1.1 category retained only to document the migration.
const CSF20_CATEGORIES = new Set([
  'GV.OC', 'GV.RM', 'GV.RR', 'GV.PO', 'GV.OV', 'GV.SC',
  'ID.AM', 'ID.RA', 'ID.IM',
  'PR.AA', 'PR.AT', 'PR.DS', 'PR.PS', 'PR.IR',
  'DE.CM', 'DE.AE',
  'RS.MA', 'RS.AN', 'RS.CO', 'RS.MI',
  'RC.RP', 'RC.CO',
]);

function decodeXml(raw) {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Parse the "Implementation Examples" cell of one Subcategory row. The cell
 * holds one example per line, each prefixed with a marker like "Ex1:". Returns
 * the clean example texts in order (marker stripped, whitespace normalized).
 * Splitting on the markers themselves (not on newlines) keeps a wrapped
 * multi-line example intact and survives line breaks being lost in
 * shared-string decoding; a newline split is the marker-less fallback.
 */
function parseExamples(cell) {
  if (!cell) return [];
  const text = String(cell).trim();
  if (!text || /^\[Withdrawn/i.test(text)) return [];
  const clean = (s) => s.replace(/\s+/g, ' ').trim();
  if (/\bEx\d+\s*:/.test(text)) {
    return text
      .split(/(?=\bEx\d+\s*:)/)
      .map((s) => clean(s.replace(/^Ex\d+\s*:\s*/, '')))
      .filter(Boolean);
  }
  return text.split(/\n+/).map(clean).filter(Boolean);
}

/** Parse an .xlsx worksheet into rows: [{ COL: text }]. Handles self-closing cells. */
function parseSheet(sheetXml, shared) {
  const rows = [];
  for (const rowM of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const cM of rowM[1].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cM[1];
      const inner = cM[2];
      const refM = /r="([A-Z]+)\d+"/.exec(attrs);
      if (!refM || inner == null) continue;
      const vM = /<v>([\s\S]*?)<\/v>/.exec(inner);
      if (!vM) continue;
      cells[refM[1]] = /t="s"/.test(attrs) ? shared[parseInt(vM[1], 10)] : vM[1];
    }
    rows.push(cells);
  }
  return rows;
}

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'csf-build-'));
  try {
    console.error(`Downloading CSF 2.0 export from ${EXPORT_URL} ...`);
    const res = await fetch(EXPORT_URL);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    const xlsxPath = join(work, 'csf.xlsx');
    writeFileSync(xlsxPath, Buffer.from(await res.arrayBuffer()));

    console.error('Unzipping workbook ...');
    execFileSync('unzip', ['-o', '-q', xlsxPath, '-d', work], { stdio: 'inherit' });

    const shared = [...readFileSync(join(work, 'xl/sharedStrings.xml'), 'utf8')
      .matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decodeXml(m[1]));
    // sheet2 is the "CSF 2.0" data sheet (sheet1 is the Introduction tab).
    const rows = parseSheet(readFileSync(join(work, 'xl/worksheets/sheet2.xml'), 'utf8'), shared);

    const functions = [];
    const fseen = new Set();
    const catName = {};
    const subs = [];
    let curFn = null;
    let curCat = null;

    for (const r of rows) {
      if (r.A) {
        const m = /^([A-Z][A-Za-z]+) \(([A-Z]{2})\):/.exec(r.A);
        if (m) {
          curFn = m[2];
          if (!fseen.has(m[2])) {
            fseen.add(m[2]);
            functions.push({ id: m[2], name: m[1] });
          }
        }
      }
      if (r.B) {
        const m = /^(.+?) \(([A-Z]{2}\.[A-Z]{2})\):/.exec(r.B);
        if (m) {
          curCat = m[2];
          catName[m[2]] = m[1];
        }
      }
      if (r.C) {
        const m = /^([A-Z]{2}\.[A-Z]{2}-\d{2}):\s*([\s\S]+)$/.exec(r.C);
        if (m && CSF20_CATEGORIES.has(curCat) && !/^\[Withdrawn/i.test(m[2].trim())) {
          subs.push({
            function: functions.find((f) => f.id === curFn).name,
            category: `${catName[curCat]} (${curCat})`,
            id: m[1],
            outcome: m[2].trim(),
            implementationExamples: parseExamples(r.D),
          });
        }
      }
    }

    if (subs.length !== 106) {
      throw new Error(`Expected 106 subcategories, got ${subs.length}. CPRT export format may have changed; review the parser.`);
    }
    const missingExamples = subs.filter((s) => s.implementationExamples.length === 0);
    if (missingExamples.length > 0) {
      throw new Error(
        `${missingExamples.length} subcategories have no Implementation Examples ` +
          `(${missingExamples.slice(0, 5).map((s) => s.id).join(', ')}…). CPRT export format may have changed; review the parser.`,
      );
    }

    const out = {
      _comment:
        'Complete NIST Cybersecurity Framework (CSF) 2.0 Core: all 106 Subcategory outcomes across 6 Functions and 22 Categories, each with its official NIST Implementation Examples. The CSF 2.0 Core text and Implementation Examples are in the public domain, sourced from the NIST CPRT (Cybersecurity and Privacy Reference Tool, https://csrc.nist.gov/projects/cprt). Implementation Examples are illustrative, not exhaustive, and are not a baseline of required actions. Regenerate with scripts/build-csf-core.js.',
      frameworkVersion: 'CSF 2.0',
      source: 'NIST CPRT — The NIST Cybersecurity Framework (CSF) 2.0 (Final)',
      sample: false,
      functions: functions.map((f) => ({ id: f.id, name: f.name })),
      subcategories: subs,
    };

    writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
    console.error(`Wrote ${subs.length} subcategories to ${OUT_PATH}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('build-csf-core failed:', err.message);
  process.exitCode = 1;
});
