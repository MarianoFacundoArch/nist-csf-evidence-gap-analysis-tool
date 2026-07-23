# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.2.1] — 2026-07-23

### Added
- **`status` command and interactive-menu action:** a read-only checkpoint across
  ingest, analyze, review, target, and report state. It distinguishes current
  human reviews from stale ones, detects reports superseded by newer upstream
  activity, changed hand-edited inputs, mixed analysis engines, or missing
  deliverables, and ends with an actionable `Next: <command>` recommendation.
  An `npm run status` alias is included.
- **Assessment activity in `dashboard.html`:** a compact snapshot of ingest,
  analysis, review, target, and report timestamps, kept fully self-contained and
  offline like the rest of the dashboard.
- Dashboard quick filters for items needing attention, gaps, pending reviews,
  and unmet targets; human-override indicators; and broader explorer search
  across rationale, notes, evidence, target details, and suggested actions.

### Changed
- Long-running CLI work is easier to follow: ingest reports file position and
  percentage, analysis reports every ten outcomes (including reused cache hits)
  with percentage, elapsed time, and an approximate ETA, and review displays
  its queue position.
- Dashboard timestamps are formatted for people while retaining the precise
  machine timestamp, and the summary now surfaces human override activity.

### Fixed
- Ingest metadata now records the actual tool version and keeps index creation
  time in its own field instead of storing a timestamp as `tool_version`.
- Status no longer treats a deleted evidence index as a completed ingest, and
  pre-v0.2.1 reports are marked stale once to seed exact input fingerprints.
- The npm package allowlist now excludes local example corpora and regenerable
  worked-example intermediates while retaining the curated sample deliverables.
- The lockfile now selects patched transitive releases of `fast-uri`,
  `form-data`, `protobufjs`, and `tar`.

## [0.2.0] — Target Profile, remediation plan, dashboard

This release completes the CSF 2.0 Organizational Profile cycle: the tool now
covers Current Profile → Target Profile → prioritized action plan, and adds a
self-contained visual dashboard.

### Added
- **`target` stage** (interactive editor + `--target-default` / `--target-import`
  flags): declare a Target Profile — baseline goal for every outcome, sparse
  overrides per Function/Category/Subcategory (most specific wins),
  `not-applicable` scoping with notes, and remediation priorities at any
  granularity. Stored as human-owned, schema-validated state in
  `<work-dir>/target.json`; no AI is involved in any target decision.
- **`remediation-plan.md`** deliverable: every unmet target as one ranked list
  (priority first, then distance from the goal), each item carrying the official
  NIST CSF 2.0 Implementation Examples as suggested actions — quoted verbatim
  from the CPRT export, so recommendations are grounded in NIST text the same
  way evidence quotes are grounded in source documents.
- **`target-profile.json`** deliverable: the machine-readable Target Profile
  (current vs target, gap, priority, scoping per Subcategory), companion to
  `current-profile.json`.
- **`dashboard.html`** deliverable: a fully self-contained interactive dashboard
  (inline data/styles/script; zero network access) with coverage-by-Function and
  current-vs-target charts (validated colorblind-safe ordinal ramp, light/dark
  themes, per-chart table view), review-status tiles, top remediation
  priorities, and a filterable explorer of all 106 outcomes with their verified
  quotes. Untrusted document text is rendered via `textContent` only.
- `gap-analysis.md` gains a Current-vs-Target summary when a target exists;
  stale target deliverables are removed when the target profile is deleted.
- `data/csf-core.json` now carries the official NIST Implementation Examples for
  each of the 106 Subcategories (363 examples), extracted from the same CPRT
  workbook; the schema accepts (and the loader passes through) the new optional
  `implementationExamples` field.
- Tests for target resolution/cascades, gap math, plan ordering, the new
  renderers, dashboard self-containment/escaping, and the completeness of the
  shipped CSF core data.

### Fixed
- `build-csf-core` uses the CPRT download endpoint without the former
  `?olirids=all` parameter, which the NIST service now rejects (HTTP 500).

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
