/**
 * Locates the files that ship WITH the tool: the CSF data under data/ and the
 * .env template.
 *
 * WHY: configuration paths are relative to the working directory, which is
 * right for everything the user owns (documents, the work directory, a config
 * file, a CSF export of their own). But the built-in defaults such as
 * "data/csf-core.json" name files inside the installed package, and resolving
 * those against the working directory only works when the tool happens to be
 * run from its own repository root. Run from anywhere else — a client folder
 * after `npm link`, or a global/npx install — every command stopped with
 * "CSF core data file not found".
 *
 * The rule here keeps the user in control and fails honestly:
 *   1. A path that exists as given (relative to the working directory, or
 *      absolute) always wins — a user's own data file is never shadowed.
 *   2. Otherwise, ONLY when the configured value is still the built-in default,
 *      use the copy shipped with the tool.
 *   3. Anything else is returned unchanged, so a mistyped custom path is still
 *      reported as not found instead of silently loading the bundled file.
 */

import { fileURLToPath } from 'node:url';
import { isAbsolute, normalize } from 'node:path';
import { fileExists } from '../util/fsx.js';

// src/core/ -> the package root, wherever the package is installed.
const PACKAGE_ROOT = new URL('../../', import.meta.url);

/** Absolute path of a file inside the installed package. */
export function bundledPath(relative) {
  return fileURLToPath(new URL(relative, PACKAGE_ROOT));
}

/**
 * Resolve a configured data path, falling back to the bundled copy when (and
 * only when) the configured value is the built-in default and no such file
 * exists relative to the working directory.
 *
 * @param {string} configured the path from the configuration
 * @param {string} bundledDefault the built-in default for that setting,
 *   relative to the package root (e.g. "data/csf-core.json")
 * @returns {Promise<string>} the path to read
 */
export async function resolveDataPath(configured, bundledDefault) {
  if (typeof configured !== 'string' || configured === '') return configured;
  if (await fileExists(configured)) return configured;
  if (!isAbsolute(configured) && normalize(configured) === normalize(bundledDefault)) {
    const shipped = bundledPath(bundledDefault);
    if (await fileExists(shipped)) return shipped;
  }
  return configured;
}
