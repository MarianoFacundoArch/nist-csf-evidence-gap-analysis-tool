/**
 * Built-in default configuration — the lowest-precedence layer.
 *
 * Precedence (low -> high): these defaults  <  csf-tool.config.json  <  CLI flags.
 * Secrets/endpoints come separately from the .env file (loaded into the
 * environment), never from here.
 *
 * IMPORTANT (brief §10): model names below are *illustrative defaults only*,
 * not authoritative recommendations. Provider model catalogs change over time;
 * verify and set the current model name for your provider in csf-tool.config.json
 * (see the provider's own documentation). Everything here is overridable.
 *
 * The shipped default is "cloud-first" (OpenAI for both embeddings and
 * reasoning). Pass --local (or set "local": true) to force the fully offline
 * providers (on-device embeddings + a local Ollama LLM). The deterministic
 * "mock" provider is intended for tests and the reproducible worked example.
 */

export const DEFAULT_CONFIG_FILENAME = 'csf-tool.config.json';

export function defaultConfig() {
  return {
    // Path to the CSF 2.0 core data file. Ships with the COMPLETE 106-subcategory
    // CSF 2.0 Core (sourced from NIST CPRT; see data/csf-core.json and
    // scripts/build-csf-core.js). Point this at your own CPRT export if needed.
    csfCorePath: 'data/csf-core.json',

    // Folder (or single file) of the organization's documents. Null => the
    // tool asks for it interactively (menu) or you pass --docs on the CLI.
    docsPath: null,

    // On-disk working directory where each pipeline stage persists its output.
    workDir: './output',

    // Overlapping text chunking. Sizes are in characters (provider-independent;
    // never depends on a tokenizer that a local model may not expose).
    chunk: { size: 1200, overlap: 200 },

    embeddings: {
      provider: 'openai', // "openai" | "local-transformers" | "mock"
      // null => each provider resolves its OWN default model (so switching the
      // provider via --embed-provider doesn't carry the wrong provider's model).
      // Provider defaults are illustrative; verify the current name in the
      // provider's documentation.
      model: null,
      batchSize: 64,
    },

    llm: {
      provider: 'openai', // "openai" | "ollama" | "mock"
      model: null, // null => provider resolves its own default (see note above)
      temperature: 0, // deterministic judgments
      maxTokens: 1024,
    },

    retrieval: { topK: 6 },

    analysis: {
      confidenceThreshold: 0.6, // below this => auto-flag for human review
      critique: false, // optional skeptical second pass (doubles LLM calls)
      strict: false, // refuse to emit final profile until all items reviewed
    },

    review: { showAll: false }, // false => only review flagged/unresolved items

    // Non-interactive bulk-accept of the review queue (CI / worked example).
    // Normally set per-run via --accept-all; never a substitute for real review.
    acceptAll: false,

    report: { evidenceQuoteMaxChars: 300 },

    // Reviewer identity recorded on review decisions (advisory only).
    identity: null,

    // When set to an ISO timestamp string, all generated timestamps use it.
    // Used by the worked example so regenerated output is byte-identical.
    fixedNow: null,

    // Recompute assessments even if a cached one with a matching signature
    // exists. Normally set per-run via --force.
    force: false,

    // Master offline switch (also via --local). Applied AFTER merge: forces
    // local-transformers embeddings + ollama LLM regardless of other settings.
    local: false,

    logLevel: 'info', // debug | info | warn | error | quiet
  };
}
