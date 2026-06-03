/**
 * Parser dispatch.
 *
 * Routes a file to the correct per-format parser by extension. Heavy parser
 * dependencies (mammoth for .docx, pdfjs-dist for .pdf) are lazily imported
 * inside their modules, so a text/markdown-only corpus never loads them.
 *
 * Every parser returns the same shape:
 *   { file, path, format, segments: [{ text, page|null }], warnings: string[] }
 * One segment per PDF page (real page numbers); a single page:null segment for
 * non-paginated formats. The caller (ingest pipeline) wraps each call so one
 * bad file can never abort the whole run.
 */

import { extname } from 'node:path';
import { ParseError } from '../../core/errors.js';
import { parseTextual } from './text.js';

export async function parseFile(path) {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case '.txt':
      return parseTextual(path, 'txt');
    case '.md':
    case '.markdown':
      return parseTextual(path, 'md');
    case '.docx': {
      const { parseDocx } = await import('./docx.js');
      return parseDocx(path);
    }
    case '.pdf': {
      const { parsePdf } = await import('./pdf.js');
      return parsePdf(path);
    }
    default:
      throw new ParseError(`Unsupported file type "${ext}" for ${path}`, {
        hint: 'Supported inputs: .txt, .md, .docx, and .pdf with a real text layer.',
      });
  }
}
