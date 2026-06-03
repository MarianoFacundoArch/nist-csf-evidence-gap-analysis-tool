/**
 * PDF parser (text layer only).
 *
 * Uses `pdfjs-dist` (Mozilla PDF.js) to extract text PER PAGE, so each page
 * becomes its own segment with a real 1-based page number — this is what lets a
 * PDF evidence quote carry a "p. N" citation all the way to the report. pdfjs
 * is an OPTIONAL, lazily-imported dependency.
 *
 * Known limitation (documented in the README): scanned/image-only PDFs have no
 * text layer. We do NOT perform OCR in v1. When a PDF yields no extractable
 * text, we record a warning and contribute zero segments so the file is skipped
 * gracefully — never silently treated as "no evidence" and never a crash.
 */

import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { ParseError } from '../../core/errors.js';

export async function parsePdf(path) {
  let pdfjs;
  try {
    // The "legacy" build runs in Node without a DOM/canvas, which is all we
    // need for text extraction.
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (err) {
    throw new ParseError(`Cannot parse .pdf — the optional "pdfjs-dist" dependency is not installed.`, {
      cause: err,
      hint: 'Run: npm install pdfjs-dist',
    });
  }

  let doc;
  try {
    const data = new Uint8Array(await readFile(path));
    doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  } catch (err) {
    throw new ParseError(`Failed to open .pdf "${basename(path)}": ${err.message}`, { cause: err });
  }

  const segments = [];
  const warnings = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => (typeof it.str === 'string' ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) segments.push({ text, page: p });
    }
  } catch (err) {
    throw new ParseError(`Failed while extracting text from "${basename(path)}": ${err.message}`, { cause: err });
  }

  if (segments.length === 0) {
    warnings.push(
      'No extractable text layer — likely a scanned/image-only PDF. OCR is out of scope in v1; this file was skipped.',
    );
  }

  return { file: basename(path), path, format: 'pdf', segments, warnings };
}
