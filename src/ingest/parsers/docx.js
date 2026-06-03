/**
 * .docx parser.
 *
 * Uses `mammoth` to extract the document's raw text. mammoth is an OPTIONAL,
 * lazily-imported dependency: this module is only loaded when a .docx is
 * actually encountered, so a text/PDF-only run never pulls it in. A .docx has
 * no reliable page concept, so we emit a single page:null segment.
 */

import { basename } from 'node:path';
import { ParseError } from '../../core/errors.js';

export async function parseDocx(path) {
  let mammoth;
  try {
    mammoth = (await import('mammoth')).default;
  } catch (err) {
    throw new ParseError(`Cannot parse .docx — the optional "mammoth" dependency is not installed.`, {
      cause: err,
      hint: 'Run: npm install mammoth',
    });
  }

  let result;
  try {
    result = await mammoth.extractRawText({ path });
  } catch (err) {
    throw new ParseError(`Failed to read .docx "${basename(path)}": ${err.message}`, { cause: err });
  }

  return {
    file: basename(path),
    path,
    format: 'docx',
    segments: [{ text: result.value ?? '', page: null }],
    // mammoth surfaces conversion notes (e.g. unsupported elements) — keep as
    // non-fatal warnings rather than failing the file.
    warnings: (result.messages ?? []).map((m) => m.message).filter(Boolean),
  };
}
