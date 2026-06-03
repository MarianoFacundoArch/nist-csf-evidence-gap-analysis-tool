/**
 * INGEST action: parse documents -> chunk -> embed -> persist the index.
 *
 * One bad file never aborts the run: each parse is isolated and recorded in an
 * ingest report (parsed / skipped-no-text / failed). The index records the
 * embedder id + dimension so the analyze stage can detect a model change.
 */

import { discoverDocs } from '../util/files.js';
import { parseFile } from '../ingest/parsers/index.js';
import { chunkDocument } from '../ingest/chunker.js';
import { buildIndex, saveIndex } from '../store/vectorStore.js';
import { writeJsonAtomic, readJsonSafe } from '../util/fsx.js';
import { ConfigError } from '../core/errors.js';

async function resolveDocsPath(ctx) {
  let docsPath = ctx.config.docsPath;
  if (!docsPath && ctx.ui?.isInteractive) {
    docsPath = await ctx.ui.text('Path to the folder (or file) of documents to assess');
  }
  if (!docsPath) {
    throw new ConfigError('No documents path provided.', {
      hint: 'Pass --docs <path>, set "docsPath" in csf-tool.config.json, or run the interactive menu.',
    });
  }
  return docsPath;
}

export async function ingest(ctx) {
  const { logger } = ctx;
  const docsPath = await resolveDocsPath(ctx);

  const files = await discoverDocs(docsPath).catch((err) => {
    throw new ConfigError(`Cannot read documents at "${docsPath}": ${err.message}`);
  });
  if (files.length === 0) {
    throw new ConfigError(`No supported documents found at "${docsPath}".`, {
      hint: 'Supported: .txt, .md, .docx, and .pdf with a real text layer.',
    });
  }
  logger.info(`Found ${files.length} document(s). Parsing…`);

  const report = { parsed: [], skipped: [], failed: [] };
  const allChunks = [];
  for (const file of files) {
    try {
      const doc = await parseFile(file);
      const chunks = chunkDocument(doc, ctx.config.chunk);
      if (chunks.length === 0) {
        report.skipped.push({ file, reason: doc.warnings?.join('; ') || 'no extractable text' });
        continue;
      }
      allChunks.push(...chunks);
      report.parsed.push({ file, chunks: chunks.length, warnings: doc.warnings ?? [] });
      for (const w of doc.warnings ?? []) logger.warn(`${file}: ${w}`);
    } catch (err) {
      // Isolate the failure to this file; keep going.
      report.failed.push({ file, reason: err.userMessage ?? err.message });
      logger.warn(`Skipping "${file}": ${err.message}`);
    }
  }

  if (allChunks.length === 0) {
    throw new ConfigError('No text could be extracted from any document.', {
      hint: 'If these are scanned/image-only PDFs, note that OCR is out of scope in v1.',
    });
  }

  logger.info(`Built ${allChunks.length} chunk(s). Computing embeddings…`);
  const embedder = await ctx.getEmbedder();
  const vectors = await embedder.embed(allChunks.map((c) => c.text));
  const dim = vectors[0]?.length ?? embedder.dim ?? null;

  const index = buildIndex({
    chunks: allChunks,
    vectors,
    embedderId: embedder.id,
    dim,
    chunkParams: ctx.config.chunk,
    createdAt: ctx.now(),
  });
  await saveIndex(ctx.paths.index, index);

  // Persist run metadata (no secrets) for staleness detection + reporting.
  const meta = (await readJsonSafe(ctx.paths.meta, {})) ?? {};
  meta.tool_version = index.created_at;
  meta.embedder_id = embedder.id;
  meta.embedding_dim = dim;
  meta.chunk_params = ctx.config.chunk;
  meta.docs_path = docsPath;
  meta.ingested_at = ctx.now();
  meta.ingest_report = { parsed: report.parsed.length, skipped: report.skipped.length, failed: report.failed.length };
  await writeJsonAtomic(ctx.paths.meta, meta);

  logger.info(
    `Ingest complete: ${report.parsed.length} parsed, ${report.skipped.length} skipped, ${report.failed.length} failed.`,
  );
  return {
    indexPath: ctx.paths.index,
    chunkCount: allChunks.length,
    fileCount: files.length,
    report,
  };
}
