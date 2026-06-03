# Contributing

Thanks for your interest in improving this tool. It is free and open source.
Contributions of all kinds are welcome: bug reports, documentation, new
providers, and test coverage.

## Ground rules

- **Keep it free and useful.** No marketing language, and no advertising for any
  product or service anywhere in the code, docs, or output.
- **Human-in-the-loop is non-negotiable.** The AI proposes; a human validates.
  Do not add a path that emits a final profile without the review step, and do
  not weaken the anti-hallucination safeguards (the code-side verifier is
  authoritative — see `src/engine/verifier.js`).
- **Minimal dependencies.** Two runtime dependencies (`ajv`, `@clack/prompts`).
  Heavy provider/parser packages must stay in `optionalDependencies` and be
  loaded with a dynamic `import()` only when selected.
- **Never crash; degrade gracefully and explain.** A bad config, an unparseable
  document, or malformed model output must produce a clear message, not a stack
  trace.

## Development setup

```bash
npm install
npm test            # node:test unit tests
npm run example     # regenerate the deterministic worked example (offline)
```

- Node.js >= 20.10, ES modules.
- No build step. Source lives under `src/`; the CLI entry is `bin/csf-tool.js`.

## Project layout

- `src/core` — config, context, logging, errors, paths
- `src/csf` — CSF 2.0 core data loader
- `src/ingest` — document parsers + chunker
- `src/embeddings`, `src/store` — embeddings providers + in-memory vector store
- `src/llm`, `src/prompts` — reasoning providers + the assessment prompts
- `src/engine` — the mapping engine and the verbatim-quote verifier
- `src/review`, `src/report` — human review + the three deliverables
- `src/actions` — the single code path shared by the CLI and the menu
- `src/cli` — flag parsing, router, interactive menu, UI ports

## Adding a provider

Providers are looked up in a small registry and lazily imported:

- Embeddings: add a module under `src/embeddings/` exporting
  `createEmbedder(config, logger)` that returns `{ id, dim, embed(texts) }` with
  **L2-normalized** vectors, and register it in `src/embeddings/index.js`.
- Reasoning LLM: add a module under `src/llm/` exporting
  `createLlm(config, logger)` that returns `{ id, isLocal, judge({system, user, meta}) }`
  returning the model's **raw** text (the engine parses/validates/verifies), and
  register it in `src/llm/index.js`.

Do not hardcode a commercial model name as authoritative — make it configurable
and resolve a provider-specific default when unset.

## Tests

- Use the built-in `node:test` runner (no test framework dependency).
- Add a regression test for every bug fix. The verifier and config are the most
  safety-critical modules; keep their coverage high.
- The worked example must remain reproducible: `npm run example` is
  deterministic (mock providers + a pinned timestamp).

## Pull requests

1. Keep changes focused and well-commented (explain the *why*).
2. Run `npm test` and `npm run example`; ensure both are green and the worked
   example still regenerates byte-identically (or update it intentionally).
3. Add yourself to `AUTHORS`.
