/**
 * The single construction point for the run context (`ctx`).
 *
 * Both front-ends — the command router and the interactive menu — call
 * buildContext() exactly once and then invoke the SAME action functions with
 * the resulting ctx. This is what guarantees one code path: the only thing that
 * differs between modes is the injected `ctx.ui` (how we prompt/print) and how
 * the front-end displays an action's return value.
 *
 * Providers are exposed as lazy getters: the heavy SDK for a provider is only
 * dynamically imported the first time it is actually needed, so an offline run
 * never loads the cloud SDK and a cloud run never loads the local model runtime.
 */

import { loadConfig } from './config.js';
import { loadEnv } from './env.js';
import { createLogger } from './logger.js';
import { resolvePaths } from './paths.js';

export async function buildContext(cliOverrides = {}) {
  // .env carries only secrets/endpoints; load it into process.env up front.
  await loadEnv();

  // A bootstrap logger captures config-repair warnings before we know logLevel.
  const pending = [];
  const { config, configPath } = await loadConfig(cliOverrides, { warn: (m) => pending.push(m) });

  const logger = createLogger({ level: config.logLevel });
  for (const m of pending) logger.warn(m);

  const paths = resolvePaths(config.workDir);

  // Lazy, memoized provider getters.
  let embedderPromise = null;
  let llmPromise = null;
  const getEmbedder = () =>
    (embedderPromise ??= import('../embeddings/index.js').then((m) => m.getEmbedder(config, logger)));
  const getLlm = () =>
    (llmPromise ??= import('../llm/index.js').then((m) => m.getLlm(config, logger)));

  return {
    config,
    configPath, // path the config was (or would be) loaded from; used by `init`
    logger,
    paths,
    getEmbedder,
    getLlm,
    // Timestamp source. A fixed value (set in the worked-example config) makes
    // generated output byte-identical across runs/machines.
    now: () => config.fixedNow || new Date().toISOString(),
    // Interactivity port, injected by the front-end (CLI or menu).
    ui: null,
  };
}
