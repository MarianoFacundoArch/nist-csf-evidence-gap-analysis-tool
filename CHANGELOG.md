# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] — Initial release

First public release.

### Added
- Inverted-RAG pipeline (`ingest` → `analyze` → `review` → `report`) that
  assesses an organization's documentation against all 106 NIST CSF 2.0
  Subcategory outcomes, plus an `all` convenience command.
- Two front-ends sharing one code path: a command-line mode and an interactive
  menu.
- Pluggable providers, lazily loaded: embeddings (`local-transformers` on-device,
  `openai` cloud, `mock`) and reasoning LLM (`openai` cloud, `ollama` fully
  local, `mock`). A `--local` switch forces fully-offline operation.
- Anti-hallucination safeguards enforced in code: verbatim quote verification
  with downgrade-to-`none`, a substantive-quote bar, confidence-threshold
  flagging, JSON-schema validation with one retry and a graceful fallback, and a
  strict mode that refuses to emit a profile until every item is human-reviewed.
- Deliverables: a machine-readable Current Profile (JSON), a human-readable
  gap-analysis report (Markdown, gaps first), and an evidence-map (CSV).
- Complete CSF 2.0 Core data (106 Subcategories) generated reproducibly from the
  official NIST CPRT export (`npm run build-csf-core`).
- A reproducible, offline worked example (`npm run example`) generated from
  bundled fictitious sample documents (Markdown, text, `.docx`, multi-page PDF).
- Unit tests via `node:test`, including a regression test that a fabricated quote
  is downgraded to `none`.

### Notes
- Validated end to end with a real cloud model (OpenAI GPT-5 family) and a real
  fully-local model (Ollama), as well as the deterministic mock engine.
