# Usage Guide

A step-by-step walkthrough of using the tool, from installation to interpreting
the deliverables. If you just want the short version, see the Quick start in the
[README](../README.md). This tool is free and open source.

## Contents

1. [The mental model](#1-the-mental-model)
2. [Install](#2-install)
3. [Choose how the AI runs (providers)](#3-choose-how-the-ai-runs-providers)
4. [Walkthrough A — try it offline in 1 minute (no key)](#4-walkthrough-a--try-it-offline-in-1-minute-no-key)
5. [Walkthrough B — assess your own documents](#5-walkthrough-b--assess-your-own-documents)
6. [The interactive menu](#6-the-interactive-menu)
7. [Reviewing the AI's judgments (the important part)](#7-reviewing-the-ais-judgments-the-important-part)
8. [Reading the outputs](#8-reading-the-outputs)
9. [Strict mode and resuming](#9-strict-mode-and-resuming)
10. [Use the full framework / your own CSF export](#10-use-the-full-framework--your-own-csf-export)
11. [Configuration reference](#11-configuration-reference)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. The mental model

The tool answers one question for **every** CSF 2.0 Subcategory: *"Does this
organization's documentation actually demonstrate this outcome is achieved?"*

It does this with an **inverted RAG** approach. Instead of you asking questions,
the tool loops over all 106 Subcategories and, for each, retrieves the most
relevant pieces of your documents and asks an AI to judge coverage **using only
that retrieved evidence**. The AI's answer is a *proposal*: it is checked in code
(every quote must really exist in the evidence) and then validated by you.

Four stages, each saved to disk so you can stop and resume:

```
ingest  →  analyze  →  review  →  report
(parse,    (AI judges    (you       (Current Profile JSON,
 chunk,     coverage      accept/     gap report MD,
 embed)     per item)     override)   evidence map CSV)
```

## 2. Install

Requires Node.js >= 20.10.

```bash
git clone https://github.com/MarianoFacundoArch/nist-csf-evidence-gap-analysis-tool.git
cd nist-csf-evidence-gap-analysis-tool
npm install
```

Optionally make the command available as `csf-tool`:

```bash
npm link        # then you can run: csf-tool <command>
```

This guide uses `node bin/csf-tool.js`.

## 3. Choose how the AI runs (providers)

You decide where embeddings and reasoning happen. Nothing is hardcoded — set it
in config or via flags.

| Goal | Embeddings | Reasoning LLM | How |
| --- | --- | --- | --- |
| **Try it instantly** (no key, deterministic) | `mock` | `mock` | `--embed-provider mock --llm-provider mock` |
| **Cloud** (most capable) | `openai` | `openai` | default; set `OPENAI_API_KEY` in `.env` |
| **Fully offline / private** (docs never leave the machine) | `local-transformers` | `ollama` | `--local` |

- **Cloud:** copy `.env.example` to `.env` and set `OPENAI_API_KEY`. Pick the
  model in config (`llm.model`, `embeddings.model`). The OpenAI provider adapts
  automatically to model-family differences (e.g. the GPT-5 family), so you can
  point it at a current model and it will work.
- **Offline:** install [Ollama](https://ollama.com), start it with `ollama serve`,
  `ollama pull <model>` (e.g. `llama3.2`), then add `--local`. The on-device
  embedding model downloads and caches on first use. Larger local models give more
  useful coverage; very small
  ones tend to answer `none` to almost everything.

## 4. Walkthrough A — try it offline in 1 minute (no key)

Run the whole pipeline against the bundled sample documents using the
deterministic mock engine:

```bash
node bin/csf-tool.js all \
  --docs examples/sample-docs \
  --embed-provider mock --llm-provider mock \
  --work-dir ./output --accept-all
```

You'll see something like:

```
Found 5 document(s). Parsing…
Built 8 chunk(s). Computing embeddings…
Ingest complete: 5 parsed, 0 skipped, 0 failed.
Analyzing 106 subcategories (provider: mock)…
Analyze complete: 106 assessed, 0 reused, 0 fallback. ... flagged for review.
Report written to ./output/reports
```

Open `./output/reports/gap-analysis.md`. You can also see a committed reference
copy under `examples/worked-example/output/reports/`, regenerable any time with
`npm run example`.

> `--accept-all` bulk-accepts the AI proposals so the run is non-interactive.
> For a real assessment you review interactively instead (Section 7).

## 5. Walkthrough B — assess your own documents

1. Put your security documentation in a folder (policies, SOC 2 / ISO 27001
   docs, procedures, standards). Supported: `.txt`, `.md`, `.docx`, and `.pdf`
   **with a real text layer**. Scanned/image-only PDFs are skipped (no OCR yet).

2. Set up a provider (Section 3). For cloud:

   ```bash
   cp .env.example .env       # then edit .env and set OPENAI_API_KEY
   node bin/csf-tool.js init  # scaffolds csf-tool.config.json
   ```

3. Ingest, analyze:

   ```bash
   node bin/csf-tool.js ingest  --docs /path/to/your/docs
   node bin/csf-tool.js analyze
   ```

   `analyze` reads the index that `ingest` saved, so it doesn't need `--docs`. It
   calls the model once per Subcategory; with a cloud model this takes a few
   minutes for all 106. It is resumable.

4. Review and report (Sections 7–8):

   ```bash
   node bin/csf-tool.js review
   node bin/csf-tool.js report
   ```

For a fully offline run, append `--local` to every command (after `ollama pull`
and `ollama serve`).

## 6. The interactive menu

Run with **no command** to get a guided menu that walks you through each step and
prompts for anything it needs (such as the documents path):

```bash
node bin/csf-tool.js
```

The menu and the commands call the exact same logic — use whichever you prefer.
(The menu requires an interactive terminal.)

## 7. Reviewing the AI's judgments (the important part)

This is what makes the result trustworthy: **the AI never has the final word.**

```bash
node bin/csf-tool.js review            # only items the AI flagged (default)
node bin/csf-tool.js review --all      # review every Subcategory
```

For each item you see the Subcategory, the AI's coverage + confidence + rationale,
and the **verified** supporting quotes (with file and page). You can:

- **Accept** the AI judgment,
- **Override** the coverage level (e.g. raise `partial`→`substantial` because you
  have out-of-band records, or lower it because the evidence is only intent),
- **Add a note** (recorded in the report),
- **Skip** (decide later), or **Quit** (progress is saved; resume anytime).

Your decisions are stored separately from the AI assessments, so re-running
`analyze` never overwrites them. If a later `analyze` changes an item you already
reviewed, that review is marked **STALE** so you can re-confirm.

## 8. Reading the outputs

All three are written to `<work-dir>/reports/`:

- **`current-profile.json`** — the machine-readable Current Profile, aligned with
  the CSF 2.0 Organizational Profile concept. One entry per Subcategory with the
  effective `coverage` (`none` / `partial` / `substantial` / `full`),
  `confidence`, `review_status` (`reviewed` / `unreviewed` / `stale`), both the
  AI and human values, the supporting `evidence`, and a `verification` summary.

- **`gap-analysis.md`** — for people. A coverage summary and a per-Function table,
  then **gaps first** (what to address), then partial coverage with quotes, then
  what's covered. Overrides and verifier downgrades are annotated inline.

- **`evidence-map.csv`** — one row per (Subcategory, verified quote), linking each
  outcome to its source file, page, similarity score, and the verbatim quote.
  Opens cleanly in a spreadsheet (RFC-4180 quoting; spreadsheet formula-injection
  is neutralized).

Coverage levels mean: **none** (not demonstrated), **partial** (addressed in part,
or only as stated intent/policy), **substantial** (largely achieved in operation),
**full** (clearly achieved in operation). Intent ("must"/"shall") is treated as
weaker than records showing the outcome actually happens.

## 9. Strict mode and resuming

- **Strict mode** refuses to emit the final profile until every Subcategory is
  resolved by a human:

  ```bash
  node bin/csf-tool.js report --strict
  ```

  If anything is unreviewed/stale it stops with a list of what's blocking — by
  design, not a crash.

- **Resume / re-run:** stages persist to the work directory. `analyze` skips
  items already done under identical inputs; re-ingesting the same documents does
  **not** force a full re-analyze. Change a relevant setting (e.g. `--top-k`) or
  pass `--force` to recompute.

## 10. Use the full framework / your own CSF export

The tool ships with the complete 106-Subcategory CSF 2.0 Core in
`data/csf-core.json`, generated from the official NIST CPRT export. To regenerate
it from source (needs network and `unzip`):

```bash
npm run build-csf-core
```

To use a different or updated export, point `csfCorePath` at a JSON file shaped
like:

```json
{
  "frameworkVersion": "CSF 2.0",
  "functions": [{ "id": "GV", "name": "GOVERN" }],
  "subcategories": [
    { "function": "GOVERN", "category": "Organizational Context (GV.OC)",
      "id": "GV.OC-01", "outcome": "The organizational mission is understood ..." }
  ]
}
```

## 11. Configuration reference

Precedence (low → high): built-in defaults < `csf-tool.config.json` < CLI flags.
Secrets/endpoints come only from `.env`. Run `csf-tool init` to scaffold a config.

| Key | Meaning | Default |
| --- | --- | --- |
| `csfCorePath` | CSF 2.0 core data file | `data/csf-core.json` |
| `docsPath` | folder or single file of documents | (asked / `--docs`) |
| `workDir` | where stage outputs are persisted | `./output` |
| `chunk.size` / `chunk.overlap` | chunk size / overlap, in characters | `1200` / `200` |
| `embeddings.provider` / `.model` | `openai` / `local-transformers` / `mock` | `openai` / (provider default) |
| `llm.provider` / `.model` | `openai` / `ollama` / `mock` | `openai` / (provider default) |
| `retrieval.topK` | chunks retrieved per Subcategory | `6` |
| `analysis.confidenceThreshold` | below this → auto-flag for review | `0.6` |
| `analysis.critique` | optional skeptical second pass | `false` |
| `analysis.strict` | refuse to emit until all reviewed | `false` |
| `review.showAll` | review everything, not just flagged | `false` |

Useful flags: `--docs`, `--work-dir`, `--csf-core`, `--top-k`, `--threshold`,
`--embed-provider`, `--embed-model`, `--llm-provider`, `--llm-model`, `--local`,
`--critique` / `--no-critique`, `--all`, `--accept-all`, `--strict`, `--force`,
`--config`, `--verbose`, `--quiet`. Run `--help` for the full list.

## 12. Troubleshooting

- **"OPENAI_API_KEY is not set"** — add it to `.env`, or run with `--local`, or
  use `--embed-provider mock --llm-provider mock` to try the tool.
- **"Cannot reach the Ollama daemon"** — run `ollama serve` and
  `ollama pull <model>`; set `OLLAMA_HOST` if it isn't on the default port.
- **"No document index found"** — run `ingest` before `analyze`.
- **"The embedding model changed since ingest"** — re-run `ingest` (vectors from
  two different models can't be mixed).
- **A PDF contributed nothing** — it's likely scanned/image-only (no text layer);
  OCR is out of scope. Provide a text-based version.
- **Coverage is mostly `none` with a small local model** — small models are
  over-conservative; use a larger local model or a cloud model.
