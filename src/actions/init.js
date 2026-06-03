/**
 * INIT action: scaffold a starter config file, copy the env template, and
 * create the working directory — so a new user has something to edit. Existing
 * files are never overwritten.
 */

import { copyFile } from 'node:fs/promises';
import { defaultConfig, DEFAULT_CONFIG_FILENAME } from '../core/defaults.js';
import { fileExists, writeJsonAtomic, ensureDir } from '../util/fsx.js';

export async function init(ctx) {
  const { logger } = ctx;
  const created = [];

  // Honor --config: write the starter config where the user pointed it.
  const configPath = ctx.configPath || DEFAULT_CONFIG_FILENAME;

  // Starter config: the defaults minus the purely per-run flags.
  const cfg = defaultConfig();
  delete cfg.force;
  delete cfg.acceptAll;
  delete cfg.fixedNow;

  if (await fileExists(configPath)) {
    logger.info(`Config already exists: ${configPath} (left unchanged).`);
  } else {
    await writeJsonAtomic(configPath, cfg);
    created.push(configPath);
  }

  // Copy the env template to .env if present and not already set up.
  if (!(await fileExists('.env')) && (await fileExists('.env.example'))) {
    await copyFile('.env.example', '.env');
    created.push('.env');
  }

  await ensureDir(ctx.paths.root);
  created.push(`${ctx.paths.root}/ (working directory)`);

  logger.info(created.length ? `Created: ${created.join(', ')}` : 'Nothing to create — already initialized.');
  logger.info('Next: set "docsPath" in the config (or pass --docs), add any API key to .env, then run `csf-tool all`.');
  logger.info('For a fully offline run, install Ollama + a local model and use `--local`.');
  return { configPath, created };
}
