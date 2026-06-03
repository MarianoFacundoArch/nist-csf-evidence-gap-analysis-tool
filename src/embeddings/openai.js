/**
 * Cloud embeddings via the OpenAI API (the default cloud-first embedder).
 *
 * The `openai` SDK is an OPTIONAL, lazily-imported dependency. The model id is
 * configurable (config.embeddings.model); the default is illustrative only —
 * verify the current embeddings model name in the provider's documentation.
 * Vectors are L2-normalized here so the rest of the tool can rely on unit-length
 * vectors regardless of provider.
 */

import { l2normalize } from './normalize.js';
import { ProviderError } from '../core/errors.js';

export async function createEmbedder(config, logger) {
  if (!process.env.OPENAI_API_KEY) {
    throw new ProviderError('OpenAI embeddings selected but OPENAI_API_KEY is not set.', {
      hint: 'Add OPENAI_API_KEY to your .env file, or run with --local to use on-device embeddings.',
    });
  }

  let OpenAI;
  try {
    OpenAI = (await import('openai')).default;
  } catch (err) {
    throw new ProviderError('The optional "openai" dependency is not installed.', {
      cause: err,
      hint: 'Run: npm install openai (or use --local).',
    });
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  // Resolve this provider's own default when no model is configured.
  const model = config.embeddings.model || 'text-embedding-3-small';
  const batchSize = config.embeddings.batchSize ?? 64;

  return {
    id: `openai:${model}`,
    dim: null, // discovered from the first response
    async embed(texts) {
      const out = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        let res;
        try {
          res = await client.embeddings.create({ model, input: batch });
        } catch (err) {
          throw new ProviderError(`OpenAI embeddings request failed: ${err.message}`, { cause: err });
        }
        for (const item of res.data) {
          out.push(Array.from(l2normalize(Float32Array.from(item.embedding))));
        }
      }
      return out;
    },
  };
}
