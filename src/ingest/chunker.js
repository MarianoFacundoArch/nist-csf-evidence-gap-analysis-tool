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
 *
 * Cut points are character offsets, so by default a chunk can begin in the
 * middle of a word. That is harmless for retrieval, but not when each chunk is
 * later scanned ON ITS OWN for identifiers to replace (opt-in redaction): the
 * tail of an address cut off at a chunk start is no longer recognizable as an
 * address. The optional `keepTogether` callback names spans that no cut may
 * fall inside; without it, chunking is exactly what it always was.
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

/** The span, if any, that `position` falls strictly inside (so that cutting there would split it). */
function spanAround(spans, position) {
  return spans.find((span) => span.start < position && position < span.end) ?? null;
}

/**
 * @param {{file:string, path:string, format:string, segments:Array<{text:string, page:number|null}>}} parsed
 * @param {object} [opts]
 * @param {number} [opts.size]
 * @param {number} [opts.overlap]
 * @param {(text: string) => Array<{start:number, end:number}>} [opts.keepTogether]
 *   returns, for a segment's text, the non-overlapping spans a chunk must not
 *   begin or end inside. A span longer than a whole chunk is still cut.
 * @returns {Array<object>} chunk records
 */
export function chunkDocument(parsed, { size = 1200, overlap = 200, keepTogether = null } = {}) {
  const chunkSize = clampInt(size, 100, 100000);
  const chunkOverlap = clampInt(overlap, 0, chunkSize - 1);
  const fileSlug = slug(basename(parsed.file));

  const chunks = [];
  let globalOrdinal = 0;

  for (const segment of parsed.segments) {
    const text = normalizeForChunking(segment.text ?? '');
    if (text.trim().length === 0) continue; // skip blank pages/segments

    const pageTag = segment.page == null ? 'na' : `p${segment.page}`;
    const spans = typeof keepTogether === 'function' ? keepTogether(text) : [];

    // Small segment: a single chunk, no overlap math.
    if (text.length <= chunkSize) {
      chunks.push(makeChunk(parsed, fileSlug, pageTag, segment.page, text, 0, text.length, globalOrdinal++));
      continue;
    }

    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + chunkSize, text.length);
      end = snapToBoundary(text, start, end);
      // Never end inside a protected span: end just before it instead, and let
      // the next chunk carry it whole. (If the span began at or before this
      // chunk's start it is longer than a chunk, and has to be cut.)
      const cut = spanAround(spans, end);
      if (cut && cut.start > start) end = cut.start;
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
      // Never begin inside a protected span either: begin at its start (a
      // little more overlap), or right after it when that start is not ahead
      // of this chunk's own. Both stay within (start, end], so the two
      // guarantees above — progress and no gap — still hold.
      const split = spanAround(spans, next);
      if (split) next = split.start > start ? split.start : Math.min(split.end, end);
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
