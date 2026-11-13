/**
 * Embeddings provider factory.
 *
 * Lazily imports ONLY the selected provider's module (and therefore its heavy
 * SDK), so an offline run never loads the cloud SDK and a cloud run never loads
 * the on-device model runtime. Returns a uniform embedder:
 *   { id: string, dim: number|null, isLocal: boolean, embed(texts: string[]) => Promise<number[][]> }
 * where every returned vector is L2-normalized. `isLocal` says whether the
 * texts stay on this machine.
 *
 * This factory is also the single choke point for opt-in redaction: with
 * `privacy.redact` on, an embedder that is not local is returned wrapped, so
 * every text it is ever sent is redacted first (see
 * ../privacy/redactingProviders.js). With the option off, the provider object
 * is returned exactly as created.
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
  const embedder = await mod.createEmbedder(config, logger);
  if (!config.privacy?.redact) return embedder;
  const { applyRedaction } = await import('../privacy/redactingProviders.js');
  return applyRedaction(embedder, 'embeddings', config, logger);
}
