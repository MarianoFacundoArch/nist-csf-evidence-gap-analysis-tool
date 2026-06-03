/**
 * Deterministic, offline MOCK embedder.
 *
 * WHY it exists: the test suite and the committed worked example must be
 * reproducible byte-for-byte on any machine with no network and no API key.
 * This embedder is a classic "hashing vectorizer": it maps each token to a
 * fixed dimension via a stable hash and accumulates a signed count, then
 * L2-normalizes. Because it is content-derived, two texts that share vocabulary
 * (e.g. a subcategory mentioning "inventory of hardware" and a document
 * describing a "hardware inventory") land near each other in cosine space — so
 * retrieval produces a sensible, deterministic ordering without any real model.
 *
 * It is NOT a semantic model and must never be used for a real assessment; it
 * is selected only via `provider: "mock"` (tests / worked example).
 */

import { l2normalize } from './normalize.js';

const DIM = 512;

// FNV-1a — small, fast, deterministic, no dependency.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

export function createEmbedder() {
  return {
    id: 'mock',
    dim: DIM,
    async embed(texts) {
      return texts.map((text) => {
        const v = new Float32Array(DIM);
        for (const tok of tokenize(text)) {
          const h = fnv1a(tok);
          const idx = h % DIM;
          const sign = (h >>> 9) & 1 ? 1 : -1;
          v[idx] += sign;
        }
        return Array.from(l2normalize(v));
      });
    },
  };
}
