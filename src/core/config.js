/**
 * Configuration loader.
 *
 * Responsibilities:
 *  - Merge layers in precedence order: defaults < config file < CLI flags.
 *    (Secrets/endpoints come from .env via env.js into process.env; they are
 *    never part of the config object so they can't leak into a meta snapshot.)
 *  - Validate against the schema and REPAIR rather than crash: any invalid key
 *    is reset to its default (or dropped if unknown) with a warning.
 *  - Apply the `--local` master switch LAST so it deterministically overrides
 *    provider selection regardless of file/flag values.
 */

import Ajv from 'ajv';
import { defaultConfig, DEFAULT_CONFIG_FILENAME } from './defaults.js';
import { configSchema } from './config.schema.js';
import { readJsonSafe } from '../util/fsx.js';
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
  try {
    fileConfig = await readJsonSafe(configPath, null);
  } catch (err) {
    // The file exists but is not valid JSON. Don't crash — warn and ignore it.
    warn(`Config file "${configPath}" is not valid JSON (${err.message}); using defaults + flags only.`);
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
  return [...pointerSegments(pointer), key].join('.');
}
