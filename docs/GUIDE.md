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
6. [The interactive menu and assessment status](#6-the-interactive-menu-and-assessment-status)
7. [Reviewing the AI's judgments (the important part)](#7-reviewing-the-ais-judgments-the-important-part)
8. [The Target Profile and the remediation plan](#8-the-target-profile-and-the-remediation-plan)
9. [Crosswalks to other frameworks](#9-crosswalks-to-other-frameworks)
10. [Reading the outputs](#10-reading-the-outputs) — including
    [reports in Spanish](#reports-in-spanish)
11. [Asking questions of the ingested documents](#11-asking-questions-of-the-ingested-documents)
12. [Strict mode, freshness, and resuming](#12-strict-mode-freshness-and-resuming)
13. [Use the full framework / your own CSF export](#13-use-the-full-framework--your-own-csf-export)
14. [Configuration reference](#14-configuration-reference)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. The mental model

The tool answers one question for **every** CSF 2.0 Subcategory: *"Does this
organization's documentation actually demonstrate this outcome is achieved?"*

It does this with an **inverted RAG** approach. Instead of you asking questions,
the tool loops over all 106 Subcategories and, for each, retrieves the most
relevant pieces of your documents and asks an AI to judge coverage **using only
that retrieved evidence**. The AI's answer is a *proposal*: it is checked in code
(every quote must really exist in the evidence) and then validated by you.

Four stages — plus an optional fifth — each saved to disk so you can stop and
resume:

```
ingest  →  analyze  →  review  →  [target]  →  report
(parse,    (AI judges    (you        (you set     (Current Profile, gap report,
 chunk,     coverage      accept/     goals,       evidence map, evidence by document,
 embed)     per item)     override)   priorities,  evidence requests, dashboard, crosswalks —
                                      plan, Tier)  + target profile, remediation plan,
                                                     POA&M export)
```

The optional `target` stage declares where you *want* to be (a **Target
Profile**); with one in place, the report also produces a prioritized
remediation plan that connects the two — which is exactly the Organizational
Profile workflow CSF 2.0 describes.

The report can also look sideways. CSF 2.0 outcomes are related to the controls
and requirements of other frameworks through mappings published under NIST's
OLIR program; the tool ships a selection of them and uses them to list, for
each identifier in another framework, the assessed outcomes related to it
(Section 9).

The read-only `status` command sits across this pipeline: it inspects the saved
artifacts, reports what is complete or stale, and recommends the next command
without running a provider or changing the assessment.

A second read-only command, `ask`, puts a single question to the ingested
documents and answers only with quotes it has verified in them (Section 11). It
uses the index that `ingest` built and nothing else, so it changes nothing in
the assessment.

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

The linked command can be run from any directory — for instance, a folder you
keep per client. The paths you give it (documents, work directory, config file)
are relative to the directory you are in. The CSF data is the exception: it is
found wherever the tool is installed, so you do not need a copy of `data/` in
each folder (Section 14 has the exact rule).

This guide uses `node bin/csf-tool.js`.

## 3. Choose how the AI runs (providers)

You decide where embeddings and reasoning happen. Nothing is hardcoded — set it
in config or via flags.

| Goal | Embeddings | Reasoning LLM | How |
| --- | --- | --- | --- |
| **Try it instantly** (no key, deterministic) | `mock` | `mock` | `--embed-provider mock --llm-provider mock` |
| **Cloud** (most capable) | `openai` | `openai` | default; set `OPENAI_API_KEY` in `.env` |
| **Fully offline / private** (docs never leave the machine) | `local-transformers` | `ollama` | `--local` |
| **Cloud, with identifiers replaced** (read the limits below) | `openai` | `openai` | `"privacy": { "redact": true }` in the config file |

- **Cloud:** copy `.env.example` to `.env` and set `OPENAI_API_KEY`. Pick the
  model in config (`llm.model`, `embeddings.model`). The OpenAI provider adapts
  automatically to model-family differences (e.g. the GPT-5 family), so you can
  point it at a current model and it will work.
- **Offline:** install [Ollama](https://ollama.com), start it with `ollama serve`,
  `ollama pull <model>` (e.g. `llama3.2`), then add `--local`. The on-device
  embedding model downloads and caches on first use. Larger local models give more
  useful coverage; very small
  ones tend to answer `none` to almost everything. Ollama is expected on this
  machine: if `OLLAMA_HOST` is set to anything but a loopback address, the tool
  treats it as remote and warns that prompts are sent over the network.

### Redacting identifiers sent to a cloud provider

With a cloud provider, text from your documents is sent to it: every chunk goes
to the embeddings provider at `ingest`, and the passages retrieved for an
outcome (or for a question, Section 11) go to the reasoning provider. Redaction
is an opt-in step in between: identifiers in that text are replaced with
placeholders before the request is made, and the placeholders in the reply are
replaced with the original values again on your machine.

Turn it on in `csf-tool.config.json`, before you run `ingest`, so that every
command uses it:

```json
{
  "privacy": {
    "redact": true,
    "terms": ["Northwind", "Jane Doe"]
  }
}
```

`--redact` does the same for a single command. `privacy.terms` is a list of
literal words or names to replace — typically the organization's name — and can
only be set in the config file. With redaction on and no terms listed, a
passage such as

```
Northwind Analytics requires multi-factor authentication for every connection
to vpn.northwind.example (10.20.30.40). Access requests are sent to
it-security@northwind.example and approved by Jane Doe, IT Security Manager,
phone +1 305 555 0142. The procedure is at https://wiki.northwind.example/access.
```

leaves the machine as

```
Northwind Analytics requires multi-factor authentication for every connection
to [[HOST_1]] ([[IP_2]]). Access requests are sent to
[[EMAIL_3]] and approved by Jane Doe, IT Security Manager,
phone +1 305 555 0142. The procedure is at [[URL_4]].
```

and, with the two terms above listed, as

```
[[TERM_1]] Analytics requires multi-factor authentication for every connection
to [[HOST_2]] ([[IP_3]]). Access requests are sent to
[[EMAIL_4]] and approved by [[TERM_5]], IT Security Manager,
phone +1 305 555 0142. The procedure is at [[URL_6]].
```

The job title and the phone number are still there in both versions: no pattern
matches them. That is the point to keep in mind — **redaction replaces
identifiers it can recognize; it does not anonymize a document.**

| Replaced | For example |
| --- | --- |
| e-mail addresses and other `user@host` forms | `it-security@northwind.example`, `root@bastion01` |
| URLs | `https://…`, `ldaps://…`, `www.…`, and a host name followed by a path, with or without a port (`portal.corp.example:8443/admin`) |
| IPv4 and IPv6 addresses | `10.0.0.5`, `192.168.1.0/24`, `2001:db8::1` |
| MAC addresses | `00:1A:2B:3C:4D:5E` |
| host names that contain a dot | `db01.corp.example` |
| the terms in `privacy.terms` | see "Choosing terms" below |

**Choosing terms.** A term is replaced wherever it appears: in any letter case,
inside a longer word, a file name, or a host name, across a line break,
hyphenated at the end of a line, and with a hyphen, an underscore, a dot, or
nothing where the term has a space (`Blue Ridge` also covers `blue-ridge` and
`BlueRidge`). List the shortest form of a name that is still distinctive:
`Northwind` covers `Northwind Analytics`, `Northwind-IR-plan.pdf`, and
`Northwind's`, while `Northwind Analytics` covers only the two words together.
Avoid very short terms — `ACE` would also be replaced inside "place" and
"interface" — and note that the tool warns about any term shorter than four
characters. A term is **not** recognized when the document spells it with a
ligature character or percent-encodes it.

**What is not recognized.** Sent as written: personal names and job titles;
company names that are not listed; postal addresses; phone numbers; account,
card, and identity numbers; passwords, keys, and other secrets; machine names
without a dot (`FS01`), directory names (`CN=…,DC=corp,DC=example`), and Windows
account names (`CORP\jsmith`); addresses written so as not to be recognized
(`10[.]1[.]2[.]3`) or without their separators; and all the surrounding text.

Document file names are deliberately left readable — the model has to cite
them — so a name such as `Asset-Inventory.docx` goes out as it is unless a
listed term matches part of it (with `Northwind` listed, `Northwind-IR-plan.pdf`
goes out as a placeholder followed by `-IR-plan.pdf`). For the same reason, a
host name whose last part is a document extension (an `.md` domain written
without `https://`) is not replaced. In the other direction, detection errs
toward replacing: a four-part number such as section `4.2.1.3` looks like an
address, and a dotted name such as `Node.js` looks like a host name. Nothing is
lost in your results, because every value is restored exactly, but the model
and the embedder do not see those words.

**Turn it on before `ingest`.** Each passage is redacted on its own — when it is
embedded, and again each time it is put into a prompt — and a value cut in half
would not be recognized in either half. So, with redaction on, `ingest` cuts
your documents into passages without splitting anything it would replace (an
address, a URL, a listed name), and records in the index that it did so and for
which list of terms. `analyze` and `ask` check that record before they send
any text, and stop if the index was built without redaction or with a different
list:

```
error: Redaction is on, but the index was built without it: a passage may begin or end in the middle of an address or a listed name, where it would not be recognized.
  → Re-run `csf-tool ingest` with redaction on (--redact), then run this command again.
```

```
error: The list of terms to redact (privacy.terms) has changed since the index was built: a passage may begin or end in the middle of a newly listed name, where it would not be recognized.
  → Re-run `csf-tool ingest` with redaction on (--redact), then run this command again.
```

**A value in two pieces is not recognized as one.** There are three situations
in which a value reaches the tool in two pieces, and in each of them part of it
is sent as written:

- **Longer than a passage.** A single value longer than a whole passage — a URL
  of more than `chunk.size` characters, 1,200 by default — still has to be cut,
  and the part after the cut is not recognized.
- **Continued on the next page of a PDF.** A passage never spans two pages, so
  a name or a URL that runs over a page break is in two passages. With
  `Blue Ridge Clinic` listed, a page that ends in "Blue Ridge" is sent with
  those two words in it; with the shorter `Blue Ridge` listed, it is not.
- **Broken across two lines.** Only a listed term is recognized across a line
  break. A URL, an e-mail address, a host name, or an IP address is recognized
  one line at a time: when a URL wraps onto a second line, it is replaced up to
  the end of the first, and what stands on the second — the rest of a path, a
  query string — is sent as written; an IP address broken in the middle is not
  replaced at all. In a PDF, every line of a page counts as a line here.

**A mistake in these settings stops the run.** Other configuration mistakes are
repaired: the setting is reset to its default, with a warning. For redaction
the default is "off", so the tool does not guess. An invalid, misspelled, or
misplaced privacy setting — `"redact": "true"` with quotes, `terms` as a single
string, `redcat` for `redact`, `redact` at the top level of the file — is an
error in every command:

```
error: Invalid privacy setting "privacy.redact": must be boolean.
  → Redaction settings are never repaired or guessed. Expected: "privacy": { "redact": true, "terms": ["Name", "Other name"] }.
```

So is a config file that cannot be used at all: one that is not valid JSON (a
trailing comma is enough) or does not hold a JSON object, or a `--config` path
that names no file. The run stops before a document is read:

```
error: Config file "csf-tool.config.json" could not be read as JSON (Expected double-quoted property name in JSON at position 80 (line 5 column 3)).
  → Fix the file, or move it aside to run on the built-in defaults. Nothing was sent anywhere.
```

**Two mistakes are not caught**, and in both the run goes ahead with nothing
redacted:

- **The word `privacy` itself is misspelled.** `"privcy": { … }` is an unknown
  key like any other, and it is ignored with a warning, which `--quiet` hides:
  `Unknown config key "privcy" ignored.`
  (Written with other capitals, `Privacy`, it is caught.) `csf-tool status`
  reads the same file and sends nothing, so it is a quick way to see that
  warning.
- **The command is run where the config file is not.** Without `--config`, the
  tool reads `csf-tool.config.json` from the directory you run it in. When
  there is none, it runs on its defaults and prints nothing about it, because
  running without a config file is normal.

The absence of an error is therefore not proof that redaction is on. The
`--redact` flag is different: the command line is checked strictly, so a
mistyped flag (`--redcat`) is an unknown option and the command stops.

**Confirm that it is on.** `ingest`, `analyze`, and `ask` say what they do with
each provider they use:

```
Redaction is on for the embeddings provider "openai:<model>": identifiers and listed terms are replaced with placeholders before each request.
Redaction is on for the reasoning provider "openai:<model>": identifiers and listed terms are replaced with placeholders before each request and restored in the reply.
```

These lines come immediately before the first request, so a missing line tells
you that text went out as written, not in time to stop it. To check before
anything can be sent, run `ingest` once — from the same directory and with the
same `--config` — with `--embed-provider mock` and a scratch `--work-dir`: with
redaction on, it prints the "not needed" line shown below, and with redaction
off it prints no line about redaction at all. `--quiet` hides these lines. What
remains afterwards is the `+redact` suffix on the provider ids: in the
`Analyze` line of `csf-tool status`, and in the provider line of
`gap-analysis.md` (and of the dashboard):

```
- Providers: embeddings = `openai:<model>+redact`, reasoning = `openai:<model>+redact`
```

A provider that runs on this machine is left alone, and the tool says so:

```
Redaction is not needed for the reasoning provider "mock": it runs on this machine, so nothing sent to it leaves the machine.
```

That covers `mock`, the on-device embeddings, and Ollama at a loopback address
(`localhost`, `127.0.0.1`, `::1`), which is where the tool looks for it unless
`OLLAMA_HOST` says otherwise. With any other `OLLAMA_HOST`, Ollama is treated
as remote: the tool warns that prompts are sent over the network, and
redaction applies to it.

**Quotes are still verified against your documents.** The model is told what a
placeholder is and to copy it exactly. When it quotes a passage, the tool puts
the original values back and only then checks the quote, word for word, against
the original passage. The index, the assessments, and the reports on your disk
hold the original text — redaction changes only what is sent. If a model alters
a placeholder, the restored quote no longer matches and is dropped like any
other unverifiable quote: you may lose a quote, but an unverified one is never
shown.

**When you change the setting.** The provider ids recorded in the work
directory carry the `+redact` suffix, and the tool does not mix redacted and
unredacted work. After you switch redaction on or off, or change
`privacy.terms`, the next `analyze` or `ask` tells you if `ingest` has to be run
again first — with one of the two messages above or, with a cloud embeddings
provider, with this one:

```
error: The index was built with embedder "openai:<model>+redact" but the current embedder is "openai:<model>".
  → Re-run `csf-tool ingest` with the current embeddings settings.
```

`analyze` then recomputes the assessments instead of reusing the cached ones.
Text sent before the change has already been sent.

**Limits.** Redaction lowers what a provider can read off a request; it is not
a guarantee about what the remaining text reveals, and it is not a substitute
for `--local` when documents must not leave the machine.

- **Redaction can be off without an error.** A config file that misspells the
  word `privacy`, or a command run from a directory that does not hold the
  config file, leaves it off (see "Two mistakes are not caught" above). Confirm
  that it is on.
- **Accuracy under redaction has not been measured.** The model and the embedder
  see placeholders instead of values, so retrieval and coverage can differ from
  a run without redaction; the published evaluation
  ([`eval/RESULTS.md`](../eval/RESULTS.md)) was run without it and did not
  measure that difference. What does not change is the check on quotes.
- **Search cannot use a replaced value.** Each text is redacted on its own
  before it is embedded, so the address in a question ("who administers
  10.0.0.5?") and the same address in a passage become unrelated placeholders,
  and the question cannot be matched to the passage by that address.
- **Placeholders show structure.** A provider sees the kind of each value
  (`EMAIL`, `HOST`, …), how many distinct values a request holds, and where the
  same value recurs within it. The value itself leaves no trace in the
  placeholder.
- **"On this machine" is judged by the address.** A local address that forwards
  to another machine (a tunnel, a port-forward, a proxy) looks local, and text
  sent through it is not redacted; there is no setting to force redaction for a
  provider the tool considers local. The OpenAI provider is always treated as
  remote, whatever `OPENAI_BASE_URL` points at.
- **A value in two pieces is not recognized as one** (see above): one longer
  than a whole passage, a name or a URL continued on the next page of a PDF,
  and a URL or an address broken across two lines.
- **A quote from a JSON line can be lost.** When a document contains a line
  that is a JSON object (a log record) and a replaced value in it holds a
  quotation mark, a backslash, or a line break, a quote of that line no longer
  matches the document after the values are put back, and it is dropped.
- **`status` does not know about redaction.** It shows the reasoning provider's
  id, with its `+redact` suffix, but it does not tell you that the index no
  longer matches the current redaction settings; `analyze` and `ask` do.
- **The terms are in your config file in clear text**, like the rest of your
  settings, and nothing on your disk is redacted.

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

Open `./output/reports/gap-analysis.md` — and `./output/reports/dashboard.html`
in a browser for the interactive view. The same folder holds
`evidence-by-document.md` (what each sample document contributed),
`evidence-requests.md` (what to ask for where nothing was found), and
`crosswalk.md` with `crosswalk.csv` (the same outcomes read by the identifiers
of other frameworks); Section 10 explains each file.

You can also see a committed reference copy under
`examples/worked-example/output/reports/`, regenerable any time with
`npm run example`. It was built with an illustrative Target Profile, so it also
contains the target-side deliverables — `target-profile.json`,
`remediation-plan.md`, and `poam.csv` — with two illustrative plan entries and
an illustrative Tier selection. Its crosswalk files are limited to two
crosswalks (`sp800-53-r5` and `cis-v8.1`) to keep the committed example small.

You can verify the saved state at any time:

```bash
node bin/csf-tool.js status --work-dir ./output
```

> `--accept-all` accepts the review queue without asking, so the run is
> non-interactive. By default the queue holds only the items flagged for review
> (96 of the 106 here); the other 10 stay unreviewed, so the reports of this run
> carry a DRAFT banner. For a real assessment you review interactively instead
> (Section 7).

Two more read-only commands work on what you just built. The first lists the
crosswalks available to reports (Section 9); the second answers a question from
the sample documents, with a quote it has verified in them (Section 11):

```bash
node bin/csf-tool.js crosswalk
node bin/csf-tool.js ask "Is multi-factor authentication required for remote access?" \
  --embed-provider mock --llm-provider mock --work-dir ./output
```

To see the same reports in Spanish, render them again with `--lang es` (see
[Reports in Spanish](#reports-in-spanish)):

```bash
node bin/csf-tool.js report --lang es --work-dir ./output
```

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
and `ollama serve`). To stay with a cloud provider but replace e-mail addresses,
host names, and similar identifiers before text is sent, turn on redaction
before you run `ingest` (Section 3) — and read its limits first.

## 6. The interactive menu and assessment status

Run with **no command** to get a guided menu that walks you through each step and
prompts for anything it needs (such as the documents path):

```bash
node bin/csf-tool.js
```

The menu and the commands call the exact same logic — use whichever you prefer.
Besides the pipeline stages it offers **Ask a question about your documents**
(Section 11) and **List available crosswalks** (Section 9). The menu also
includes **Show assessment status**, the same read-only summary available
directly from the command line:

```bash
node bin/csf-tool.js status
# equivalent: npm run status
```

`status` inspects the selected working directory and summarizes:

- **ingest** — the latest saved ingest activity and parse counts,
- **analyze** — assessed count, reasoning provider, and latest activity,
- **review** — valid, stale, and unreviewed counts plus the latest decision,
- **target** — whether a Target Profile is configured, its baseline, and date,
- **report** — missing/current/stale state, including newer upstream stages or a
  saved input snapshot/deliverable set that no longer matches.

It finishes with `Next: <command>` so an interrupted or older assessment has an
obvious continuation point. It does not call the embedding or reasoning
providers and does not modify the work directory. The menu itself requires an
interactive terminal; the `status` command also works in scripts. When
unreviewed outcomes are outside the default flagged-only queue, the
recommendation uses `review --all` so they are not accidentally left unresolved.
When the Current Profile is up to date but has no Target Profile, `target` is
shown only as an optional next step; a fully current assessment needs no action.
For a work directory created before v0.2.1, `status` marks the existing report
stale once so `report` can seed the new exact input snapshot. This one-time
regeneration enables detection of later hand edits with unchanged timestamps.

The deliverable set that `status` checks is `gap-analysis.md`,
`evidence-map.csv`, `dashboard.html` and, with a target, `target-profile.json`
and `remediation-plan.md`. It does not look for `evidence-by-document.md`,
`evidence-requests.md`, `poam.csv`, or the crosswalk files, and a change to the
crosswalk selection alone does not mark the report stale. `report` rewrites the
whole set every time, so run it again when in doubt.

During active work, the CLI gives useful context without flooding the terminal:
ingest reports the current file and percentage (sampling progress for large
folders), analysis reports every ten outcomes — cache hits included — with
percentage, elapsed time, and an approximate ETA, and review shows the current position in its
queue.

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
reviewed, that review is marked **STALE** so you can re-confirm. `status` counts
current and stale decisions separately and recommends `review` when
re-confirmation is needed.

**`review` needs a person, so it needs a terminal.** Run from a script, a pipe,
or a CI job — any session that cannot ask anyone — it does not decide on your
behalf. With items waiting in the queue it stops, writes nothing, and exits with
an error:

```
error: 96 item(s) are waiting for review, and this session is not interactive.
  → Run `csf-tool review` in a terminal to validate them. To accept the whole queue without looking at it (demos, CI), pass --accept-all explicitly.
```

Only an explicit `--accept-all` accepts the queue without prompting, as in
Walkthrough A. (With nothing waiting in the queue there is nothing to ask, and
the command ends normally. If outcomes that were not flagged for review are
still unreviewed at that point, it says how many and points to `review --all`.)
`all` follows the same rule: without a terminal and without `--accept-all` it
skips the review, so the items stay UNREVIEWED in the reports it writes, under
the DRAFT banner.

## 8. The Target Profile and the remediation plan

A Current Profile tells you where you are. CSF 2.0's real payoff comes from
comparing it against a **Target Profile** — where you've decided you want to be —
and working the gap as a plan. The `target` stage records those decisions:

```bash
node bin/csf-tool.js target
```

In a terminal this opens an editor where you can:

- set a **baseline** goal for every outcome (default: `substantial`),
- **override** any Function, Category, or Subcategory (most specific wins —
  e.g. baseline `substantial`, but all of `PR.AA` to `full`),
- mark an outcome **not-applicable** with a note (e.g. no OT systems — it is
  excluded from the met/unmet numbers and listed separately),
- set **remediation priorities** (`high` / `medium` / `low`) at any granularity,
- record your organization's **CSF Tier** selection (current Tier, target Tier,
  and an optional note),
- **preview** the resolved targets against your current assessment before saving.

Everything here is a *human* decision — no AI is involved in targets, priorities,
scoping, or the Tier selection. The spec is saved to `<work-dir>/target.json`
(human-owned, like your reviews: re-running `analyze` never touches it) and it's
plain, validated JSON you can also edit by hand or keep in version control:

```json
{
  "default": "substantial",
  "categories": { "PR.AA": "full" },
  "subcategories": { "PR.AA-06": "not-applicable" },
  "priorities": { "PR.AA": "high", "RC": "low" },
  "notes": { "PR.AA-06": "Fully remote organization; no physical facilities." }
}
```

For scripted runs: `--target-default <level>` sets the baseline,
`--target-import <path>` replaces the spec with a file of the same shape (e.g.
derived from a NIST Community Profile), and `--tier-current <1-4>` /
`--tier-target <1-4>` record the Tier selection. The flags can be combined.

With a target in place, `report` additionally produces `target-profile.json` and
**`remediation-plan.md`** — every unmet target as one ranked list (your priority
first, then distance from the goal), each item showing the outcome, the
assessment rationale, and **NIST's official CSF 2.0 Implementation Examples** as
suggested actions, quoted verbatim from the CPRT export. The tool never invents
recommendations, the same way it never accepts an unverifiable evidence quote.
It also writes **`poam.csv`**, the same open items as a tracker (below).

### Tracking the plan: owner, due date, status

`remediation-plan.md` is regenerated on every run, so it cannot be where you
write down who does what by when. Those fields live in `target.json`, next to
your targets and priorities, under `plan` — one entry per Subcategory id:

```json
{
  "default": "substantial",
  "plan": {
    "PR.AA-03": {
      "owner": "IT Operations Lead",
      "due": "2026-06-30",
      "status": "in-progress",
      "milestones": "Pilot with administrator accounts, then extend to all staff."
    },
    "GV.PO-01": { "owner": "Chief Information Security Officer", "status": "done" }
  }
}
```

Every field is optional. `status` is one of `open`, `in-progress`, `done`,
`risk-accepted`. `due` is a date written `YYYY-MM-DD`, and it must exist in the
calendar (`2026-02-30` is rejected). Keys must be Subcategory ids; any other key
is warned about and ignored. In this version the plan fields are edited by hand
in `target.json` — the interactive editor does not offer them — and the file is
validated on every load, with a message that names the field to fix.

With a `plan` in place, `report`:

- shows the recorded fields on one line under the item in `remediation-plan.md`;
- carries them in `target-profile.json` (`plan`, per Subcategory);
- fills the `status`, `owner`, `due`, and `milestones` columns of `poam.csv`.

The line in the remediation plan looks like this:

```
- Plan (recorded in the target profile): owner: IT Operations Lead; due: 2026-06-30; status: in-progress; milestones: Pilot with administrator accounts, then extend to all staff.
```

The dashboard does not show the plan fields.

`poam.csv` is written whenever a target profile exists, with or without plan
fields. It has one row per unmet applicable target, in the remediation plan's
order, followed by one row for every outcome that still has a `plan` entry
although its target is now met or scoped out — so an item you were tracking
never disappears silently. Its columns:

| Column | Content |
| --- | --- |
| `poam_id` | `POAM-<Subcategory id>`, e.g. `POAM-PR.AA-03`. Derived from the outcome, not from the row position, so re-prioritizing never renumbers your tracker. |
| `subcategory_id`, `function`, `category` | Where the item sits in the CSF Core. |
| `weakness` | A fixed sentence around the official outcome text: "Outcome not demonstrated at the target level: …". For rows kept only because of a plan entry: "Target level met in the current assessment: …" or "Outcome marked not-applicable in the target profile: …". |
| `current_coverage`, `target_coverage`, `levels_to_close` | The gap. |
| `priority` | Your remediation priority (empty for an outcome that is scoped out). |
| `target_met` | `no` for open items; `yes` or `n/a` for the rows kept because of a plan entry. |
| `review_status` | Whether the current coverage has been validated by a reviewer. |
| `status` | Your value; `open` when an unmet item has none. A row whose target is met keeps whatever you recorded — the tool never sets it to `done` for you. |
| `owner`, `due`, `milestones` | Your values, or empty. An empty cell is correct output: nobody has decided yet. |
| `nist_implementation_examples` | NIST's Implementation Examples for the outcome, verbatim, separated by ` \| `. Empty for rows whose target is met or scoped out. |
| `assessment_rationale` | The assessment's (AI-generated) rationale. |
| `target_note` | Your note on the target, if any. |
| `report_date` | On open items, the date of the report run that produced the file. The tool keeps no history, so this is not the date a gap first appeared, and it moves with every run. Empty for rows whose target is met or scoped out. |

The file uses the same CSV conventions as `evidence-map.csv` (RFC-4180 quoting,
UTF-8 with a BOM, and cells that would be read as formulas are neutralized). It
is a tracker export in the general shape of a Plan of Action and Milestones; it
does not follow, or claim to conform to, any particular agency's template. It is
regenerated, not merged: anything typed into the CSV itself is lost on the next
`report`, which is why the fields you own live in `target.json`.

### CSF Tiers

CSF 2.0 has three components: the Core, Organizational Profiles, and Tiers.
NIST's description (CSF 2.0, Section 3.2) is that "Tiers characterize the rigor
of an organization's cybersecurity risk governance and management practices",
and that "An organization can choose to use the Tiers to inform its Current and
Target Profiles." A Tier is therefore something you select, not something the
tool can compute from Subcategory coverage. The tool records your selection and
carries it through the reports; it does not suggest one and does not check yours
against the assessment. The four Tiers are Tier 1 Partial, Tier 2 Risk Informed,
Tier 3 Repeatable, and Tier 4 Adaptive; for what each one means, read NIST's own
description in *The NIST Cybersecurity Framework (CSF) 2.0*, NIST CSWP 29,
Appendix B. The tool ships the names only.

Record the selection in any of three ways. With flags:

```bash
node bin/csf-tool.js target --tier-current 2 --tier-target 3
```

which prints something like this (`created` instead of `updated` when there was
no target profile yet):

```
Target profile updated: ./output/target.json
  resolved targets: substantial 106
  CSF Tier (selected by the organization): current Tier 2 (Risk Informed), target Tier 3 (Repeatable)
Run `csf-tool report` to generate the remediation plan against this target.
```

Or with the **Record the CSF Tier selection** entry of the interactive editor
(current Tier, target Tier, optional note). Or by hand in `target.json`:

```json
{ "default": "substantial", "tiers": { "current": 2, "target": 3, "note": "Agreed by the Security Committee." } }
```

Each side is a number from 1 to 4, or `null` when not recorded; each flag sets
only its own side. A flag value that is not a whole number from 1 to 4 is
reported and discarded, so nothing is recorded for that side. For
`--tier-current 7`:

```
warning: Invalid config value at "/tierCurrent" (must be <= 4); reverted to default.
```

A target Tier lower than the current one is accepted — an organization may
decide that — and the `target` command prints a warning so that it is not a
slip. A value edited by hand in `target.json` is validated but not warned
about.

When a Tier is recorded it appears in `target-profile.json` (`tiers`), in the
"Current vs Target" section of `gap-analysis.md`, in the overview of
`remediation-plan.md`, and as a tile in the dashboard — each time stated as
selected by the organization and not derived by the tool:

```
CSF Tier — current: Tier 2 (Risk Informed); target: Tier 3 (Repeatable). Selected by the organization and recorded in the target profile; not derived by this tool. Tier definitions: NIST Cybersecurity Framework (CSF) 2.0, NIST CSWP 29, Appendix B.
```

When none is recorded, nothing is printed: no empty line, no placeholder. A note
is shown only together with a recorded Tier. The tool records one current/target
pair for the whole organization.

## 9. Crosswalks to other frameworks

The assessment is organized by CSF 2.0 outcome. A crosswalk lets you read it
by another framework's identifiers instead — "which of my assessed outcomes
relate to SP 800-53 AC-02?" — without assessing anything twice. The
relationships come from mappings published through NIST's National Online
Informative References (OLIR) Program; the tool ships ten of them as data and
adds none of its own.

**See what is available.**

```bash
node bin/csf-tool.js crosswalk
```

```
Crosswalks (CSF 2.0 → other frameworks)
Data file: data/csf-crosswalks.json
Source: NIST National Online Informative References (OLIR) Program, via the NIST CSF 2.0 reference data service
Catalog where each mapping and its developer are listed: https://csrc.nist.gov/projects/olir/informative-reference-catalog
Retrieved: 2026-11-13 · CSF 2.0

✓ sp800-53-r5     NIST SP 800-53 Rev. 5.2.0 · default set
                  mapping by National Institute of Standards and Technology · released 2025-11-17
                  relates to 106/106 Subcategories, 2 whole Categories, 0 whole Functions
                  mapping document: https://csrc.nist.gov/csrc/media/projects/olir/documents/submissions/Cybersecurity_Framework_v2-0_Concept_Crosswalk_800-53_5_2_0_draft.xlsx
...
✓ cis-v8.1        CIS Critical Security Controls v8.1 · default set
                  mapping by Center for Internet Security (CIS) · released 2025-12-23
                  relates to 48/106 Subcategories, 0 whole Categories, 0 whole Functions
...
— pci-dss-4.0.1   PCI DSS v4.0.1 · opt-in · third-party mapping (not produced by the framework's publisher)
                  mapping by Independent · released 2025-12-23
                  relates to 101/106 Subcategories, 0 whole Categories, 0 whole Functions

✓ included in reports · — not selected
Selected by the current configuration: the default set, 8 of 10 ("report.crosswalks" is not set).
Select with --crosswalk <ids|default|all|none> or "report.crosswalks" in the config file.
Third-party mappings are opt-in: name them (for example "default,<id>") or use "all". They are reproduced as published.
A mapping records that a CSF outcome and a reference are related; it is not a determination of conformance.
```

The command is read-only (in a terminal the list is shown in a box). Each entry
shows the mapping's developer and release date as NIST's catalog lists them, how
much of the Core the mapping relates to, and whether it is in the default set or
opt-in. A link to the mapping's own document appears only when NIST hosts that
document; for every mapping, the catalog is the place to look it up.

**Choose what goes into the reports.** By default every crosswalk is included
except third-party mappings — the ones developed by neither NIST nor the body
that publishes the mapped framework. To change that for one run:

```bash
node bin/csf-tool.js report --crosswalk sp800-53-r5,cis-v8.1     # exactly these
node bin/csf-tool.js report --crosswalk default,iso27001-2022   # the default set plus one third-party mapping
node bin/csf-tool.js report --crosswalk all                     # everything, third-party mappings included
node bin/csf-tool.js report --crosswalk none                    # no crosswalk deliverables
node bin/csf-tool.js report --crosswalk default                 # the default set, whatever the config file says
```

The flag applies to that run only. To make the choice permanent, set it in
`csf-tool.config.json`:

```json
{ "report": { "crosswalks": ["sp800-53-r5", "cis-v8.1"] } }
```

An id the data file does not contain is reported once, with the list of known
ids, and ignored. When no crosswalk is selected, `crosswalk.md` and
`crosswalk.csv` from an earlier run are removed, so an old file is never left
next to a newer report.

A third-party mapping is reproduced exactly as its developer published it. That
includes entries that are not specific (the ISO/IEC 27001:2022 mapping relates
the PROTECT Function to "Annex A Controls: All applicable controls") and entries
that look like mistakes (the same mapping cites clauses 6.11 and 6.13, which
the standard does not have). The tool does not correct them; it labels the
mapping and leaves the judgment to you.

**Read the result.** `crosswalk.md` opens with how to read it, then has one
section per selected crosswalk. This excerpt is from the worked example:

```
## NIST SP 800-53 Rev. 5.2.0

- Crosswalk id: `sp800-53-r5`
- Mapping: Cybersecurity-Framework-v2.0-to-SP-800-53-Rev-5-2-0, version 1.0.0, released 2025-11-17
- Mapping developer (as listed in the mapping source): National Institute of Standards and Technology
- Catalog where this mapping and its developer are listed: <https://csrc.nist.gov/projects/olir/informative-reference-catalog>
- Mapping document (hosted by NIST): <https://csrc.nist.gov/csrc/media/projects/olir/documents/submissions/Cybersecurity_Framework_v2-0_Concept_Crosswalk_800-53_5_2_0_draft.xlsx>
- Relationships recorded for: 106 of 106 Subcategories, 2 of 22 Categories, 0 of 6 Functions

The counts below describe the CSF outcomes related to each reference; a reference related to a whole Category or Function is related to every outcome under it. They describe those outcomes: they do not say whether a reference is satisfied, and they are not a measure of conformance with NIST SP 800-53 Rev. 5.2.0.

- References listed: 214
- References with at least one related outcome at none or partial: 212

**References related to individual outcomes (Subcategories)**

| Reference | Related CSF 2.0 outcomes (coverage) |
| --- | --- |
...
| AC-02 | PR.AA-01 (partial), PR.AA-05 (partial), PR.DS-10 (partial), DE.CM-01 (partial), DE.CM-03 (partial) |
...

**References related to a whole Category or Function**

The mapping relates each of these references to the Category or Function as a whole, not to one outcome in it. The last column counts the outcomes under it by coverage.

| Reference | Related Category or Function | Outcomes under it, by coverage |
| --- | --- | --- |
...
| IR-08 | Category: Incident Management (RS.MA) | 5 outcomes: none 4, partial 1 |
| IR-09 | Category: Incident Management (RS.MA) | 5 outcomes: none 4, partial 1 |
```

Read a row of the first table as: "the mapping relates AC-02 to these five
outcomes; this assessment found `partial` evidence for each of them." It is a
pointer to where your evidence is — open those outcomes in the gap analysis or
the dashboard to see the quotes. It is **not** a finding that AC-02 is
implemented, partly implemented, or missing: a mapping records that two things
are related, not that they are equivalent, and the coverage belongs to the CSF
outcome.

The second table exists because a mapping does not always point at one outcome.
NIST's SP 800-53 mapping relates IR-09 to the Category RS.MA as a whole and to
no individual Subcategory. The row shows how the five outcomes of that Category
are distributed across coverage levels; it does not pick one of them, and it
does not repeat the reference once per outcome. A reference can appear in both
tables (IR-08 does): it is then related to some outcomes individually and to a
Category or Function as a whole.

The count under each crosswalk — references with at least one related outcome
at none or partial — treats a reference related to a whole Category or Function
as related to every outcome under it. While the assessment is not fully
reviewed, a second line counts the references with a related outcome still
unreviewed or stale, and the outcomes concerned are marked in the tables. There
is deliberately no matching count of references whose related outcomes are all
covered, and no percentage: either would read as a statement about the other
framework.

`crosswalk.csv` carries the same relationships, one row each:

| Column | Meaning |
| --- | --- |
| `crosswalk_id`, `framework` | which mapping the row comes from |
| `reference` | the identifier prefixed with the crosswalk id (`cis-v8.1:3.10`) — a key that is unique across crosswalks and that a spreadsheet cannot turn into a number |
| `reference_id` | the identifier in that framework, as published in the mapping |
| `csf_level` | `subcategory`, `category`, or `function`: the level at which the mapping records the relationship |
| `csf_id` | the related CSF 2.0 element at that level (`PR.AA-01`, `RS.MA`, `RS`) |
| `function`, `category` | the Function and Category it belongs to (`category` is empty on a Function row) |
| `subcategory_coverage`, `subcategory_review_status` | this assessment's result for the CSF outcome — filled on `subcategory` rows only. A Category or Function has several outcomes and no single value, so these cells are empty there; join on `csf_id` (to `evidence-map.csv` or `current-profile.json`) to see them |
| `mapping_developer`, `mapping_release_date` | who developed the mapping and when, per NIST's catalog |
| `third_party_mapping` | `yes` when the developer is neither NIST nor the framework's publisher |

Rows are ordered by crosswalk, then reference identifier (natural order: 3.8
before 3.10), then Subcategory rows, Category rows, and Function rows. Use the
`reference` column to filter or join on a control; if you use `reference_id`
instead, import it as text (see Troubleshooting).

In `dashboard.html`, expanding an outcome shows a "Related references
(informative)" block: that outcome's identifiers per selected crosswalk, then
one line for identifiers related to its whole Category or Function. The search
box matches all of them, as plain text: typing `IR-09` lists the five outcomes
of the Category it is related to.

**Identifiers only.** The data contains control, requirement, and clause
numbers, never their text — several of the referenced frameworks are
copyrighted by their publishers. Keep the framework's own publication at hand
to look up what an identifier requires.

**What a crosswalk cannot tell you.**

- Whether a control or requirement of the other framework is met. The
  deliverables show related CSF outcomes and the evidence found for them, and
  stop there.
- How close a relationship is. The NIST service returns each relationship
  without a type, strength, or rationale, so the deliverables cannot tell a
  close match from a loose one; the mapping's entry in NIST's catalog is the
  place to check.
- Anything about an outcome a mapping does not relate to. Mappings differ in how
  much of the Core they relate to (CIS Controls v8.1: 48 of 106 Subcategories;
  SSDF: 26). An outcome with no related reference means the mapping records
  none, not that the frameworks have nothing in common there.
- Anything newer than the data. One mapping per framework is shipped, at one
  version, as retrieved on the date the listing shows; nothing checks for
  updates at run time (Section 13 shows how to refresh the data).

With every crosswalk selected the files are large — on the full Core, about
3,900 rows in `crosswalk.csv` — and the dashboard's "whole Category or Function"
line can list many identifiers. Select the crosswalks you work with.

<!-- Anchor of this section before v0.4, kept so that existing links to it still work. -->
<a id="9-reading-the-outputs"></a>

## 10. Reading the outputs

Everything is written to `<work-dir>/reports/`, in English unless you ask for
Spanish (see [Reports in Spanish](#reports-in-spanish) at the end of this
section):

- **`current-profile.json`** — the machine-readable Current Profile, aligned with
  the CSF 2.0 Organizational Profile concept. One entry per Subcategory with the
  effective `coverage` (`none` / `partial` / `substantial` / `full`),
  `confidence`, `review_status` (`reviewed` / `unreviewed` / `stale`), both the
  AI and human values, the supporting `evidence`, a `verification` summary, and
  an `activity` snapshot with `ingestedAt`, `analyzedAt`, `lastReviewedAt`,
  `reviewDecisions`, analysis completeness/freshness, and parsed/skipped/failed
  document counts.

- **`gap-analysis.md`** — for people. A coverage summary and a per-Function table,
  then **gaps first** (what to address), then partial coverage with quotes, then
  what's covered. Overrides and verifier downgrades are annotated inline.

- **`evidence-map.csv`** — one row per (Subcategory, verified quote), linking each
  outcome to its source file, page, similarity score, and the verbatim quote.
  Opens cleanly in a spreadsheet (RFC-4180 quoting; spreadsheet formula-injection
  is neutralized).

- **`evidence-by-document.md`** — the reverse view of the evidence map, and
  usually the first thing to show the people who gave you the documents: *which
  of your documents carry this assessment*. It has four parts:

  - a **summary**: documents ingested, how many are quoted at least once, how
    many never, how many outcomes have at least one verified quote, and how
    concentrated the evidence is (how many of the first documents in the table
    it takes to account for half of the outcomes that have a quote — counted on
    distinct outcomes, since several documents can support the same one);
  - a **table** of documents, ordered by the number of outcomes each is quoted
    for: chunks indexed, outcomes it was *retrieved for* (at least one of its
    passages was among those the assessment looked at), outcomes it is *quoted
    for*, verified quotes, a breakdown of those outcomes by their current
    coverage, and the Functions touched;
  - **what each document is quoted for**, outcome by outcome, with coverage,
    review status, and PDF page numbers;
  - **ingested but never quoted**.

  For the sample documents the table reads:

  ```
  | Document | Chunks | Retrieved for | Quoted for | Verified quotes | None | Partial | Substantial | Full | Functions |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
  | `information-security-policy.md` | 2 | 106 | 27 | 27 | 0 | 20 | 5 | 2 | GOVERN, PROTECT, RECOVER |
  | `incident-response-plan.pdf` | 2 | 103 | 14 | 14 | 0 | 14 | 0 | 0 | GOVERN, IDENTIFY, DETECT, RESPOND, RECOVER |
  | `access-control-standard.md` | 2 | 106 | 6 | 6 | 0 | 6 | 0 | 0 | GOVERN, PROTECT |
  | `asset-inventory-procedure.docx` | 1 | 83 | 5 | 5 | 0 | 2 | 1 | 2 | IDENTIFY |
  | `data-protection-note.txt` | 1 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | — |
  ```

  Read "never quoted" narrowly. It means no passage from the document was
  selected as verbatim evidence for a CSF outcome in this assessment — the
  content may be outside the framework's scope, duplicate what another document
  was quoted for, or not have been retrieved. Read "retrieved for" narrowly too:
  it counts the outcomes whose retrieved passages included the document and says
  nothing about relevance. With a handful of documents and the default `top-k`,
  most documents are retrieved for most outcomes, as above. An outcome can
  appear with coverage `none` under a document: that happens when a reviewer
  overrode the assessment to `none`, and the quotes the assessment had selected
  stay listed so the decision remains traceable.

  The report states its own caveats as notes: a document list that had to be
  reconstructed (see Section 12), files that share a name, an analysis that is
  unfinished or older than the document index. Files that failed to parse or had
  no extractable text are counted ("Not ingested: …") but not named.

- **`evidence-requests.md`** — what to do about the gaps before deciding they
  are real. The assessment's rule is that absence of evidence is `none`; that is
  the right rule for an assessment, and it is also why a first run on a partial
  document set looks worse than the organization is. For each open outcome the
  list gives the official outcome text, the current coverage (and target), the
  review status, the assessment's rationale, the documents already quoted, and
  then:

  1. *Is this outcome achieved today, and who is accountable for it?*
  2. *Where is it documented, and when was that documentation last reviewed?*
  3. *Which records show it operating in practice (not only that it is required)?*

  The questions are the same for every outcome on purpose — they mirror the
  assessment's own rubric (the outcome rather than the topic; documentation;
  operation rather than intent), and the tool does not compose outcome-specific
  advice it could not ground. Under them is a checklist of NIST's Implementation
  Examples for that outcome, verbatim: records showing any of those practices in
  operation are the kind of evidence to collect. The examples are illustrative —
  not an exhaustive list, and not a baseline of required actions — and
  collecting a record for one of them does not by itself raise a coverage level:
  the next assessment and the reviewer decide that.

  Without a target profile the list covers every outcome at `none` or `partial`,
  grouped by Function. With one, it covers the applicable outcomes that do not
  meet their target, in the same order and numbering as `remediation-plan.md`,
  so the two can be read side by side. On the full Core it is long (95 items for
  the worked example); it is meant to be worked through or filtered, not read
  end to end.

  To close an item: collect the documents or records, add them to your documents
  folder, and run `ingest`, `analyze`, `review`, and `report` again. The
  assessment gives a level above `none` only when a quote verified verbatim
  against the documents supports it, and a reviewer has the last word.

- **`dashboard.html`** — the same picture as an interactive page: open it with a
  double click (no server, no network — everything is inline, so nothing about
  your assessment leaves the machine). Coverage by Function, review progress,
  current-vs-target when a target exists, and a searchable, filterable explorer
  of every outcome with its verified quotes. An **Evidence by document** table
  shows the same per-document figures as `evidence-by-document.md` (the first
  ten documents, with a control to show all), and a **CSF Tier** tile shows your
  Tier selection when one is recorded. It also shows a compact assessment
  activity snapshot with readable dates; a Human overrides tile and inline
  markers; and quick filters for everything needing attention, gaps, pending
  reviews, and unmet targets. Search covers rationale, reviewer/target notes,
  source filenames, evidence quotes, target details, and NIST Implementation
  Examples as well as the outcome fields. With crosswalks selected, each
  outcome's detail panel lists its related reference identifiers, and search
  matches those identifiers too. Light/dark themes; each chart has a "view as
  table" twin.

  The dashboard remains a generated, self-contained snapshot rather than a live
  application. If `status` says the report is stale after newer ingest, analysis,
  review, or target work, run `report` again to refresh the activity and results
  shown there.

When a target profile exists (Section 8), three more files appear:

- **`target-profile.json`** — the machine-readable Target Profile: per
  Subcategory, current vs target coverage, gap size, priority, scoping, and the
  NIST implementation examples; plus `plan` per Subcategory and `tiers` when you
  recorded them.

- **`remediation-plan.md`** — the prioritized action plan (the artifact you take
  to planning): overview, current-vs-target by Function, then every unmet target
  ranked, with NIST's example actions under each and your owner / due date /
  status where recorded.

- **`poam.csv`** — the open items as a tracker: one row each, with a stable id
  and your owner, due date, status, and milestones (Section 8).

When crosswalks are selected (the default — see Section 9), two more files
appear:

- **`crosswalk.md`** — for people. How to read it, then for each crosswalk its
  provenance, a count of references with a gap among their related outcomes, a
  table of reference identifiers with their related CSF 2.0 outcomes and those
  outcomes' coverage, and a second table for references related to a whole
  Category or Function. Carries the DRAFT banner and inline UNREVIEWED / STALE
  marks when the assessment is not fully reviewed.

- **`crosswalk.csv`** — the same relationships as rows, with the mapping's
  developer, release date, and third-party flag on every row. Same CSV
  conventions as `evidence-map.csv`.

Coverage levels mean: **none** (not demonstrated), **partial** (addressed in part,
or only as stated intent/policy), **substantial** (largely achieved in operation),
**full** (clearly achieved in operation). Intent ("must"/"shall") is treated as
weaker than records showing the outcome actually happens.

### Reports in Spanish

Every deliverable a person reads can be generated in Spanish. To render the
assessment you already have:

```bash
node bin/csf-tool.js report --lang es --work-dir ./output
```

or to run the whole pipeline in Spanish from the start — here, the offline
sample run of Walkthrough A:

```bash
node bin/csf-tool.js all \
  --docs examples/sample-docs \
  --embed-provider mock --llm-provider mock \
  --work-dir ./output --accept-all --lang es
```

To make it the default for a project, set it in `csf-tool.config.json`:

```json
{ "report": { "language": "es" } }
```

**What you get.** The same files, under the same names, in Spanish. From that
sample run, the title and the coverage table of `gap-analysis.md`:

```
# CSF 2.0 del NIST — Perfil Actual y análisis de brechas

## Cobertura por Función

| Función | Total | Ninguna | Parcial | Sustancial | Completa | % cubierto |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GOBERNAR | 31 | 8 | 16 | 5 | 2 | 23% |
| IDENTIFICAR | 21 | 14 | 4 | 1 | 2 | 14% |
| PROTEGER | 22 | 12 | 10 | 0 | 0 | 0% |
| DETECTAR | 11 | 4 | 7 | 0 | 0 | 0% |
| RESPONDER | 13 | 12 | 1 | 0 | 0 | 0% |
| RECUPERACIÓN | 8 | 4 | 4 | 0 | 0 | 0% |
```

and, once a target of `substantial` is set, the first entry of
`remediation-plan.md`:

```
#### 1. GV.OC-01 — ninguna → sustancial (faltan 2 niveles de cobertura)

- Función / Categoría: GOBERNAR / Contexto organizativo (GV.OC)
- Resultado: Se comprende la misión de la organización y se informa sobre la gestión de riesgos de seguridad cibernética.
- Fundamento de la evaluación: [Rebajado automáticamente: la cobertura declarada no tenía ninguna cita textual verificable en la evidencia recuperada.] The organization appears to link its mission to cybersecurity risk decisions through a formal annual review.
- Acciones sugeridas (Ejemplos de implementación del CSF 2.0 del NIST, en inglés):
  1. Share the organization's mission (e.g., through vision and mission statements, marketing, and service strategies) to provide a basis for identifying risks that may impede that mission
```

Three kinds of text are in those reports, and each follows its own rule:

- **The tool's own wording** — titles, headings, notes, and the words for
  coverage levels, review states, priorities, and plan status — is translated.
- **The framework's text** — the names of the Functions and Categories, and the
  outcome of each Subcategory — is NIST's official Spanish translation of
  CSF 2.0 (NIST CSWP 29 spa, shipped as `data/csf-core.es.json`). The tool does
  not translate it. Each report says where the text comes from and that the
  assessment was made against the English original, which remains the
  reference text. NIST publishes the Implementation Examples in English only,
  so they are shown in English, and the reports say so.
- **Your organization's text** — quotes from your documents, file names,
  reviewer notes, target notes, plan fields — is shown exactly as written. A
  quote is never translated: it is evidence because it can be found, word for
  word, in the document.

In the excerpt above, the rationale is partly in English because the offline
`mock` provider always writes its fixed English sentences (see "AI-written
text" below).

**What stays in English.** The machine-readable files (`current-profile.json`,
`target-profile.json`, `evidence-map.csv`, `crosswalk.csv`, `poam.csv`) keep
their English keys, headers, and values, so a script or a spreadsheet that
reads them does not depend on the language of the reports: for the same
assessment, an English and a Spanish `report` write the same bytes, apart from
the generation timestamp. That includes `poam.csv`, although people do open it
in a spreadsheet. Text that is data stays as it is — identifiers, the names of
other frameworks, provider ids, file names — and the timestamps in the Markdown
reports are ISO 8601 in both languages. The tool's own messages in the terminal
— progress lines, `status`, the menu, the review and target prompts, errors,
`--help` — are in English in this version; only the `ask` answer is translated
there. A few sentences that the tool itself stores with the assessment — for
example, the note it puts in front of a rationale that the verifier
downgraded — are stored in English, in `current-profile.json` too, and
translated only where a report shows them.

**The dashboard.** `dashboard.html` is rendered in Spanish the same way: the
interface text, the page title, `<html lang="es">`, the labels read by
assistive technology, and the message shown when JavaScript is off. Filters,
search, and table views work as in English, and the search finds both the
Spanish text shown and the English original. Dates are formatted by the
browser.

**Questions.** `ask` follows the same setting. The labels and the tool's own
sentences are in Spanish; the question, the quotes, and the file names are
shown as they are:

```
Pregunta: Is multi-factor authentication required for remote access?

Respuesta (resumen generado por IA; debe contrastarse con las citas siguientes):
The passage of "access-control-standard.md" that shares the most key terms with the question is quoted below. This is the offline mock engine: it matches words and does not interpret them, so read the quote to see what it says.

Citas verificadas (1):
  1. access-control-standard.md: "Multi-factor authentication is enforced for all remote access and for all administrative accounts."

La cita que devolvió el modelo se verificó palabra por palabra en los documentos incorporados.
Solo las citas están verificadas. El resumen es la redacción del modelo y no está verificado.
Pasajes del índice examinados: 6 de 8, por orden de relevancia (retrieval.topK = 6).
```

**AI-written text, and switching the language of an existing assessment.** The
rationale of each assessment is written by the model. With `--lang es`, the
assessment prompts and the `ask` prompt end with one added instruction: write
the rationale (or the answer) in Spanish, and leave every quote verbatim, in
the language of the evidence. The rest of the prompt, retrieval, the output
format, and the verifier are the same in both languages. Because a different
prompt produces a different assessment, the tool treats a Spanish analysis and
an English one as two different analyses:

- `report --lang es` never re-analyzes and sends nothing to a provider. It
  renders the assessment you have, reviewed as it is; rationales that were
  written in English stay in English.
- `analyze --lang es` (or `all --lang es`) in a work directory that was
  analyzed in English assesses every outcome again — on the sample,
  `106 assessed, 0 reused`; with a cloud provider, that is the cost of a full
  analysis. Your reviews stay valid wherever the coverage and the quotes come
  out the same and are marked stale where they changed, and `status` reports
  the existing reports as stale until `report` is run. Going back to English
  assesses everything again.
- Upgrading re-analyzes nothing: an English run uses the prompts and the cache
  it used before.

If you want Spanish rationales, set the language before the first `analyze`.
If you only want the deliverables in Spanish, use `report --lang es`.

**A tailored CSF Core.** NIST's Spanish text is shown for an element only when
that element is the one NIST translated: the same identifier and the same
English text as in the Core shipped with the tool. An outcome you reworded, or
added, in your own Core file (Section 13) is shown with the text it was
assessed with, and the note at the top of each report says how many outcomes
that applies to. The comparison is made with the Core file shipped inside the
tool, so tailor a copy of it rather than editing that file in place.

**Limits.**

- **The instruction to write in Spanish is a request.** Whether a model follows
  it is up to the model, and nothing downstream depends on it. The offline
  `mock` provider always writes English, so a trial run shows English
  rationales inside Spanish reports.
- **Not measured.** The published evaluation
  ([`eval/RESULTS.md`](../eval/RESULTS.md)) was run with the English prompts
  only, and the added instruction has not been run against a real model in this
  project's tests or evaluation. The verifier is unchanged — an unverifiable
  quote is removed in any language — but whether the instruction changes how a
  model judges coverage, or how often it proposes an unverifiable quote, is not
  known.
- **`status` does not look at the language.** After `report --lang es` it shows
  the reports as current without saying which language they are in, and
  changing `report.language` does not mark existing reports as stale. A work
  directory holds its reports in one language at a time: run `report` to render
  them in the language you want.
- **Two languages.** `en` and `es` only; a regional variant such as `es-MX` is
  not accepted. Dates and numbers are not localized in the Markdown reports.

## 11. Asking questions of the ingested documents

An assessment is run once per review cycle. `ask` makes the same ingested
documents useful in between — "do we have an incident response plan?", "how
often are access rights reviewed?" — under the same rule as everything else the
tool produces: what it shows must stand on text that was verified, word for
word, in your documents.

```bash
node bin/csf-tool.js ask "How often are access rights reviewed?"
```

Put the question in quotes, so that the shell does not interpret a `?` or
another special character in it. In a terminal, `ask` with no question prompts
for one, and the interactive menu offers the same action. The command needs the
index that `ingest` built and the same embeddings provider that built it. It
reads no assessment, review, target, or report and writes nothing, so a question
can never change an assessment or make a report stale.

With the sample documents and the offline engine of Walkthrough A:

```bash
node bin/csf-tool.js ask "How often are access rights reviewed?" \
  --embed-provider mock --llm-provider mock --work-dir ./output
```

```
Searching 8 indexed passage(s) and asking mock…
Question: How often are access rights reviewed?

Answer (AI-generated summary — check it against the quotes below):
The passage of "access-control-standard.md" that shares the most key terms with the question is quoted below. This is the offline mock engine: it matches words and does not interpret them, so read the quote to see what it says.

Verified quotes (1):
  1. access-control-standard.md: "Access Reviews Access permissions are reviewed every quarter."

The quote returned by the model was verified verbatim against the ingested documents.
Only the quotes are verified. The summary is the model's wording and is not itself verified.
Searched the 6 most relevant of 8 passages of the index (retrieval.topK = 6).
```

The offline engine only matches words, as its own summary says. A real model is
asked for one to four plain sentences that state only what the quoted evidence
shows, and to say whether that evidence is a requirement or a record of
something actually happening.

**How to read an answer.**

- **The quotes are the result.** Each one was found verbatim in a single
  retrieved passage, by the same verifier the assessment uses, and is shown with
  its file and, for a PDF, its page. Line breaks inside a quote are shown as
  spaces (which is why the quote above starts with a heading). Quotes the model
  returned that could not be verified are removed, and the line under the quotes
  says how many were.
- **Verified means "this text is in your documents".** It does not mean the
  quote answers the question, that the summary reads it correctly, or that what
  a policy requires is actually done. The summary is the model's wording and is
  not checked against anything: read the quotes and judge.
- **The last line says what was searched.** Only the passages retrieved for the
  question are read — `retrieval.topK` of them, 6 by default (`--top-k <n>` for
  one run).

**When there is no answer.**

```bash
node bin/csf-tool.js ask "What is the retention period for backup tapes?" \
  --embed-provider mock --llm-provider mock --work-dir ./output
```

```
Question: What is the retention period for backup tapes?

No verifiable evidence in the ingested documents answers this question.
Searched the 6 most relevant of 8 passages of the index (retrieval.topK = 6).
Only those passages were read, so this means "not found there", not "the documents contain nothing on this".
```

That sentence is the tool's own; no model text is shown when there is no
verified quote. It appears when the model found nothing in the passages, when
the model proposed an answer but none of its quotes could be verified (the
answer is withheld, and the output says so), and when the model returned no
usable response even after one retry. It is a statement about the passages that
were read, never a finding that the organization lacks something.

**Using the output.** In a terminal the answer is shown in a box, with long
lines wrapped to its width. Without one, the answer block goes to standard
output and the progress line to standard error, so the answer can be captured
on its own — which is also the way to copy a quote exactly:

```bash
node bin/csf-tool.js ask "How often are access rights reviewed?" \
  --embed-provider mock --llm-provider mock --work-dir ./output --quiet > answer.txt
```

The exit code is 0 whether or not there is an answer; it is non-zero only when
the command could not run (no index, no question, a provider that cannot be
reached).

**Limits.**

- One question, one answer. There is no conversation: a follow-up question does
  not see the previous one, and nothing is saved.
- Retrieval decides what the model sees. A question worded very differently from
  the documents may retrieve the wrong passages; rephrase it, or raise `--top-k`.
- With a cloud provider, the question and the retrieved passages are sent to it,
  exactly as in `analyze`. `--local` keeps everything on the machine, and
  redaction (Section 3) applies to `ask` as well.
- The experiments in [`eval/RESULTS.md`](../eval/RESULTS.md) measured the
  assessment. `ask` reuses the same verifier, but question answering was not
  part of those experiments.

<!-- Anchor of this section before v0.4, kept so that existing links to it still work. -->
<a id="10-strict-mode-freshness-and-resuming"></a>

## 12. Strict mode, freshness, and resuming

- **Strict mode** refuses to emit the final profile until every Subcategory is
  resolved by a human:

  ```bash
  node bin/csf-tool.js report --strict
  ```

  If anything is unreviewed/stale it stops with a list of what's blocking — by
  design, not a crash.

- **Freshness:** run `status` to distinguish a missing stage from an outdated
  one. A human review becomes stale when the decision-relevant assessment it
  validated changes, so it must be confirmed again. A generated report becomes
  stale when later ingest, analysis, review, or target activity is saved after
  that report, or when its saved review-state snapshot no longer matches the
  current decisions even if timestamps are equal. Re-run `review` or `report` as
  recommended; stale state is surfaced, never silently treated as current.
  Reports created before v0.2.1 intentionally require one regeneration to seed
  this exact freshness snapshot.

- **Resume / re-run:** stages persist to the work directory. `analyze` skips
  items already done under identical inputs; re-ingesting the same documents does
  **not** force a full re-analyze. Change a relevant setting (e.g. `--top-k`) or
  pass `--force` to recompute. Cached outcomes count toward the displayed
  progress, so a resumed run does not appear stuck.

- **Work directories ingested before v0.4:** the evidence-by-document report
  needs the list of documents that `ingest` now records. For an older work
  directory it reconstructs the list from the assessment and says so; chunk
  counts are missing, a document that was never retrieved cannot appear, and
  files that share a name cannot be detected. Run `ingest` again on the same
  documents, then `report`, to record the list. If the documents have not
  changed, the existing assessments and reviews stay valid — `analyze` reuses
  them — though the embeddings are computed again.

<!-- Anchor of this section before v0.4, kept so that existing links to it still work. -->
<a id="11-use-the-full-framework--your-own-csf-export"></a>

## 13. Use the full framework / your own CSF export

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
      "id": "GV.OC-01", "outcome": "The organizational mission is understood ...",
      "implementationExamples": ["Share the organization's mission ..."] }
  ]
}
```

`implementationExamples` is optional; when present, those texts become the
remediation plan's suggested actions for that outcome — and the checklists of
the evidence request list.

Crosswalks are joined to your core by Subcategory, Category, and Function id.
With a partial or custom core, relationships for elements that are not in the
assessment are left out, and `crosswalk.md` says how many ("Not shown: this
mapping also covers …").

### The crosswalk data

`data/csf-crosswalks.json` is generated by a script as well, from NIST's CSF 2.0
reference data service, and verified against the shipped Core before it is
written (needs network):

```bash
npm run build-crosswalks
```

Without network access, build from saved copies of the two responses:

```bash
node scripts/build-crosswalks.js --from-dir <dir> --retrieved-at 2026-11-13
```

`<dir>` must contain `nist-csf-elements.json` and `nist-csf-olirs.json` (the
header of `scripts/build-crosswalks.js` gives the two addresses to save them
from); the date is the day they were downloaded. `crosswalkPath` can point at
another build of this file. The loader accepts identifiers and provenance fields
only: it rejects anything else, including `title` or `text` fields and any link
that is not hosted on nist.gov.

### The Spanish text of the Core

`data/csf-core.es.json` holds the Spanish names and outcome statements of the
Functions, Categories, and Subcategories, taken verbatim from NIST CSWP 29 spa,
the official U.S. Government Spanish translation of CSF 2.0. Reports in Spanish
(Section 10) take the framework's text from it. It is display text only — the
assessment always runs on the English Core — and it has no Implementation
Examples, which NIST publishes in English only. To regenerate it (needs network
and `pdftotext`, from Poppler):

```bash
npm run build-csf-core-es
```

or, from a saved copy of the publication:

```bash
node scripts/build-csf-core-es.js --from-pdf <path-to-NIST.CSWP.29.spa.pdf>
```

The script cross-checks the extracted text against `data/csf-core.json` — the
same 6 Functions, 22 Categories, and 106 Subcategories, in the same order — and
writes nothing if they differ.

<!-- Anchor of this section before v0.4, kept so that existing links to it still work. -->
<a id="12-configuration-reference"></a>

## 14. Configuration reference

Precedence (low → high): built-in defaults < `csf-tool.config.json` < CLI flags.
Secrets/endpoints come only from `.env`. Run `csf-tool init` to scaffold a config.

| Key | Meaning | Default |
| --- | --- | --- |
| `csfCorePath` | CSF 2.0 core data file | `data/csf-core.json` |
| `crosswalkPath` | crosswalk data file (optional; reports omit crosswalks if absent) | `data/csf-crosswalks.json` |
| `docsPath` | folder or single file of documents | (asked / `--docs`) |
| `workDir` | where stage outputs are persisted | `./output` |
| `chunk.size` / `chunk.overlap` | chunk size / overlap, in characters | `1200` / `200` |
| `embeddings.provider` / `.model` | `openai` / `local-transformers` / `mock` | `openai` / (provider default) |
| `llm.provider` / `.model` | `openai` / `ollama` / `mock` | `openai` / (provider default) |
| `retrieval.topK` | chunks retrieved per Subcategory, and per `ask` question | `6` |
| `analysis.confidenceThreshold` | below this → auto-flag for review | `0.6` |
| `analysis.critique` | optional skeptical second pass | `false` |
| `analysis.strict` | refuse to emit until all reviewed | `false` |
| `review.showAll` | review everything, not just flagged | `false` |
| `report.crosswalks` | crosswalks included in reports: `null` = all except third-party mappings, a list of ids (`"all"` and `"default"` are accepted in the list), `[]` = none | `null` |
| `report.language` | language of the reports, the dashboard, and the `ask` answer: `en` / `es` (Section 10) | `en` |
| `privacy.redact` | replace identifiers with placeholders in text sent to providers that are not on this machine (Section 3) | `false` |
| `privacy.terms` | literal terms to replace as well, e.g. the organization's name | `[]` |

Useful flags: `--docs`, `--work-dir`, `--csf-core`, `--top-k`, `--threshold`,
`--embed-provider`, `--embed-model`, `--llm-provider`, `--llm-model`, `--local`,
`--critique` / `--no-critique`, `--all`, `--accept-all`, `--strict`, `--force`,
`--target-default`, `--target-import`, `--tier-current`, `--tier-target`,
`--crosswalk`, `--lang`, `--redact`, `--config`, `--verbose`, `--quiet`. Run
`--help` for the full list. (The target profile itself is not configuration — it is
assessment state, stored in `<work-dir>/target.json`; see Section 8.)

**Where paths are resolved.** Paths in the configuration and on the command
line are relative to the directory you run the tool from. The two built-in data
paths are the exception, so that the tool works from any directory:

1. a `data/csf-core.json` or `data/csf-crosswalks.json` that exists in the
   directory you are in is used — a file of your own always wins;
2. otherwise, and only while the setting still has its built-in default value,
   the copy shipped with the tool is used;
3. any other path is taken as written, so a mistyped custom path is reported as
   not found instead of being silently replaced by the shipped file.

`csf-tool init` follows the same idea for the `.env` template: it copies the one
shipped with the tool when the current directory has no `.env.example`, and
never overwrites an existing `.env`.

**The config file.** The tool reads `csf-tool.config.json` in the directory you
run it from, or the file named with `--config`. Having no `csf-tool.config.json`
is normal: the tool runs on its defaults and prints nothing about it. A file
that cannot be used is an error, and the run stops before a document is read
or anything is sent: a `--config` path that names no file (except for `init`,
which creates it), and a config file that is not valid JSON or does not hold a
JSON object. Before v0.4 the tool passed over these and ran on its defaults,
which are cloud-first.

**Invalid values.** Inside a valid file, a setting with an invalid value is
reset to its default, and an unknown key is ignored, each with a warning. The
`privacy` settings are the exception: an invalid, misspelled, or misplaced one
is an error, because its default would switch redaction off. The exception does
not reach the word `privacy` itself misspelled, which is an unknown key; see
"Confirm that it is on" in Section 3.

<!-- Anchor of this section before v0.4, kept so that existing links to it still work. -->
<a id="13-troubleshooting"></a>

## 15. Troubleshooting

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
- **"N item(s) are waiting for review, and this session is not interactive."** —
  `review` was run where it cannot ask anyone (a script, a pipe, CI), and it
  wrote nothing. Run it in a terminal. For a demo or an automated run in which
  nobody will look at the items, pass `--accept-all` explicitly; any item left
  outside the queue stays unreviewed and is marked as such in the reports.
  Before v0.4, `review` accepted its queue silently in this situation, so a
  script that relied on that needs `--accept-all` now.
- **"CSF core data file not found"** — `csfCorePath` (or `--csf-core`) names a
  file that does not exist. Fix the path, or remove the setting to use the Core
  shipped with the tool. (Before v0.4 this message also appeared whenever the
  tool was run outside its own repository folder; that no longer happens.)
- **"Config file "…" could not be read as JSON"** — the config file has a
  syntax error (a trailing comma, a missing quote), is empty, or is not a file.
  The text in parentheses is the JSON parser's own message. Fix the file. The
  tool stops instead of running on its defaults, because that would drop every
  setting in the file, including the choice of providers and redaction.
- **"Config file "…" must contain a JSON object"** — the file is valid JSON,
  but its top level is a list or a single value instead of `{ … }`. Put the
  settings in one object.
- **"Config file not found: …"** — the path given to `--config` names no file.
  Check the path; `csf-tool init --config <path>` creates a config file there.

Evidence reports, plan, and Tiers:

- **"Document list reconstructed from the assessment"** (in
  `evidence-by-document.md`) — the work directory was ingested by an earlier
  version. Run `ingest` again on the same documents, then `report`.
- **"N ingested files share the name …"** — evidence is recorded by file name,
  so the report counts those files in one row. Rename one of them and re-run
  `ingest` and `analyze` if you need them separated.
- **"The assessment is out of date with its inputs"** (in
  `evidence-by-document.md` or `evidence-requests.md`) — documents were ingested
  after the last analysis. Run `analyze`, then `review` and `report`.
- **`poam.csv` was not written, or disappeared** — it exists only while a target
  profile does. Run `csf-tool target`, then `report`.
- **"The target profile … is malformed — /plan/…"** — a plan entry has an
  unknown field, a `status` outside `open` / `in-progress` / `done` /
  `risk-accepted`, or a `due` that is not a real `YYYY-MM-DD` date. The message
  names the entry; fix it in `target.json`.
- **"must be a CSF Tier number (1, 2, 3 or 4) or null"** — `tiers.current` and
  `tiers.target` take the Tier number, not its name.
- **"Invalid config value at "/tierCurrent""** (or `/tierTarget`) — the value
  passed to `--tier-current` / `--tier-target` is not a whole number from 1 to 4.
  It was discarded; nothing was recorded for that side.

Crosswalks:

- **"Unknown crosswalk id(s) ignored"** — an id passed to `--crosswalk` or
  listed in `report.crosswalks` is not in the data file. The message lists the
  known ids; `csf-tool crosswalk` shows them with their frameworks.
- **The ISO/IEC 27001 or PCI DSS crosswalk is missing from my report** — those
  two are third-party mappings and are included only when asked for:
  `--crosswalk default,iso27001-2022`, or `--crosswalk all`.
- **"Crosswalk data file not found"** — the file named by `crosswalkPath` does
  not exist. Reports are still produced, without `crosswalk.md` and
  `crosswalk.csv`. Restore the file, set `crosswalkPath`, or pass
  `--crosswalk none` to silence the message.
- **"The crosswalk data file … is malformed"** — the file exists but does not
  match the expected shape, and `report` stops rather than write a partial set.
  Restore `data/csf-crosswalks.json` from the repository, run
  `npm run build-crosswalks`, or pass `--crosswalk none` to produce the reports
  without crosswalks.
- **A control I expected is not in the first table of a crosswalk** — the
  mapping may relate it only to a whole Category or Function; look in the second
  table, or filter `crosswalk.csv` on the `reference` column.
- **A reference identifier looks wrong in a spreadsheet (3.1 instead of 3.10)** —
  the spreadsheet converted `reference_id` to a number. Use the `reference`
  column (`cis-v8.1:3.10`), or import the file with `reference_id` set to text.
- **Searching the dashboard for `AC-02` also returns outcomes that do not list
  AC-02** — the search matches any text containing what you typed, so it also
  finds identifiers such as `IAC-02`. Expand the row to see which framework each
  identifier belongs to, or filter `crosswalk.csv` for an exact match.

Questions and redaction:

- **"No question was given."** — put the question, in quotes, after `ask`.
- **"The model proposed an answer, but … could not be verified verbatim, so the
  answer was withheld."** — the model answered, but its quotes are not in your
  documents, so the tool did not show the answer. That is the safeguard working.
  Ask in different words, or look in the documents.
- **"No verifiable evidence in the ingested documents answers this question."** —
  not an error: none of the passages retrieved for the question produced a
  quote that could be verified. Rephrase the question, or raise `--top-k`
  (Section 11).
- **`no matches found` from the shell when asking a question** — the question
  was not quoted, and the shell tried to expand its `?`. Quote it.
- **"The index was built with embedder "…+redact" but the current embedder is
  "…""** (or the reverse) — redaction was on for `ingest` and off for this
  command, or the reverse. Set `privacy.redact` in the config file so that every
  command uses the same setting, and run `ingest` again if you changed it.
- **"Redaction is on, but the index was built without it"** — run `ingest` again
  with redaction on. This is also what you see when only the reasoning provider
  is a cloud one: with redaction on, passages have to be cut so that no address
  or listed name is split.
- **"The list of terms to redact (privacy.terms) has changed since the index was
  built"** — run `ingest` again, so that passages are cut around the newly
  listed names too.
- **"Invalid privacy setting "…""** — a `privacy` setting in the config file is
  invalid, misspelled, or in the wrong place (for example `"redact": "true"`
  with quotes, or `terms` as a single string). The tool stops rather than run
  without redaction. Write `"privacy": { "redact": true, "terms": ["Name"] }`.
- **Redaction is set in the config file, but the run does not print "Redaction
  is on"** — unless `--quiet` hid the line, the settings were not read and the
  text was sent as written. Look in the output for
  `Unknown config key "…" ignored.` (the word `privacy` misspelled), and check
  that the command was run in the directory that holds `csf-tool.config.json`,
  or with `--config` (Section 3, "Confirm that it is on").
- **"privacy.terms: "…" is very short."** — a term is replaced wherever it
  appears, in any letter case and inside longer words; a term of fewer than four
  characters will also replace unrelated text. Use a longer, distinctive form.
- **Coverage dropped after turning redaction on** — a model that does not copy
  a placeholder exactly loses that quote, and an item left without a verified
  quote is downgraded to `none` and flagged for review. Review the flagged
  items; if it happens often with your model, redaction may not suit it.
- **"The Ollama host (…) is not this machine"** — `OLLAMA_HOST` is not a
  loopback address (`localhost`, `127.0.0.1`, `::1`), so the tool treats Ollama
  as remote: prompts are sent to that host over the network. Use `--redact`, or
  run Ollama on this machine and address it through a loopback address.

Reports in Spanish:

- **"Invalid config value at "/report/language""** — the language is `en` or
  `es`, in lower case in the config file (on the command line, `--lang ES` is
  accepted). The run continues in English.
- **The report is in Spanish but the rationales are in English** — the
  assessment was made before the language was set (`report --lang es` renders
  an existing assessment; it does not rewrite it), the model did not follow the
  instruction, or the `mock` provider is in use. To have the model asked to
  write them in Spanish, run `analyze --lang es`; note that this assesses every
  outcome again.
- **`analyze` assessed everything again after I set the language** — a Spanish
  analysis and an English one are different analyses, so one cannot reuse the
  other's results. Use `report --lang es` when you only want the deliverables in
  Spanish.
- **Some outcomes are in English in a Spanish report** — they are not NIST's
  official text (a tailored CSF Core), so NIST's translation does not apply to
  them. The Implementation Examples are always in English: NIST publishes them
  in English only.
