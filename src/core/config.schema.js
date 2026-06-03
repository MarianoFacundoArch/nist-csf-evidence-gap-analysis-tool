/**
 * JSON Schema for the configuration file.
 *
 * We validate the merged config and, on any problem, repair the offending key
 * back to its default and warn — rather than crash (brief: "never crash on a
 * bad config file; degrade gracefully and explain"). additionalProperties:false
 * lets us catch typos like "topk" instead of "topK".
 */

export const configSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    csfCorePath: { type: 'string', minLength: 1 },
    docsPath: { type: ['string', 'null'] },
    workDir: { type: 'string', minLength: 1 },

    chunk: {
      type: 'object',
      additionalProperties: false,
      properties: {
        size: { type: 'integer', minimum: 100, maximum: 100000 },
        overlap: { type: 'integer', minimum: 0, maximum: 99999 },
      },
    },

    embeddings: {
      type: 'object',
      additionalProperties: false,
      properties: {
        provider: { type: 'string', enum: ['openai', 'local-transformers', 'mock'] },
        model: { type: ['string', 'null'], minLength: 1 },
        batchSize: { type: 'integer', minimum: 1, maximum: 4096 },
      },
    },

    llm: {
      type: 'object',
      additionalProperties: false,
      properties: {
        provider: { type: 'string', enum: ['openai', 'ollama', 'mock'] },
        model: { type: ['string', 'null'], minLength: 1 },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
        maxTokens: { type: 'integer', minimum: 1, maximum: 32768 },
      },
    },

    retrieval: {
      type: 'object',
      additionalProperties: false,
      properties: {
        topK: { type: 'integer', minimum: 1, maximum: 50 },
      },
    },

    analysis: {
      type: 'object',
      additionalProperties: false,
      properties: {
        confidenceThreshold: { type: 'number', minimum: 0, maximum: 1 },
        critique: { type: 'boolean' },
        strict: { type: 'boolean' },
      },
    },

    review: {
      type: 'object',
      additionalProperties: false,
      properties: {
        showAll: { type: 'boolean' },
      },
    },

    report: {
      type: 'object',
      additionalProperties: false,
      properties: {
        evidenceQuoteMaxChars: { type: 'integer', minimum: 20, maximum: 100000 },
      },
    },

    identity: { type: ['string', 'null'] },
    fixedNow: { type: ['string', 'null'] },
    acceptAll: { type: 'boolean' },
    force: { type: 'boolean' },
    local: { type: 'boolean' },
    logLevel: { type: 'string', enum: ['debug', 'info', 'warn', 'error', 'quiet'] },
  },
};
