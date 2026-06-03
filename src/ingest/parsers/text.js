/**
 * Plain-text and Markdown parser.
 *
 * Markdown is treated as plain text for content purposes: we keep headings and
 * body text verbatim (so any quote the model copies matches byte-for-byte after
 * normalization). Neither format has a page concept, so there is a single
 * segment with page: null.
 */

import { basename } from 'node:path';
import { readText } from '../../util/fsx.js';

export async function parseTextual(path, format) {
  const text = await readText(path); // BOM stripped, UTF-8 (lossy replace on bad bytes)
  return {
    file: basename(path),
    path,
    format,
    segments: [{ text, page: null }],
    warnings: [],
  };
}
