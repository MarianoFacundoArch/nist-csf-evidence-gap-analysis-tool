/**
 * ANALYZE action: for every CSF subcategory, retrieve evidence and ask the AI
 * for a coverage judgment, then validate + verify it. Writes assessments
 * incrementally so the stage is resumable: on restart, items already assessed
 * under the same engine signature are skipped (unless --force).
 *
 * Systemic provider failures (bad key, daemon down) stop the run with guidance
 * rather than silently marking every subcategory "none"; only malformed model
 * output degrades (handled inside the mapping engine).
 */

import { loadCsfCore } from '../csf/loader.js';
import { loadIndex } from '../store/vectorStore.js';
import { assessSubcategory } from '../engine/mapping.js';
import { engineSignature } from '../util/hash.js';
import { readJsonSafe, writeJsonAtomic } from '../util/fsx.js';
import { ProviderError, ConfigError } from '../core/errors.js';

export async function analyze(ctx) {
  const { logger, config } = ctx;
  const csf = await loadCsfCore(config.csfCorePath, logger);
  const index = await loadIndex(ctx.paths.index);

  const embedder = await ctx.getEmbedder();
  const llm = await ctx.getLlm();

  // Correctness guard: the index was built with a specific embedder; mixing
  // vectors from a different embedding model is meaningless.
  if (index.embedder_id && embedder.id && index.embedder_id !== embedder.id) {
    throw new ConfigError(
      `The index was built with embedder "${index.embedder_id}" but the current embedder is "${embedder.id}".`,
      { hint: 'Re-run `csf-tool ingest` with the current embeddings settings.' },
    );
  }

  const engineSig = engineSignature({
    embeddingModel: embedder.id,
    llmModel: llm.id,
    topK: config.retrieval.topK,
    chunkSize: config.chunk.size,
    chunkOverlap: config.chunk.overlap,
    critique: config.analysis.critique,
    indexId: index.index_id ?? index.created_at,
  });

  const assessments = (await readJsonSafe(ctx.paths.assessments, {})) ?? {};
  const total = csf.subcategories.length;
  let assessed = 0;
  let skipped = 0;
  let errors = 0;
  const pendingTotal = csf.subcategories.filter((sub) => {
    const existing = assessments[sub.id];
    return !(existing && existing.engine_sig === engineSig && !config.force);
  }).length;
  const startedAt = Date.now();

  const logProgress = (done, currentId) => {
    if (done % 10 !== 0 && done !== total) return;
    const elapsedMs = Date.now() - startedAt;
    const completedPending = assessed + errors;
    const etaMs = completedPending > 0
      ? (elapsedMs / completedPending) * Math.max(0, pendingTotal - completedPending)
      : 0;
    const timing = elapsedMs >= 1000 && completedPending > 0
      ? ` · elapsed ${formatDuration(elapsedMs)} · approx. ETA ${formatDuration(etaMs)}`
      : '';
    logger.info(
      `  …${done}/${total} (${Math.round((done / total) * 100)}%) · ${currentId}` +
        ` · assessed ${assessed}, reused ${skipped}, errors ${errors}${timing}`,
    );
  };

  // Embed all subcategory outcomes in ONE batch up front. This turns 106
  // separate embedding calls into a single provider request — a real cost/time
  // win for cloud embedders — and is free for the local/mock providers.
  logger.info(`Embedding ${total} subcategory outcomes…`);
  const queryVecs = await embedder.embed(csf.subcategories.map((s) => s.outcome));

  logger.info(`Analyzing ${total} subcategories (provider: ${llm.id})…`);

  for (let i = 0; i < total; i++) {
    const sub = csf.subcategories[i];
    const existing = assessments[sub.id];
    if (existing && existing.engine_sig === engineSig && !config.force) {
      skipped++;
      logProgress(i + 1, sub.id);
      continue; // resume: already done under identical inputs
    }

    try {
      const assessment = await assessSubcategory({
        sub,
        index,
        embedder,
        llm,
        config,
        engineSig,
        now: ctx.now(),
        queryVec: queryVecs[i],
      });
      assessments[sub.id] = assessment;
      assessed++;
    } catch (err) {
      // Provider/transport problems are systemic — stop and explain, don't
      // poison all 106 items with bogus "none".
      if (err instanceof ProviderError) throw err;
      // Anything unexpected: record a safe fallback for this item and continue.
      logger.warn(`Assessment failed for ${sub.id}: ${err.message}`);
      assessments[sub.id] = {
        subcategory_id: sub.id,
        coverage: 'none',
        confidence: 0,
        evidence: [],
        rationale: `Automated fallback: ${err.message}`,
        needs_review: true,
        fallback: true,
        fallback_reason: err.message,
        verifier_action: null,
        verification: { quotes_checked: 0, quotes_verified: 0, downgraded: false },
        function: sub.functionName,
        category: sub.category,
        outcome: sub.outcome,
        engine_sig: engineSig,
        assessed_at: ctx.now(),
      };
      errors++;
    }

    // Persist incrementally for resumability.
    await writeJsonAtomic(ctx.paths.assessments, assessments);
    logProgress(i + 1, sub.id);
  }

  // Record provider ids in meta for the report header.
  const meta = (await readJsonSafe(ctx.paths.meta, {})) ?? {};
  meta.llm_id = llm.id;
  meta.embedder_id = embedder.id;
  meta.engine_sig = engineSig;
  meta.index_id = index.index_id ?? index.created_at;
  meta.analyzed_index_id = index.index_id ?? index.created_at;
  meta.analyzed_at = ctx.now();
  await writeJsonAtomic(ctx.paths.meta, meta);

  const flagged = Object.values(assessments).filter((a) => a.needs_review).length;
  logger.info(`Analyze complete: ${assessed} assessed, ${skipped} reused, ${errors} fallback. ${flagged} flagged for review.`);
  return { assessmentsPath: ctx.paths.assessments, assessed, skipped, errors, flagged };
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}
