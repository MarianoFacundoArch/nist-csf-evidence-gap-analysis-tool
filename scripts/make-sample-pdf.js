#!/usr/bin/env node
/**
 * Generates the sample PDF (examples/sample-docs/incident-response-plan.pdf)
 * with a REAL text layer across multiple pages, so the tool's PDF parser and
 * its per-page citation feature are exercised by the worked example.
 *
 * Hand-rolled minimal PDF (no dependency, deterministic output). Each page's
 * content stream draws a list of text lines with BT/Tj/ET operators. Text is
 * ASCII and PDF-escaped.
 *
 * Run: node scripts/make-sample-pdf.js
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Each inner array is one page; each string is one line of text.
const pages = [
  [
    'Northwind Analytics - Incident Response Plan',
    '(Fictitious document for demonstration purposes only.)',
    '',
    'When an incident is declared, the incident response plan is executed in',
    'coordination with relevant third parties, including our managed security',
    'provider, affected clients, and, where required, regulators.',
    '',
    'Incidents are declared by the on-call lead when adverse events meet the',
    'documented incident criteria.',
    '',
    'The incident response team follows defined roles and a documented',
    'escalation path, and each incident is tracked to closure in the ticketing',
    'system.',
  ],
  [
    'Network Monitoring',
    '',
    'The Security Operations Center monitors networks and network services and',
    'reviews intrusion detection system alerts to find potentially adverse',
    'events. Alerts are triaged every business day.',
    '',
    'Recovery',
    '',
    'Once recovery is initiated from the incident response process, systems are',
    'restored from the most recent verified backups. The recovery portion of the',
    'incident response plan was last exercised during a tabletop test in',
    'February, and the results were recorded.',
  ],
];

function escapePdfText(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildContentStream(lines) {
  const parts = ['BT', '/F1 12 Tf', '14 TL', '50 770 Td'];
  for (const line of lines) {
    // Empty line => just advance one line (T*); otherwise show the text.
    parts.push(line === '' ? 'T*' : `(${escapePdfText(line)}) Tj T*`);
  }
  parts.push('ET');
  return parts.join('\n');
}

// --- assemble objects -------------------------------------------------------
// Object numbering: 1 Catalog, 2 Pages, 3 Font, then per page: Page + Contents.
const objects = [];
const pageObjNums = [];
let nextObj = 4;
for (let i = 0; i < pages.length; i++) {
  const contentObj = nextObj++;
  const pageObj = nextObj++;
  pageObjNums.push(pageObj);
  const stream = buildContentStream(pages[i]);
  objects.push({
    num: contentObj,
    body: `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  });
  objects.push({
    num: pageObj,
    body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`,
  });
}

objects.unshift({ num: 3, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' });
objects.unshift({
  num: 2,
  body: `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>`,
});
objects.unshift({ num: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' });

objects.sort((a, b) => a.num - b.num);

// --- serialize with xref ----------------------------------------------------
let pdf = '%PDF-1.4\n';
const offsets = {};
for (const obj of objects) {
  offsets[obj.num] = Buffer.byteLength(pdf);
  pdf += `${obj.num} 0 obj\n${obj.body}\nendobj\n`;
}

const xrefOffset = Buffer.byteLength(pdf);
const count = objects.length + 1; // +1 for the free object 0
pdf += `xref\n0 ${count}\n`;
pdf += '0000000000 65535 f \n';
for (let n = 1; n < count; n++) {
  pdf += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

const outPath = fileURLToPath(new URL('../examples/sample-docs/incident-response-plan.pdf', import.meta.url));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.from(pdf, 'latin1'));
console.error(`Wrote ${outPath} (${Buffer.byteLength(pdf)} bytes, ${pages.length} pages)`);
