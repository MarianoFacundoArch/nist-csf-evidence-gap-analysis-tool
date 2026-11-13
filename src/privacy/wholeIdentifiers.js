/**
 * Keeping identifiers WHOLE in the chunks — the ingest side of redaction.
 *
 * WHY this exists: redaction recognizes a value by its form, and every chunk is
 * redacted on its own (when it is embedded, and again each time it is put into
 * a prompt). A chunk normally starts at an arbitrary character offset, so it
 * can start with the tail of a URL, of an address, or of a listed name whose
 * head is in the previous chunk. That tail — a path and query string, the last
 * octets, the second word of the name — matches no pattern and would go out in
 * the clear. No amount of care at the point of sending can fix that: the
 * information needed to recognize the value is no longer in the text.
 *
 * So, with redaction on, `ingest` asks the chunker not to cut inside anything
 * the redactor would replace (chunker.js: `keepTogether`), and records in the
 * index that it did so and for which list of terms. Before a command sends
 * chunks through a redacting provider it checks that record: an index built
 * without redaction, or with a different list of terms, is refused with the
 * instruction to re-ingest — the same way an index built with another embedder
 * is refused.
 *
 * What remains: a single value longer than a whole chunk still has to be cut.
 */

import { createRedactor, detect } from './redactor.js';
import { REDACTED_ID_SUFFIX } from './redactingProviders.js';
import { shortHash } from '../util/hash.js';
import { ConfigError } from '../core/errors.js';

/**
 * Identifies the chunking rules in effect: which terms the chunks were kept
 * whole for. Stored only in the local index and run metadata, next to the
 * documents' full text; it is never sent anywhere.
 */
function chunkingFingerprint(config) {
  return shortHash({ wholeIdentifiers: createRedactor({ terms: config.privacy?.terms }).terms });
}

/**
 * What `ingest` needs when redaction is on.
 * @param {object} config
 * @returns {{keepTogether: (text: string) => Array<{start: number, end: number}>, wholeIdentifiers: string}}
 *   the callback for chunkDocument(), and the marker to record with the index's
 *   chunk parameters
 */
export function chunkProtection(config) {
  const terms = config.privacy?.terms ?? [];
  return {
    keepTogether: (text) => detect(text, { terms }),
    wholeIdentifiers: chunkingFingerprint(config),
  };
}

/**
 * Refuse to send chunks through a redacting provider unless they were cut with
 * the identifiers — and the terms now listed — kept whole. Does nothing when no
 * provider is redacting (redaction off, or every provider local).
 * @param {object} index the loaded index
 * @param {object} config
 * @param {object[]} providers the providers this command is about to use
 */
export function assertChunksFitForRedaction(index, config, providers) {
  if (!providers.some((provider) => String(provider?.id ?? '').endsWith(REDACTED_ID_SUFFIX))) return;
  const recorded = index.chunk_params?.wholeIdentifiers;
  if (recorded === chunkingFingerprint(config)) return;
  throw new ConfigError(
    recorded
      ? 'The list of terms to redact (privacy.terms) has changed since the index was built: a passage may begin or end in the middle of a newly listed name, where it would not be recognized.'
      : 'Redaction is on, but the index was built without it: a passage may begin or end in the middle of an address or a listed name, where it would not be recognized.',
    { hint: 'Re-run `csf-tool ingest` with redaction on (--redact), then run this command again.' },
  );
}
