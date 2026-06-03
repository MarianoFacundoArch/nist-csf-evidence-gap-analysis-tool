/**
 * L2 normalization.
 *
 * WHY: cosine similarity is dot(a,b) / (|a|·|b|). If every stored chunk vector
 * and every query vector is unit-length, the denominator is 1 and cosine
 * collapses to a plain dot product — removing a sqrt and a division from the
 * hot loop of the top-k scan and making scores directly comparable across
 * chunks. We normalize chunk vectors once at ingest and the query vector once
 * per retrieval.
 *
 * The zero/NaN guard matters: a degenerate embedding (all zeros, or a provider
 * returning NaN) must not produce Infinity scores that poison the ranking. Such
 * a vector is left effectively zero and simply never gets retrieved.
 */

export function l2normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum);
  const out = new Float32Array(vec.length);
  if (norm === 0 || !Number.isFinite(norm)) return out; // all-zero => scores ~0
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

/** Dot product of two equal-length vectors (== cosine when both are unit-length). */
export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
