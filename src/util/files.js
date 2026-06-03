/**
 * Document discovery.
 *
 * Given a path that is either a single file or a directory, return the list of
 * supported input documents. Directories are walked recursively. Unsupported
 * extensions are skipped here (the parser layer also guards), and hidden files
 * / node_modules-style noise is ignored.
 */

import { readdir, stat } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

// Formats we can extract a text layer from. Scanned/image-only PDFs (no text
// layer) are detected later at parse time and skipped (no OCR in v1).
export const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.docx', '.pdf']);

const IGNORED_DIRS = new Set(['node_modules', '.git']);

export function isSupported(path) {
  return SUPPORTED_EXTENSIONS.has(extname(path).toLowerCase());
}

/**
 * Discover documents under `pathOrDir`.
 * @returns {Promise<string[]>} absolute-or-relative file paths, sorted for
 *   deterministic ordering (important for reproducible worked-example output).
 */
export async function discoverDocs(pathOrDir) {
  const info = await stat(pathOrDir);
  if (info.isFile()) {
    return isSupported(pathOrDir) ? [pathOrDir] : [];
  }

  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // skip hidden files/dirs
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) await walk(full);
      } else if (entry.isFile() && isSupported(full)) {
        out.push(full);
      }
    }
  }
  await walk(pathOrDir);

  // Sort by base name then full path => stable, machine-independent ordering.
  out.sort((a, b) => basename(a).localeCompare(basename(b)) || a.localeCompare(b));
  return out;
}
