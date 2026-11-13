/**
 * INGEST action: parse documents -> chunk -> embed -> persist the index.
 *
 * One bad file never aborts the run: each parse is isolated and recorded in an
 * ingest report (parsed / skipped-no-text / failed). The index records the
 * embedder id + dimension so the analyze stage can detect a model change, and
 * the run metadata records which documents reached the index so the report
 * stage can show what each one contributes.
 */

import { discoverDocs } from '../util/files.js';
import { parseFile } from '../ingest/parsers/index.js';
import { chunkDocument } from '../ingest/chunker.js';
import { buildIndex, saveIndex } from '../store/vectorStore.js';
import { writeJsonAtomic, readJsonSafe } from '../util/fsx.js';
import { compareText } from '../util/compare.js';
import { ConfigError } from '../core/errors.js';
import { basename, relative, sep } from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

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
  const documents = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (shouldLogFileProgress(i, files.length)) {
      logger.info(`Parsing ${i + 1}/${files.length} (${Math.round(((i + 1) / files.length) * 100)}%): ${basename(file)}`);
    }
    try {
      const doc = await parseFile(file);
      const chunks = chunkDocument(doc, ctx.config.chunk);
      if (chunks.length === 0) {
        report.skipped.push({ file, reason: doc.warnings?.join('; ') || 'no extractable text' });
        continue;
      }
      allChunks.push(...chunks);
      report.parsed.push({ file, chunks: chunks.length, warnings: doc.warnings ?? [] });
      // `source_file` is the label every chunk of this document carries, and
      // therefore the key evidence quotes are recorded under.
      documents.push({ source_file: doc.file, path: documentPath(docsPath, file), chunks: chunks.length });
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
  meta.tool_version = pkg.version;
  meta.index_created_at = index.created_at;
  meta.index_id = index.index_id ?? index.created_at;
  meta.embedder_id = embedder.id;
  meta.embedding_dim = dim;
  meta.chunk_params = ctx.config.chunk;
  meta.docs_path = docsPath;
  meta.ingested_at = ctx.now();
  meta.ingest_report = { parsed: report.parsed.length, skipped: report.skipped.length, failed: report.failed.length };
  // The documents that made it into the index (additive: work directories
  // written by earlier versions lack this list). The report stage uses it for
  // the reverse view — document -> what it contributes — which must include the
  // documents that were ingested but never quoted, and those leave no other
  // trace in the assessment.
  meta.documents = documents.sort(
    (a, b) => compareText(a.source_file, b.source_file) || compareText(a.path, b.path),
  );
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

/**
 * A document's path relative to the documents folder, with forward slashes on
 * every platform. Relative on purpose: the list is carried into deliverables,
 * and an absolute path would put the assessor's local directory layout into a
 * file that is handed to someone else. It still tells apart two files that
 * share a base name in different sub-folders.
 */
function documentPath(docsPath, file) {
  const rel = relative(docsPath, file);
  // "" => docsPath is the file itself. A path that climbs out of docsPath
  // cannot come from discoverDocs, but is never emitted either way.
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) return basename(file);
  return rel.split(sep).join('/');
}

function shouldLogFileProgress(index, total) {
  if (total <= 20) return true;
  const interval = Math.max(1, Math.ceil(total / 10));
  return index === 0 || (index + 1) % interval === 0 || index + 1 === total;
}
