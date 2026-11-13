# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.4.0] — 2026-11-13

### Added
- **Informative-reference crosswalks (CSF 2.0 → other frameworks).** Every
  deliverable used to end at CSF 2.0. The report stage can now relate the
  assessment to other frameworks using the mappings published through NIST's
  National Online Informative References (OLIR) Program. Ten mappings ship as
  data in `data/csf-crosswalks.json`: NIST SP 800-53 Rev. 5.2.0, SP 800-171
  Rev. 3, SP 800-218 SSDF, CSF v1.1, CIS Controls v8.1, CSA CCM v4.0, CRI
  Profile v2.0 and SCF 2024.4, each developed by NIST or by the framework's
  publisher, plus third-party mappings for ISO/IEC 27001:2022 and PCI DSS
  v4.0.1. Each carries its developer of record and release date as listed in
  NIST's catalog, which is cited for every mapping. The data holds identifiers
  only — no control text or titles from any referenced framework — and keeps
  each relationship at the level its mapping records it: one Subcategory, a
  whole Category, or a whole Function.
- **`crosswalk.md` and `crosswalk.csv` deliverables:** for each selected
  crosswalk, the framework's reference identifiers with the CSF 2.0 outcomes
  related to each and those outcomes' coverage and review status. References
  related to a whole Category or Function are listed separately with the
  coverage distribution of the outcomes under it. The report states up front
  that a mapping is a relationship, not an equivalence, and that coverage of a
  CSF outcome is not a determination of conformance with the referenced
  control; it reports counts and never a percentage. Unreviewed/stale outcomes
  are marked inline, and both files are removed when no crosswalk is selected.
- **Third-party mappings are opt-in.** By default reports include only mappings
  developed by NIST or by the body that publishes the mapped framework.
  Mappings developed by other parties (ISO/IEC 27001:2022, PCI DSS v4.0.1) must
  be selected by name or with `all`; they are labeled wherever they appear and
  reproduced as published.
- **`crosswalk` command and interactive-menu action:** a read-only list of the
  available crosswalks (id, framework, mapping developer, release date, how
  much of the Core each relates to, default set or opt-in), the date the data
  was retrieved, and which ones the current configuration selects. An
  `npm run crosswalk` alias is included.
- **`--crosswalk <ids|default|all|none>` flag and `report.crosswalks` config
  key** to choose the crosswalks included in reports; `crosswalkPath` names the
  data file. An unknown id is reported once with the known ids and ignored; a
  missing data file skips the crosswalk deliverables instead of failing the
  report.
- **Related references in `dashboard.html`:** each outcome's detail panel lists
  its reference identifiers per selected crosswalk, including those related to
  its whole Category or Function, and explorer search matches them.
- **`npm run build-crosswalks`** (`scripts/build-crosswalks.js`): regenerates
  the crosswalk data from NIST's CSF 2.0 reference data service, or from saved
  copies with `--from-dir` for offline builds. It verifies the source against
  `data/csf-core.json` (all 106 Subcategories present once, identical outcome
  text) and each selected mapping against NIST's catalog (same developer of
  record and reference document as when it was selected), and fails with an
  explanation rather than writing doubtful data; output is deterministic. Links
  are limited to documents hosted by NIST.
- **`ask` command and interactive-menu action: questions answered from the
  ingested documents.** The index was built for one purpose, the assessment.
  `csf-tool ask "<question>"` retrieves the passages closest to a question, asks
  the reasoning provider for a short answer together with the quotes it rests
  on, and verifies every quote with the same rules as the assessment. An answer
  is shown only when at least one quote verifies verbatim; an answer whose
  quotes all fail is withheld, and every result without an answer carries the
  tool's own fixed sentence, never model text. The output says which part is
  verified (the quotes) and which is not (the summary sentence), and how many
  passages were searched. The command is read-only: it loads the index and
  writes nothing. The answer goes to standard output and diagnostics to
  standard error; text from documents and from the model is printed on single
  lines with terminal control characters neutralized, so it cannot imitate the
  tool's own lines. The mock provider answers by word overlap so the command
  works offline. An `npm run ask` alias is included.
- **Opt-in redaction of identifiers sent to non-local providers (`--redact`,
  `privacy.redact`, `privacy.terms`).** With a cloud provider, document text
  was sent exactly as written. With redaction on, e-mail addresses, URLs, IPv4,
  IPv6 and MAC addresses, host names, and the literal terms listed in
  `privacy.terms` are replaced with placeholders such as `[[EMAIL_1]]` before a
  request leaves the machine and restored locally in the reply. Quotes are
  therefore still verified against the original documents, and a placeholder
  the model copies wrongly costs a quote instead of delivering an unverifiable
  one. Redaction is applied where providers are created, so it covers every
  outbound text: chunk and query embeddings, the first pass, its retry, the
  critique pass, and `ask`. Providers that run on this machine receive the text
  as written. With redaction on, `ingest` cuts documents into passages without
  splitting an address or a listed name, because each passage is redacted on
  its own, and `analyze` and `ask` refuse an index that was built without
  redaction or with a different list of terms. A redacted provider's id ends in
  `+redact`: switching redaction recomputes cached assessments and shows on the
  provider line of the gap analysis and the dashboard. Unlike other settings,
  an invalid, misspelled, or misplaced `privacy` setting is an error, not a
  warning and a reset to the default, because that default is "off"; the
  section name itself misspelled (`"privcy"`) is still an unknown key, ignored
  with a warning, and leaves redaction off. This is pseudonymization of
  pattern-matched identifiers and listed terms, not anonymization: names,
  addresses, account numbers, secrets, and the surrounding text are sent
  unchanged, and a value in two pieces — longer than a whole passage, continued
  on the next page of a PDF, or broken across two lines — is replaced only in
  part. The published evaluation did not measure runs with redaction on. Off by
  default.
- **`evidence-by-document.md` — the reverse view of the assessment.** Every
  deliverable answered "which evidence supports this outcome"; none showed what
  each document contributes. The new report, written on every `report` run,
  lists per document the chunks indexed, the outcomes it was retrieved for, the
  outcomes it is quoted for (with their effective coverage and review status),
  its verified quotes and the Functions touched, a summary with how concentrated
  the evidence is (counted on distinct outcomes), and the documents that were
  ingested but never quoted — described as exactly that, not as irrelevant. The
  dashboard shows the same figures in an "Evidence by document" table. To
  support it, `ingest` now records the documents that reached the index in
  `meta.json` (`documents`: file name, path relative to the documents folder,
  chunk count); a work directory ingested earlier gets a reconstructed list,
  flagged as such. Files that share a name are counted in one row with a note,
  because evidence is attributed by file name.
- **`evidence-requests.md` — what to ask and collect next.** The assessment rule
  "absence of evidence = `none`" left a first run with a wall of `none` and no
  next step. The new list, written on every `report` run, covers every outcome
  that could not be demonstrated — or, with a target profile, every unmet
  target in the remediation plan's order and numbering. Each item carries the
  official outcome text, current coverage and target, review status, the
  assessment's rationale, the documents already quoted, three questions that
  are the same for every outcome and mirror the assessment's rubric, and a
  checklist of NIST's CSF 2.0 Implementation Examples, verbatim and labeled as
  illustrative. Nothing in it is generated advice.
- **`poam.csv` — a POA&M-style tracker export — and human-owned plan fields.**
  `target.json` accepts an optional `plan` map keyed by Subcategory id with
  `owner`, `due` (a real `YYYY-MM-DD` date), `status` (`open`, `in-progress`,
  `done`, `risk-accepted`) and `milestones`. The fields are edited by hand,
  validated on load, shown in `remediation-plan.md` and `target-profile.json`,
  and exported to `poam.csv`: one row per unmet target in plan order, plus the
  outcomes that keep a plan entry after their target is met or scoped out. Row
  ids are derived from the Subcategory id, so re-prioritizing does not renumber
  the tracker. The tool never fills in an owner or a date; blank cells are
  correct output. `poam.csv` is written only while a target profile exists and
  does not claim conformance to any agency's POA&M template.
- **CSF Tiers, recorded by the organization.** `target.json` accepts an optional
  `tiers` selection (`current`, `target`: 1 to 4; `note`), set with
  `--tier-current` / `--tier-target`, through a new entry in the interactive
  target editor, or by hand. The selection is carried into
  `target-profile.json`, the "Current vs Target" section of `gap-analysis.md`,
  the overview of `remediation-plan.md` and a dashboard tile, each time labeled
  as selected by the organization and not derived by the tool. The tool ships
  the four Tier names only and points to NIST CSWP 29, Appendix B, for their
  definitions; it never infers a Tier from Subcategory coverage. A target Tier
  below the current one is allowed and warned about, and a flag value that is
  not a whole number from 1 to 4 is reported and discarded.
- **Reports, dashboard, and `ask` answer in Spanish (`--lang es`,
  `report.language`).** The five Markdown reports, the dashboard (interface
  text, page title, `<html lang>`, accessible labels, `<noscript>` text), and
  the `ask` result block can be rendered in Spanish. English remains the
  default, and every file an English run writes is byte-identical to what it
  was. The names of the Functions and Categories and the Subcategory outcomes
  are NIST's official Spanish translation of CSF 2.0 (NIST CSWP 29 spa), read
  from `data/csf-core.es.json` and never translated by this tool; each Spanish
  report states that source and that the assessment was made against the
  English original. An element is shown in Spanish only when its English text
  is NIST's official text, so a tailored CSF Core keeps the wording it was
  assessed with. NIST's Implementation Examples stay in English, with a line
  saying that NIST publishes them in English only, and quotes are never
  translated. `current-profile.json`, `target-profile.json`,
  `evidence-map.csv`, `crosswalk.csv`, and `poam.csv` keep English keys,
  headers, and values in both languages. With `--lang es` the assessment and
  `ask` prompts gain one delimited instruction asking the model to write its
  rationale (or answer) in Spanish, with quotes left verbatim; the English
  prompts are unchanged, and an English run keeps its engine signature, so
  upgrading does not trigger a re-analysis, while a Spanish analysis has its
  own signature and never reuses English assessments. An unsupported language
  is reported and English is used. Not translated: the tool's own messages
  (log lines, `status`, the menu, the prompts, `--help`). The published
  evaluation was run with the English prompts only, and the added instruction
  has not been run against a real model in the tests or the evaluation.
- **Official Spanish text of the CSF 2.0 Core (`data/csf-core.es.json`).** The
  Spanish names and outcome statements of all 6 Functions, 22 Categories, and
  106 Subcategories, reproduced verbatim from Appendix A of NIST CSWP 29 spa,
  the official U.S. Government Spanish translation of the Framework
  (https://doi.org/10.6028/NIST.CSWP.29.spa). The tool does not translate
  framework text: `npm run build-csf-core-es` (`scripts/build-csf-core-es.js`;
  needs `pdftotext`) extracts it from the publication and cross-checks it
  one-to-one against the English Core, aborting on any difference. It is display
  text only, used by `--lang es` — the assessment always runs on the English
  Core — and it carries no Implementation Examples, which NIST publishes in
  English only.
- `CITATION.cff`, with the metadata for citing the tool.
- `NOTICE` documents the provenance of the crosswalk data and of the Spanish
  text of the Core, and that the referenced frameworks remain the property of
  their publishers.
- Tests for the crosswalk build, data, loader, selection, renderers, and
  command; the document view and the request list; plan validation, the POA&M
  export, and Tier handling; `ask` and its withholding rule; the redactor and
  the provider wrappers, including a structural test that providers are created
  only by the two factories and that network code lives only in provider
  modules; the Spanish Core extraction; a golden-file guard that a v0.3.0 target
  profile still renders byte-identically; a test that executes the dashboard's
  embedded script rather than only parsing it; and, for the Spanish output,
  frozen English reports for eight assessment scenarios, checks that the two
  message catalogs have the same keys and placeholders, the Spanish rendering
  of every deliverable, and the prompt and engine-signature properties.

### Changed
- **`review` in a script now needs `--accept-all`.** Without a terminal,
  `csf-tool review` stops instead of accepting its queue (see Fixed). A script
  or CI job that called `review` and relied on that acceptance must pass
  `--accept-all` to keep it. `all` is unchanged: without a terminal and without
  `--accept-all` it skips the review and marks the report DRAFT.
- **A config file must be a valid JSON object, and `--config` must name a file
  that exists.** Anything else is now an error (see Fixed). `init` still creates
  the file it is pointed at, and running without a config file is unchanged.
- Providers now declare whether they run on this machine. Ollama counts as
  local only when `OLLAMA_HOST` is unset or a loopback address; with any other
  host the tool warns that prompts are sent to it over the network.
- Schema errors in `target.json` now say which field is wrong and what was
  expected: the allowed values, the name of an unknown field, the date format.
- The interactive target editor pre-fills note prompts with the current text, so
  a note can be edited or erased; previously an empty answer returned the old
  note, and "empty clears" could not clear it.
- The worked example now includes every new deliverable. Its Target Profile
  gains two illustrative plan entries and an illustrative Tier selection, and
  its crosswalk files are limited to two crosswalks to keep the committed
  example small.

### Fixed
- **`review` no longer accepts its queue when there is nobody to ask.** Run
  without a terminal and without `--accept-all` — from a script or a CI job —
  `review` wrote an `accept` decision for every queued item, so items were
  recorded as reviewed although no person had looked at them. It now stops with
  an explanation, exits with an error, and writes nothing; the queue is accepted
  without prompting only when `--accept-all` is passed. Scripts that relied on
  the implicit acceptance need to add `--accept-all`.
- **`review` no longer reports unreviewed items as resolved.** With nothing in
  its queue but outcomes that were not flagged for review still unreviewed, it
  printed "Nothing to review — all items are resolved." and "0 still need
  review". It now says how many of them are still unreviewed, points to
  `review --all`, and reports the real count; "all items are resolved" is
  printed only when that is true.
- **A config file that cannot be read no longer falls back to the defaults.**
  A config file with a JSON syntax error — a trailing comma is enough — was
  reported with one warning (none under `--quiet`) and then ignored, and a
  mistyped `--config` path was ignored without any message. The run continued
  on the built-in defaults, which are cloud-first, whatever the file said about
  providers — `"local": true`, for example. Both cases now stop the run with an
  error before a document is read or anything is sent, and so does a config
  file that holds something other than a JSON object. No config file at the
  default location still means "use the defaults".
- **The tool can be run from any directory.** The built-in data paths were
  resolved against the working directory, so outside the repository root — a
  client folder after `npm link`, or a global install — every command stopped
  with "CSF core data file not found", and `init` could not copy the `.env`
  template. The files shipped with the tool are now found when the working
  directory has none. A file of your own at that path always wins, and a
  mistyped custom path is still reported as not found instead of silently
  loading the shipped file.
- **The order of outcomes in the deliverables no longer depends on the machine's
  locale.** Subcategory ids were ordered with locale-sensitive comparison; under
  Danish or Norwegian collation ("AA" sorts after "Z") the PR.AA outcomes moved
  behind the rest of PROTECT, which reordered `gap-analysis.md` and renumbered
  `remediation-plan.md`. Ids are now compared without consulting the locale; for
  the same work directory the report stage produces byte-identical files under
  en_US, da_DK and nb_NO. Output is unchanged for locales that were not
  affected.
- **A line break in a rationale or a note can no longer add entries to a
  report.** In `gap-analysis.md` and `remediation-plan.md`, AI rationales and
  human notes were printed as written; a line break inside one let the rest of
  the text render as a list item or heading of its own — in the remediation
  plan, as an extra "NIST" suggested action. Such text is now kept on one line.
  Text that is already a single line renders exactly as before.

## [0.3.0] — 2026-09-18

### Added
- **Published evaluation harness and measured results (`eval/`).** The
  anti-hallucination safeguards were documented but never backed by published
  numbers. `eval/RESULTS.md` now reports the experiments and `eval/` contains the
  harness plus the raw model outputs behind every figure, so the claims are
  reproducible rather than asserted:
  - **Model spectrum** (13 cloud and local models, 106 CSF 2.0 Subcategories):
    raw fabrication runs 0.0–17.7% and is model-*family* driven rather than size
    driven; after the verbatim verifier, **delivered fabrication is 0.0% on every
    model**.
  - **Adversarial benchmark** (122 crafted cases): 100% of attacks dropped
    — fabricated, paraphrase/substitution, cross-chunk splice and trivial anchors
    — with 0% false rejection of legitimate quotes.
  - **Ablations** (642 real quotes): removing the verifier lets 4.7% of delivered
    quotes be fabricated.
  - **Reasoning-effort sweep:** no faithfulness gain from medium or high.
  Per-run embedding indexes are not committed (large and regenerable), and the
  corpus2 source PDFs are third-party NYS ITS documents this project does not
  redistribute — `eval/corpus2/fetch.sh` re-downloads them from the official source.
- **`llm.reasoningEffort` configuration field** (`low` | `medium` | `high`,
  default `low`). Reasoning models that accept an effort hint previously received
  a hardcoded `low`; the level is now configurable and validated. The default
  stays `low` because the measured sweep in `eval/RESULTS.md` found no
  faithfulness gain from `medium` or `high` on this task, at roughly twice the
  latency.

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
