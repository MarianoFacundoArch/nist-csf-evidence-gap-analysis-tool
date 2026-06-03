/**
 * Embeddings provider factory.
 *
 * Lazily imports ONLY the selected provider's module (and therefore its heavy
 * SDK), so an offline run never loads the cloud SDK and a cloud run never loads
 * the on-device model runtime. Returns a uniform embedder:
 *   { id: string, dim: number|null, embed(texts: string[]) => Promise<number[][]> }
 * where every returned vector is L2-normalized.
 */

import { ConfigError } from '../core/errors.js';

const PROVIDERS = {
  mock: () => import('./mock.js'),
  openai: () => import('./openai.js'),
  'local-transformers': () => import('./localTransformers.js'),
};

export async function getEmbedder(config, logger) {
  const id = config.embeddings.provider;
  const loader = PROVIDERS[id];
  if (!loader) {
    throw new ConfigError(`Unknown embeddings provider "${id}". Known: ${Object.keys(PROVIDERS).join(', ')}.`);
  }
  const mod = await loader();
  return mod.createEmbedder(config, logger);
}
