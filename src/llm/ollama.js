/**
 * Fully-local reasoning LLM via Ollama.
 *
 * Talks to a local Ollama daemon over its REST API using the built-in fetch —
 * NO SDK dependency. Combined with the local on-device embedder, this lets the
 * entire tool run offline with zero cloud calls (documents never leave the
 * machine). The model id is configurable and names a model you have pulled
 * (e.g. `ollama pull <model>`); it is not hardcoded as authoritative.
 *
 * "Local" is a property of where the daemon is, not of the provider's name: the
 * provider reports `isLocal` only when OLLAMA_HOST is a loopback address, and
 * warns when it is not.
 */

import { ProviderError } from '../core/errors.js';

function host() {
  // Accept OLLAMA_HOST with or without a scheme — Ollama's own convention is a
  // bare "host:port" (e.g. 127.0.0.1:11434), which fetch() cannot use directly.
  let h = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  if (!/^https?:\/\//i.test(h)) h = `http://${h}`;
  return h.replace(/\/$/, '');
}

/**
 * Is this endpoint on THIS machine? True only for a loopback host: localhost,
 * 127.0.0.0/8 or ::1. OLLAMA_HOST can point anywhere, and a daemon on another
 * machine receives every prompt over the network — that is not "local", and
 * opt-in redaction must apply to it. Anything that cannot be shown to be
 * loopback (a name that merely resolves to 127.0.0.1, the bind-all address
 * 0.0.0.0, an unparseable value) counts as remote: the safe side.
 * @param {string} url the Ollama base URL
 * @returns {boolean}
 */
export function isLoopbackUrl(url) {
  let hostname;
  try {
    // URL parsing also normalizes the numeric spellings of an address (127.1, 0x7f000001).
    hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return false;
  }
  return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.[0-9]{1,3}){3}$/.test(hostname);
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

  const isLocal = isLoopbackUrl(base);
  if (!isLocal) {
    logger?.warn(
      `The Ollama host (${base}) is not this machine: prompts are sent to it over the network.` +
        (config.privacy?.redact ? '' : ' Use --redact to replace identifiers with placeholders first.'),
    );
  }

  return {
    id: `ollama:${model}`,
    isLocal,
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
