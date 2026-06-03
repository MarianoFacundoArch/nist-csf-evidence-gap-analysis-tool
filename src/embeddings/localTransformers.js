/**
 * Local, on-device embeddings via transformers.js (@huggingface/transformers).
 *
 * This is the privacy-preserving option: documents never leave the machine. The
 * model runs in-process (ONNX) — no Python, no network after the model is
 * cached. The model id is configurable (config.embeddings.model); the default
 * (a MiniLM-class sentence-transformer) is illustrative — verify availability in
 * the transformers.js model hub.
 *
 * Note: the FIRST run downloads and caches the model, so a truly offline first
 * run requires the model to be pre-cached. transformers.js is an OPTIONAL,
 * lazily-imported dependency. We request mean pooling + normalized output, so
 * vectors are already unit-length.
 */

import { ProviderError } from '../core/errors.js';

export async function createEmbedder(config, logger) {
  let transformers;
  try {
    transformers = await import('@huggingface/transformers');
  } catch (err) {
    throw new ProviderError('The optional "@huggingface/transformers" dependency is not installed.', {
      cause: err,
      hint: 'Run: npm install @huggingface/transformers',
    });
  }

  const model = config.embeddings.model || 'Xenova/all-MiniLM-L6-v2';
  let extractor;
  try {
    logger?.info(`Loading local embedding model "${model}" (first run downloads + caches it) ...`);
    extractor = await transformers.pipeline('feature-extraction', model);
  } catch (err) {
    throw new ProviderError(`Failed to load local embedding model "${model}": ${err.message}`, { cause: err });
  }

  return {
    id: `local-transformers:${model}`,
    dim: null, // discovered from the first embedding
    async embed(texts) {
      const out = [];
      for (const text of texts) {
        // mean-pool token embeddings and L2-normalize inside the pipeline.
        const tensor = await extractor(text, { pooling: 'mean', normalize: true });
        out.push(Array.from(tensor.data));
      }
      return out;
    },
  };
}
