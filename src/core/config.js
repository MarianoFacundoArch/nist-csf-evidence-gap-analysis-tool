/**
 * Configuration loader.
 *
 * Responsibilities:
 *  - Merge layers in precedence order: defaults < config file < CLI flags.
 *    (Secrets/endpoints come from .env via env.js into process.env; they are
 *    never part of the config object so they can't leak into a meta snapshot.)
 *  - Validate against the schema and REPAIR rather than crash: any invalid key
 *    is reset to its default (or dropped if unknown) with a warning.
 *  - Never GUESS a whole file. A config file that exists but cannot be read is
 *    an error, not "use the defaults": the defaults are cloud-first, so running
 *    on them would silently replace the user's choice of where their documents
 *    are sent, and whether identifiers are redacted.
 *  - Apply the `--local` master switch LAST so it deterministically overrides
 *    provider selection regardless of file/flag values.
 */

import Ajv from 'ajv';
import { defaultConfig, DEFAULT_CONFIG_FILENAME } from './defaults.js';
import { configSchema } from './config.schema.js';
import { readJsonSafe, fileExists } from '../util/fsx.js';
import { ConfigError } from './errors.js';

const ajv = new Ajv({ allErrors: true, useDefaults: false });
const validate = ajv.compile(configSchema);

/** Deep-merge plain objects (arrays and scalars from `src` replace `dst`). */
function deepMerge(dst, src) {
  if (!src) return dst;
  for (const [key, value] of Object.entries(src)) {
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject(dst[key])) {
      deepMerge(dst[key], value);
    } else {
      dst[key] = value;
    }
  }
  return dst;
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * @param {object} cliOverrides config slice derived from CLI flags
 * @param {object} [opts]
 * @param {(msg: string) => void} [opts.warn] sink for repair warnings
 * @returns {Promise<{config: object, sources: object}>}
 */
export async function loadConfig(cliOverrides = {}, { warn = () => {} } = {}) {
  const config = defaultConfig();

  // 1) Config file (path may itself be overridden by a flag).
  const configPath = cliOverrides.configPath || DEFAULT_CONFIG_FILENAME;
  let fileConfig = null;
  const hasFile = await fileExists(configPath);
  try {
    if (hasFile) fileConfig = await readJsonSafe(configPath, null);
  } catch (err) {
    // The file exists but cannot be read as JSON (a syntax error such as a
    // trailing comma, a directory, a permission problem). Repairing one bad
    // value is safe; ignoring the whole file is not — every setting in it,
    // including the offline switch and redaction, would quietly fall back to
    // the cloud-first defaults. Stop before anything is read or sent.
    throw new ConfigError(`Config file "${configPath}" could not be read as JSON (${err.message}).`, {
      hint: 'Fix the file, or move it aside to run on the built-in defaults. Nothing was sent anywhere.',
    });
  }
  // Valid JSON that is not an object (a list, null, a bare value) holds no
  // settings this loader can use; treating it as "no file" would be the same
  // silent fallback as above.
  if (hasFile && !isPlainObject(fileConfig)) {
    throw new ConfigError(`Config file "${configPath}" must contain a JSON object ({ ... }).`, {
      hint: 'Fix the file, or move it aside to run on the built-in defaults. Nothing was sent anywhere.',
    });
  }
  if (fileConfig) deepMerge(config, fileConfig);

  // 2) CLI flags (highest precedence). configPath is consumed above, not stored.
  const { configPath: _omit, ...flagConfig } = cliOverrides;
  deepMerge(config, flagConfig);

  // 3) Validate + repair offending keys back to defaults.
  repairInvalid(config, warn);

  // 4) Cross-field invariant: overlap must be strictly less than chunk size.
  if (config.chunk.overlap >= config.chunk.size) {
    const fixed = Math.max(0, config.chunk.size - 1);
    warn(`chunk.overlap (${config.chunk.overlap}) >= chunk.size (${config.chunk.size}); clamping overlap to ${fixed}.`);
    config.chunk.overlap = fixed;
  }

  // 5) --local master switch: force fully-offline providers, applied last.
  if (config.local) {
    if (config.embeddings.provider !== 'local-transformers' || config.llm.provider !== 'ollama') {
      warn('Local mode (--local): forcing on-device embeddings (local-transformers) and a local LLM (ollama); any cloud provider settings are ignored.');
    }
    config.embeddings.provider = 'local-transformers';
    config.llm.provider = 'ollama';
  }

  // 6) A model pinned in the config file belongs to the provider it was written
  // for. If the effective provider differs from the file's provider (because
  // --local or --embed-provider/--llm-provider switched it) and the user did NOT
  // pass an explicit model flag, drop that model so the active provider resolves
  // its OWN default — otherwise e.g. a cloud "text-embedding-3-large" would be
  // handed to the on-device embedder, which cannot load it.
  if (
    fileConfig?.embeddings?.model &&
    config.embeddings.provider !== fileConfig?.embeddings?.provider &&
    cliOverrides.embeddings?.model == null
  ) {
    config.embeddings.model = null;
  }
  if (
    fileConfig?.llm?.model &&
    config.llm.provider !== fileConfig?.llm?.provider &&
    cliOverrides.llm?.model == null
  ) {
    config.llm.model = null;
  }

  return { config, configPath };
}

/**
 * Validate `config` in place; for each schema violation, reset the offending
 * path to its default value (or delete an unknown key). Re-validate once; if it
 * still fails, the config is too broken to repair and we throw a ConfigError.
 */
function repairInvalid(config, warn) {
  if (validate(config)) return;

  const defaults = defaultConfig();
  for (const err of validate.errors ?? []) {
    // The one exception to "repair and warn": a privacy setting is never
    // guessed. Reverting it to a default would switch redaction off, or empty
    // the list of terms, behind a warning that is easy to miss (and that
    // --quiet hides) — the user would believe text is redacted when it is not.
    const privacyKey = privacySettingIn(err);
    if (privacyKey) {
      throw new ConfigError(`Invalid privacy setting "${privacyKey}": ${describePrivacyError(err)}.`, {
        hint: 'Redaction settings are never repaired or guessed. Expected: "privacy": { "redact": true, "terms": ["Name", "Other name"] }.',
      });
    }
    if (err.keyword === 'additionalProperties') {
      const parent = pointerGet(config, err.instancePath);
      const bad = err.params.additionalProperty;
      if (parent && typeof parent === 'object') {
        delete parent[bad];
        warn(`Unknown config key "${joinPointer(err.instancePath, bad)}" ignored.`);
      }
    } else {
      const def = pointerGet(defaults, err.instancePath);
      pointerSet(config, err.instancePath, def);
      warn(`Invalid config value at "${err.instancePath || '(root)'}" (${err.message}); reverted to default.`);
    }
  }

  if (!validate(config)) {
    throw new ConfigError('Configuration could not be repaired to a valid state.', {
      hint: 'Delete or fix csf-tool.config.json, or run `csf-tool init` to regenerate it.',
    });
  }
}

/**
 * The dotted name of the privacy setting a validation error is about, or null.
 * Besides everything under "privacy", this catches the misplaced and misspelled
 * forms that would otherwise be dropped as unknown keys ("redact": true at the
 * top level, "privacy": { "term": [...] }).
 */
function privacySettingIn(err) {
  const unknownKey = err.keyword === 'additionalProperties' ? err.params.additionalProperty : null;
  if (err.instancePath === '/privacy' || err.instancePath.startsWith('/privacy/')) {
    return unknownKey ? joinPointer(err.instancePath, unknownKey) : joinPointer(err.instancePath, null);
  }
  return unknownKey && /^(?:redact|privacy|terms?$)/i.test(unknownKey) ? joinPointer(err.instancePath, unknownKey) : null;
}

function describePrivacyError(err) {
  return err.keyword === 'additionalProperties' ? 'this key is not recognized' : err.message;
}

// --- JSON-pointer helpers (instancePath form: "/embeddings/provider") -------

function pointerSegments(pointer) {
  return pointer ? pointer.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~')) : [];
}

function pointerGet(obj, pointer) {
  let cur = obj;
  for (const seg of pointerSegments(pointer)) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function pointerSet(obj, pointer, value) {
  const segs = pointerSegments(pointer);
  if (segs.length === 0) return; // can't replace the whole root here
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    if (!isPlainObject(cur[segs[i]])) cur[segs[i]] = {};
    cur = cur[segs[i]];
  }
  cur[segs[segs.length - 1]] = value;
}

function joinPointer(pointer, key) {
  return [...pointerSegments(pointer), ...(key == null ? [] : [key])].join('.');
}
