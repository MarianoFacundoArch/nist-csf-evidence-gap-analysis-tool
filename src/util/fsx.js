/**
 * Safe filesystem helpers shared across the tool.
 *
 * Two themes:
 *  - Robustness: reads that may legitimately be absent return a default instead
 *    of throwing, so the pipeline can ask "does this stage's output exist yet?"
 *    without try/catch noise.
 *  - Atomic writes: every persisted stage output is written to a temp file and
 *    renamed into place. WHY: a run interrupted mid-write (Ctrl-C, crash) must
 *    never leave a half-written index.json/assessments.json that corrupts a
 *    later resume. rename() is atomic on the same filesystem.
 */

import { readFile, writeFile, rename, mkdir, access, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';

/** True if a path exists and is readable. */
export async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Ensure a directory (and parents) exists. No-op if already present. */
export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

/**
 * Read and parse JSON, returning `fallback` when the file is absent.
 * Throws only when the file exists but is not valid JSON (callers decide how
 * to surface that, e.g. ConfigError with a friendly message).
 */
export async function readJsonSafe(path, fallback = null) {
  if (!(await fileExists(path))) return fallback;
  const text = await readFile(path, 'utf8');
  return JSON.parse(text);
}

/** Read a UTF-8 text file (BOM stripped). */
export async function readText(path) {
  const text = await readFile(path, 'utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Atomically write a string to `path` (temp file + rename). */
export async function writeFileAtomic(path, contents) {
  await ensureDir(dirname(path));
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, contents);
  await rename(tmp, path);
}

/** Atomically write a pretty-printed JSON file. */
export async function writeJsonAtomic(path, value) {
  // 2-space indent + trailing newline => diff-friendly committed artifacts.
  await writeFileAtomic(path, JSON.stringify(value, null, 2) + '\n');
}

export { readdir, stat, join };
