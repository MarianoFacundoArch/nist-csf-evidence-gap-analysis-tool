/**
 * Cloud reasoning LLM via the OpenAI API (the default cloud-first provider).
 *
 * The `openai` SDK is OPTIONAL and lazily imported. The model id is configurable;
 * the default is illustrative only — verify the current model name in the
 * provider's documentation. We request JSON output and return the RAW text so
 * the mapping engine performs all parsing/validation/repair uniformly.
 *
 * Model-family compatibility: newer "next-gen" models (the GPT-5 family and the
 * o-series reasoning models) changed the request contract — they require
 * `max_completion_tokens` instead of `max_tokens`, only accept the default
 * temperature, and accept a `reasoning_effort` hint. We adapt by family AND
 * self-heal: if the API rejects a parameter (HTTP 400 naming it), we drop that
 * parameter and retry, so the tool keeps working across model generations.
 */

import { ProviderError } from '../core/errors.js';

const NEXT_GEN = /^(gpt-5|o\d)/i; // gpt-5.x, o1/o3/o4, ...

export async function createLlm(config, logger) {
  if (!process.env.OPENAI_API_KEY) {
    throw new ProviderError('OpenAI LLM selected but OPENAI_API_KEY is not set.', {
      hint: 'Add OPENAI_API_KEY to your .env file, or run with --local to use a local Ollama model.',
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
  const model = config.llm.model || 'gpt-4o-mini';
  const nextGen = NEXT_GEN.test(model);
  const temperature = config.llm.temperature ?? 0;
  const maxTokens = config.llm.maxTokens ?? 1024;

  function baseParams(system, user) {
    const params = {
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    if (nextGen) {
      // Reasoning tokens count toward the budget, so give headroom; keep
      // reasoning light for this short, structured judgment task.
      params.max_completion_tokens = Math.max(maxTokens, 4096);
      params.reasoning_effort = 'low';
      // These models only support the default temperature; omit it unless the
      // user explicitly asked for the default value.
      if (temperature === 1) params.temperature = 1;
    } else {
      params.max_tokens = maxTokens;
      params.temperature = temperature;
    }
    return params;
  }

  return {
    id: `openai:${model}`,
    isLocal: false,
    async judge({ system, user }) {
      let params = baseParams(system, user);
      // Up to 3 attempts: each 400 that names an unsupported parameter strips
      // that parameter and retries, so we self-heal across model generations.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await client.chat.completions.create(params);
          return res.choices?.[0]?.message?.content ?? '';
        } catch (err) {
          const dropped = attempt < 2 && stripUnsupportedParam(params, err);
          if (dropped) {
            logger?.debug?.(`OpenAI rejected parameter "${dropped}"; retrying without it.`);
            continue;
          }
          throw new ProviderError(`OpenAI chat request failed: ${err.message}`, { cause: err });
        }
      }
      return '';
    },
  };
}

/**
 * If `err` is a 400 about an unsupported parameter, delete that parameter from
 * `params` (mutating it) and return its name; otherwise return null.
 */
function stripUnsupportedParam(params, err) {
  const status = err?.status ?? err?.response?.status;
  const message = err?.message ?? '';
  if (status !== 400) return null;
  if (!/unsupported|not supported|unknown parameter|does not support/i.test(message)) return null;
  // The offending parameter name appears in single quotes in the message.
  const m = /'([a-zA-Z_]+)'/.exec(message);
  const name = m?.[1];
  if (name && name in params) {
    delete params[name];
    return name;
  }
  return null;
}
