# NIST CSF 2.0 — Evidence by Document

> The reverse view of the assessment: for each of the organization's documents, the CSF 2.0 outcomes it is quoted for. Every quote counted here was verified verbatim against the document text. Coverage levels are those of the Current Profile (see gap-analysis.md): AI proposes, a human validates.

> **DRAFT — not fully reviewed.** 3 unreviewed and 1 stale item(s) remain. A human must validate every item before the coverage levels shown here are authoritative.

## Summary

- Generated: 2026-01-01T00:00:00.000Z
- Documents ingested: 7 files under 6 distinct file names (see the note below)
- Not ingested: 1 skipped (no extractable text), 2 failed to parse — these files are not part of the assessment and are not listed here
- Quoted at least once: 5
- Ingested but never quoted: 1
- In the assessment but not in the latest ingest record: 1 (see the note below)
- Outcomes with at least one verified quote: 7 of 10
- Verified quotes: 10
- Evidence concentration: the first 2 documents in the table below are together quoted for 4 of the 7 outcomes that have a quote — the point in the table at which half is first reached

> **Note.** 2 ingested files share the name `policy.md`: `a/policy.md`, `b/policy.md`. Evidence is recorded by file name, so their quotes and retrievals cannot be attributed to one file or another and are counted together in a single row.

> **Note.** 1 document appears in the assessment but not in the latest ingest record: `old-handbook.md`. The assessment was made against an earlier set of documents; re-run the analyze stage to bring it up to date.

## Documents

Ordered by the number of outcomes a document is quoted for, then by name. "Retrieved for" counts the outcomes for which at least one passage of the document was among those retrieved for the assessment; "Quoted for" counts the outcomes with at least one verified quote from it. The last four numeric columns break those outcomes down by their current coverage.

| Document | Chunks | Retrieved for | Quoted for | Verified quotes | None | Partial | Substantial | Full | Functions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `policy.md` | 5 | 10 | 3 | 4 | 1 | 1 | 0 | 1 | GOVERN, PROTECT, DETECT |
| `access-standard.pdf` | 4 | 1 | 1 | 2 | 0 | 1 | 0 | 0 | PROTECT |
| `asset-procedure.docx` | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | IDENTIFY |
| `old-handbook.md` | — | 1 | 1 | 1 | 0 | 0 | 1 | 0 | GOVERN |
| `risk-register.xlsx.md` | 2 | 1 | 1 | 1 | 0 | 1 | 0 | 0 | GOVERN |
| ``weird\|name `x`.md`` | 1 | 1 | 1 | 1 | 0 | 1 | 0 | 0 | CUSTOM |
| `unused-memo.txt` | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |

## What each document is quoted for

An outcome listed below with coverage "none" was set to that level by a reviewer: the quotes the assessment selected stay listed so the decision remains traceable.

### `policy.md`

- 2 ingested files share this name; their figures are combined (see the note above)
- Chunks indexed: 5
- Retrieved for: 10 of 10 outcomes
- Quoted for: 3 outcomes (4 verified quotes) in GOVERN, PROTECT, DETECT
- Current coverage of those outcomes: none 1, partial 1, substantial 0, full 1

- **GV.RM-01** — _partial_ _(⚠ UNREVIEWED)_ — 2 quotes: Risk management objectives are established and agreed to by organizational stakeholders
- **PR.AA-05** — _none_ _(reviewer override: partial → none)_ — 1 quote: Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed, and incorporate the principles of least privilege and separation of duties
- **DE.CM-01** — _full_ — 1 quote (p.3): Networks and network services are monitored to find potentially adverse events

### `access-standard.pdf`

- Chunks indexed: 4
- Retrieved for: 1 of 10 outcomes
- Quoted for: 1 outcome (2 verified quotes) in PROTECT
- Current coverage of those outcomes: none 0, partial 1, substantial 0, full 0

- **PR.AA-01** — _partial_ _(⚠ STALE REVIEW)_ — 2 quotes (p.2, p.5): Identities and credentials for authorized users, services, and hardware are managed by the organization

### `asset-procedure.docx`

- Chunks indexed: 1
- Retrieved for: 1 of 10 outcomes
- Quoted for: 1 outcome (1 verified quote) in IDENTIFY
- Current coverage of those outcomes: none 0, partial 0, substantial 1, full 0

- **ID.AM-01** — _substantial_ _(reviewer override: partial → substantial)_ — 1 quote: Inventories of hardware managed by the organization are maintained

### `old-handbook.md`

- Not in the latest ingest record (see the note above)
- Chunks indexed: not recorded
- Retrieved for: 1 of 10 outcomes
- Quoted for: 1 outcome (1 verified quote) in GOVERN
- Current coverage of those outcomes: none 0, partial 0, substantial 1, full 0

- **GV.OC-01** — _substantial_ — 1 quote: The organizational mission is understood and informs cybersecurity risk management

### `risk-register.xlsx.md`

- Chunks indexed: 2
- Retrieved for: 1 of 10 outcomes
- Quoted for: 1 outcome (1 verified quote) in GOVERN
- Current coverage of those outcomes: none 0, partial 1, substantial 0, full 0

- **GV.RM-01** — _partial_ _(⚠ UNREVIEWED)_ — 1 quote: Risk management objectives are established and agreed to by organizational stakeholders

### ``weird|name `x`.md``

- Chunks indexed: 1
- Retrieved for: 1 of 10 outcomes
- Quoted for: 1 outcome (1 verified quote) in CUSTOM
- Current coverage of those outcomes: none 0, partial 1, substantial 0, full 0

- **ZZ.CU-01** — _partial_ — 1 quote: A custom outcome that is not part of the published Core

## Ingested but never quoted

No passage from these documents was selected as verbatim evidence for a CSF 2.0 outcome in this assessment. That alone does not make a document irrelevant or without value: its content may be outside the scope of the framework, may duplicate what another document was quoted for, or may simply not have been among the passages retrieved for an outcome.

| Document | Chunks | Retrieved for |
| --- | ---: | ---: |
| `unused-memo.txt` | 1 | 0 |

---

Derived from the same Current Profile as gap-analysis.md and evidence-map.csv, which lists every quote with its text. Documents are identified by file name. Items marked UNREVIEWED or STALE still require human validation.
