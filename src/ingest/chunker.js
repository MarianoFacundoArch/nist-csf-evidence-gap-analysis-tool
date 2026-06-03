/**
 * Overlapping text chunker.
 *
 * WHY chunk: an embedding model emits one vector per input. A whole policy
 * document would collapse to a meaningless average vector, and retrieval needs
 * fine-grained pieces so the top-k lands the specific paragraph that proves an
 * outcome. WHY overlap: so a sentence that proves an outcome is never split
 * across a boundary and lost to retrieval.
 *
 * WHY characters, not tokens: the tool must run with a local embedding model
 * whose tokenizer we don't control. Character counts are provider-independent
 * and can never crash. (Defaults ~1200/200 chars ≈ a focused paragraph or two.)
 *
 * The chunker runs PER SEGMENT (a segment is one PDF page, or the whole body of
 * a non-paginated file). A chunk therefore never spans two pages, so a PDF
 * chunk's page number is always exact and survives to the final evidence quote.
 */

import { basename } from 'node:path';
import { shortHash } from '../util/hash.js';

function clampInt(n, lo, hi) {
  n = Math.trunc(Number(n));
  if (!Number.isFinite(n)) n = lo;
  return Math.max(lo, Math.min(hi, n));
}

/** Collapse runs of spaces/tabs but keep newlines (which carry structure). */
function normalizeForChunking(text) {
  return text.replace(/[ \t\f\v]+/g, ' ').replace(/\n{3,}/g, '\n\n');
}

/**
 * Nudge a cut point backward to a clean boundary (sentence end, else
 * whitespace) within a small look-back window, so quotes are not sliced
 * mid-word. Falls back to the hard offset if no boundary is found — correctness
 * over prettiness.
 */
function snapToBoundary(text, start, end, lookback = 120) {
  if (end >= text.length) return end;
  const min = Math.max(start + 1, end - lookback);
  for (let i = end; i > min; i--) {
    const c = text[i - 1];
    if ((c === '.' || c === '!' || c === '?') && /\s/.test(text[i] ?? ' ')) return i;
  }
  for (let i = end; i > min; i--) {
    if (/\s/.test(text[i - 1])) return i;
  }
  return end;
}

/**
 * @param {{file:string, path:string, format:string, segments:Array<{text:string, page:number|null}>}} parsed
 * @param {{size?:number, overlap?:number}} [opts]
 * @returns {Array<object>} chunk records
 */
export function chunkDocument(parsed, { size = 1200, overlap = 200 } = {}) {
  const chunkSize = clampInt(size, 100, 100000);
  const chunkOverlap = clampInt(overlap, 0, chunkSize - 1);
  const fileSlug = slug(basename(parsed.file));

  const chunks = [];
  let globalOrdinal = 0;

  for (const segment of parsed.segments) {
    const text = normalizeForChunking(segment.text ?? '');
    if (text.trim().length === 0) continue; // skip blank pages/segments

    const pageTag = segment.page == null ? 'na' : `p${segment.page}`;

    // Small segment: a single chunk, no overlap math.
    if (text.length <= chunkSize) {
      chunks.push(makeChunk(parsed, fileSlug, pageTag, segment.page, text, 0, text.length, globalOrdinal++));
      continue;
    }

    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + chunkSize, text.length);
      end = snapToBoundary(text, start, end);
      const slice = text.slice(start, end);
      chunks.push(makeChunk(parsed, fileSlug, pageTag, segment.page, slice, start, end, globalOrdinal++));
      if (end >= text.length) break;
      // The next chunk starts `overlap` chars before the EMITTED end, so it
      // overlaps the tail of this chunk and NEVER leaves a gap (next <= end).
      // If a short boundary snap means honoring the full overlap would not move
      // forward, continue contiguously from `end` (covers all text; reduced
      // overlap at that one boundary). end > start guarantees progress, so the
      // loop always terminates and no source characters are ever dropped.
      let next = end - chunkOverlap;
      if (next <= start) next = end;
      start = next;
    }
  }

  return chunks;
}

function makeChunk(parsed, fileSlug, pageTag, page, text, charStart, charEnd, ordinal) {
  // Include a short hash of the full source PATH so two documents that share a
  // basename in different folders never collide on chunk id (keeps chunk_id a
  // unique provenance key and a stable top-k tie-break).
  const docTag = shortHash(parsed.path).slice(0, 6);
  return {
    id: `${fileSlug}~${docTag}#${pageTag}#c${ordinal}`,
    source_file: parsed.file,
    source_path: parsed.path,
    page: page ?? null,
    char_start: charStart,
    char_end: charEnd,
    text,
  };
}

function slug(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}
