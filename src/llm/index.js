/**
 * Reasoning LLM provider factory.
 *
 * Lazily imports ONLY the selected provider's module, so unused SDKs are never
 * loaded. Returns a uniform object:
 *   { id: string, isLocal: boolean, judge({system, user, meta}) => Promise<string> }
 * `judge` returns RAW text; the mapping engine parses, validates, repairs, and
 * verifies it. `meta` carries structured context used only by the mock provider
 * (real providers ignore it).
 */

import { ConfigError } from '../core/errors.js';

const PROVIDERS = {
  mock: () => import('./mock.js'),
  openai: () => import('./openai.js'),
  ollama: () => import('./ollama.js'),
};

export async function getLlm(config, logger) {
  const id = config.llm.provider;
  const loader = PROVIDERS[id];
  if (!loader) {
    throw new ConfigError(`Unknown LLM provider "${id}". Known: ${Object.keys(PROVIDERS).join(', ')}.`);
  }
  const mod = await loader();
  return mod.createLlm(config, logger);
}
