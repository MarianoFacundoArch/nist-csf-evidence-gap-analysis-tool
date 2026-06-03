/**
 * Fully-local reasoning LLM via Ollama.
 *
 * Talks to a local Ollama daemon over its REST API using the built-in fetch —
 * NO SDK dependency. Combined with the local on-device embedder, this lets the
 * entire tool run offline with zero cloud calls (documents never leave the
 * machine). The model id is configurable and names a model you have pulled
 * (e.g. `ollama pull <model>`); it is not hardcoded as authoritative.
 */

import { ProviderError } from '../core/errors.js';

function host() {
  return (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
}

export async function createLlm(config, logger) {
  // Resolve this provider's own default when no model is configured. The user
  // must have pulled it (`ollama pull <model>`); this is not authoritative.
  const model = config.llm.model || 'llama3.2';
  const base = host();

  // Verify the daemon is reachable and the model is available up front, so the
  // failure is one clear message rather than per-subcategory request errors.
  try {
    const res = await fetch(`${base}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { models = [] } = await res.json();
    const names = models.map((m) => m.name);
    if (!names.some((n) => n === model || n.startsWith(`${model}:`))) {
      logger?.warn(`Ollama model "${model}" not found among pulled models. Try: ollama pull ${model}`);
    }
  } catch (err) {
    throw new ProviderError(`Cannot reach the Ollama daemon at ${base}.`, {
      cause: err,
      hint: 'Start it with `ollama serve` and pull a model with `ollama pull <model>`, or set OLLAMA_HOST.',
    });
  }

  return {
    id: `ollama:${model}`,
    isLocal: true,
    async judge({ system, user }) {
      let res;
      try {
        res = await fetch(`${base}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            format: 'json', // ask Ollama to constrain output to JSON
            options: { temperature: config.llm.temperature ?? 0 },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        throw new ProviderError(`Ollama chat request failed: ${err.message}`, { cause: err });
      }
      const data = await res.json();
      return data?.message?.content ?? '';
    },
  };
}
