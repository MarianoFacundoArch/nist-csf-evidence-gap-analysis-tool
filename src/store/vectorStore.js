/**
 * In-memory vector store with on-disk persistence.
 *
 * The corpus is one organization's documents — hundreds to low thousands of
 * chunks — so an exact linear dot-product scan is microseconds-to-milliseconds
 * and needs no approximate-nearest-neighbour index or external database (which
 * would add a dependency and a correctness caveat for no benefit at this scale).
 *
 * Vectors are stored already L2-normalized, so similarity is a plain dot
 * product. The index records the embedder id + dimension so a later stage can
 * detect a model change (mixing vectors from two different embedding models is
 * meaningless) and tell the user to re-ingest instead of producing garbage.
 */

import { writeJsonAtomic, readJsonSafe, fileExists } from '../util/fsx.js';
import { l2normalize, dot } from '../embeddings/normalize.js';
import { shortHash } from '../util/hash.js';
import { ConfigError, StageError } from '../core/errors.js';

/** Assemble an index object from chunks + their (normalized) vectors. */
export function buildIndex({ chunks, vectors, embedderId, dim, chunkParams, createdAt }) {
  // A CONTENT-derived index id: stable across re-ingests of identical documents
  // with the same embedder/chunking, so the analyze stage's resume cache is not
  // busted just because `created_at` (wall-clock) changed. Hash the chunk
  // identity + text (not the vectors, which drift slightly with real providers).
  const indexId = shortHash({
    embedder_id: embedderId,
    chunk_params: chunkParams,
    chunks: chunks.map((c) => ({
      id: c.id,
      source_file: c.source_file,
      page: c.page ?? null,
      char_start: c.char_start,
      char_end: c.char_end,
      text: c.text,
    })),
  });
  return {
    dim,
    embedder_id: embedderId,
    index_id: indexId,
    created_at: createdAt,
    chunk_params: chunkParams,
    chunks: chunks.map((c, i) => ({ ...c, vector: vectors[i] })),
  };
}

export async function saveIndex(path, index) {
  await writeJsonAtomic(path, index);
}

/**
 * Load an index from disk. Returns the raw chunks plus a parallel array of
 * Float32Array vectors for the scan. Throws a StageError (caught and shown as
 * guidance) if ingest has not run yet.
 */
export async function loadIndex(path) {
  if (!(await fileExists(path))) {
    throw new StageError(`No document index found at ${path}.`, {
      hint: 'Run `csf-tool ingest` first (it parses your documents and builds the index).',
    });
  }
  const index = await readJsonSafe(path);
  const vectors = index.chunks.map((c) => Float32Array.from(c.vector));
  return { ...index, vectors };
}

/**
 * Retrieve the top-k chunks most similar to a query vector.
 * @returns {Array<{chunk: object, score: number}>}
 */
export function topK(index, queryVecRaw, k) {
  const q = l2normalize(Float32Array.from(queryVecRaw));
  if (index.dim != null && q.length !== index.dim) {
    throw new ConfigError(
      `Query vector dimension ${q.length} != index dimension ${index.dim}. ` +
        'The embedding model changed since ingest; re-run `csf-tool ingest`.',
    );
  }
  const scored = [];
  for (let i = 0; i < index.vectors.length; i++) {
    scored.push({ chunk: index.chunks[i], score: dot(q, index.vectors[i]) });
  }
  // Deterministic ordering: by score desc, then by chunk id for stable ties.
  scored.sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
  return scored.slice(0, Math.max(0, k));
}
