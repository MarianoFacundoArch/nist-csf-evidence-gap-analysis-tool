/**
 * Redaction as a provider DECORATOR (opt-in: `privacy.redact` / `--redact`).
 *
 * WHY here and not at the call sites: document text reaches a provider through
 * many paths — chunk embeddings at ingest, query embeddings, the first-pass
 * prompt, its retry, the critique pass (which re-sends the first-pass JSON),
 * and `ask`. Redacting inside each of those would work until someone adds one
 * more and forgets. Instead the two provider factories (llm/index.js and
 * embeddings/index.js) wrap the provider object itself, so there is exactly one
 * place per provider type that every outbound string passes through, and the
 * engine neither knows about redaction nor can skip it.
 *
 * WHY the verbatim guarantee is untouched: the reasoning decorator restores the
 * placeholders in the model's reply before returning it. The engine therefore
 * sees the document's original strings again, and the unchanged verifier checks
 * every quote against the ORIGINAL chunks. If a model mangles a placeholder, the
 * restored quote does not match and is dropped — a lost quote and a lower,
 * human-reviewed coverage, never an unverifiable quote delivered. To make that
 * rare, a request that contains placeholders also tells the model what they are
 * (PLACEHOLDER_NOTE).
 *
 * A provider that runs on this machine (`isLocal === true`) is never wrapped:
 * nothing it receives leaves the machine, and redacting would only cost
 * retrieval and quoting accuracy. A provider that does not say where it runs is
 * treated as remote.
 *
 * The wrapped provider's id gets a "+redact" suffix on purpose. The index
 * records the embedder id and `analyze`/`ask` refuse a mismatch, so switching
 * redaction on or off forces a re-ingest (vectors of redacted and unredacted
 * text are different vectors); the engine signature changes, so cached
 * assessments are recomputed; and every report's provider line shows that
 * redaction was on.
 */

import { createRedactor } from './redactor.js';

/** Appended to the id of a provider whose input is redacted. */
export const REDACTED_ID_SUFFIX = '+redact';

/**
 * Appended to the system prompt of a request in which something was replaced.
 * Without it a model has no way to know what "[[EMAIL_1]]" is, and may tidy it
 * away or decline to quote it; every placeholder it fails to copy exactly costs
 * a quote. It is added after redaction, so it is never redacted itself, and
 * only when the request actually contains a placeholder — a request with
 * nothing to hide is sent exactly as it would be without redaction. Its example
 * is deliberately not a real placeholder, so nothing in a reply that repeats it
 * is ever "restored".
 */
export const PLACEHOLDER_NOTE =
  'NOTE ON PLACEHOLDERS. Before this text was sent to you, some identifiers in it (such as e-mail addresses, host names, ' +
  'network addresses and names) were replaced with placeholders: a type, an underscore and a number inside double square ' +
  'brackets, in the pattern [[TYPE_N]]. A placeholder is part of the text: when a passage you quote contains one, copy the ' +
  'placeholder exactly as it appears, brackets included. Refer to such a value only by its placeholder. Never guess what a ' +
  'placeholder stands for, and never make one up.';

// A term this short matches inside ordinary words (terms match anywhere, in any
// letter case): "ACE" is in "place", "surface" and "interface". It shreds the
// text instead of protecting a name.
const SHORT_TERM_LENGTH = 4;
const warnedTerms = new Set();

function warnAboutShortTerms(terms, logger) {
  for (const term of terms) {
    if ([...term].length >= SHORT_TERM_LENGTH || warnedTerms.has(term)) continue;
    warnedTerms.add(term); // once per run, although two providers are wrapped
    logger?.warn?.(
      `privacy.terms: "${term}" is very short. A term is replaced wherever it appears, in any letter case and inside longer words, so it will also replace unrelated text.`,
    );
  }
}

/**
 * Wrap a reasoning provider so that what it is sent is redacted and what it
 * returns is restored.
 * @param {{id: string, judge: Function}} inner the real provider
 * @param {{terms?: string[], logger?: object}} [options]
 * @returns {{id: string, isLocal: boolean, judge: Function}}
 */
export function redactingLlm(inner, { terms = [], logger } = {}) {
  const redactor = createRedactor({ terms });
  warnAboutShortTerms(redactor.terms, logger);
  return {
    id: `${inner.id}${REDACTED_ID_SUFFIX}`,
    isLocal: false,
    async judge({ system, user } = {}) {
      // One placeholder map for the whole request: a value named in the system
      // prompt, the evidence and an embedded first-pass JSON is the same
      // placeholder everywhere the model sees it.
      const session = redactor.session();
      const request = { system: session.redactPrompt(system), user: session.redactPrompt(user) };
      if (session.size > 0) request.system = request.system ? `${request.system}\n\n${PLACEHOLDER_NOTE}` : PLACEHOLDER_NOTE;
      logger?.debug?.(`Redaction: ${session.size} value(s) replaced in a request to ${inner.id}.`);
      // `meta` is deliberately NOT forwarded: it holds the original chunks. No
      // real provider reads it, and a wrapped one must not be able to.
      const raw = await inner.judge(request);
      // The reply is JSON text, so originals go back in JSON-escaped form.
      return typeof raw === 'string' ? session.restoreJson(raw) : raw;
    },
  };
}

/**
 * Wrap an embeddings provider so that every text is redacted before it is
 * embedded. Each text is redacted on its own (its own numbering): the same
 * text always yields the same vector, whatever it is batched with. Nothing
 * comes back but numbers, so there is nothing to restore.
 * @param {{id: string, dim: number|null, embed: Function}} inner the real provider
 * @param {{terms?: string[], logger?: object}} [options]
 * @returns {{id: string, dim: number|null, isLocal: boolean, embed: Function}}
 */
export function redactingEmbedder(inner, { terms = [], logger } = {}) {
  const redactor = createRedactor({ terms });
  warnAboutShortTerms(redactor.terms, logger);
  return {
    id: `${inner.id}${REDACTED_ID_SUFFIX}`,
    isLocal: false,
    // Some providers only learn their dimension from the first response.
    get dim() {
      return inner.dim;
    },
    async embed(texts) {
      let replaced = 0;
      const redacted = Array.from(texts ?? [], (text) => {
        const session = redactor.session();
        const out = session.redact(text);
        replaced += session.size;
        return out;
      });
      logger?.debug?.(`Redaction: ${replaced} value(s) replaced across ${redacted.length} text(s) sent to ${inner.id}.`);
      return inner.embed(redacted);
    },
  };
}

/**
 * Called by the provider factories when `privacy.redact` is on: wrap a provider
 * unless it runs on this machine, and say which of the two happened.
 * @param {object} provider the provider the factory just created
 * @param {'llm'|'embeddings'} kind
 * @param {object} config
 * @param {object} [logger]
 * @returns {object} the provider itself (local) or its redacting wrapper
 */
export function applyRedaction(provider, kind, config, logger) {
  const role = kind === 'llm' ? 'reasoning' : 'embeddings';
  if (provider.isLocal === true) {
    logger?.info?.(
      `Redaction is not needed for the ${role} provider "${provider.id}": it runs on this machine, so nothing sent to it leaves the machine.`,
    );
    return provider;
  }

  const options = { terms: config.privacy?.terms ?? [], logger };
  logger?.info?.(
    `Redaction is on for the ${role} provider "${provider.id}": identifiers and listed terms are replaced with placeholders before each request` +
      (kind === 'llm' ? ' and restored in the reply.' : '.'),
  );
  return kind === 'llm' ? redactingLlm(provider, options) : redactingEmbedder(provider, options);
}
