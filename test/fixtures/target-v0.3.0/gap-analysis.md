# NIST CSF 2.0 — Current Profile & Gap Analysis

> AI-assisted draft. Guiding principle: AI proposes, a human validates. Coverage judgments above "none" are anchored to quotes verified verbatim against the source evidence. CSF 2.0 Subcategory text is in the public domain (source: NIST CPRT).

> **DRAFT — not fully reviewed.** 3 unreviewed and 1 stale item(s) remain. A human must validate every item before this profile is authoritative.

## Overview

- Framework: NIST CSF 2.0 (CSF 2.0)
- Generated: 2026-01-01T00:00:00.000Z
- Providers: embeddings = `mock`, reasoning = `mock`
- CSF source: NIST CPRT — CSF 2.0 Core (public domain).
- Subcategories: 7 — gaps (none/partial): **5**
- Coverage: none 3, partial 2, substantial 2, full 0
- Review: reviewed 3, unreviewed 3, stale 1, overrides 1
- Quotes downgraded by the verifier: 1

## Coverage by Function

| Function | Total | None | Partial | Substantial | Full | % addressed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 2 | 1 | 0 | 1 | 0 | 50% |
| IDENTIFY | 1 | 0 | 0 | 1 | 0 | 100% |
| PROTECT | 3 | 2 | 1 | 0 | 0 | 0% |
| RECOVER | 1 | 0 | 1 | 0 | 0 | 0% |

## Current vs Target

Target baseline: **substantial**. Met **2/6** applicable outcomes (33%); unmet 4 (high 1, medium 2, low 1); out of scope 1.

| Function | Applicable | Met | Unmet | Out of scope | % met |
| --- | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 2 | 1 | 1 | 0 | 50% |
| IDENTIFY | 1 | 1 | 0 | 0 | 100% |
| PROTECT | 2 | 0 | 2 | 1 | 0% |
| RECOVER | 1 | 0 | 1 | 0 | 0% |

See **remediation-plan.md** for the prioritized action plan that closes these gaps.

## Gaps and partial coverage (address these first)

### GOVERN

- **GV.OC-02** — _none_ _(⚠ UNREVIEWED; verifier downgraded (unverifiable quote removed))_
  - Outcome: Stakeholders understood
  - Rationale: rationale for GV.OC-02

### PROTECT

- **PR.AA-05** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: Access enforced
  - Rationale: rationale for PR.AA-05
- **PR.AA-06** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: Physical access managed
  - Rationale: rationale for PR.AA-06
- **PR.AA-01** — _partial_
  - Outcome: Identities managed
  - Rationale: rationale for PR.AA-01
  - Evidence (access-standard.pdf, p.2): "evidence quote for PR.AA-01"
  - Reviewer note: Quarterly access review minutes requested.

### RECOVER

- **RC.RP-01** — _partial_ _(⚠ STALE REVIEW)_
  - Outcome: Recovery plan executed
  - Rationale: rationale for RC.RP-01
  - Evidence (policy.md): "evidence quote for RC.RP-01"

## Substantially or fully covered

### GOVERN

- **GV.OC-01** — _substantial_: Mission understood
  - Evidence (policy.md)

### IDENTIFY

- **ID.AM-01** — _substantial_ _(reviewer override: partial → substantial)_: Hardware inventoried
  - Evidence (asset-procedure.docx)

---

Every coverage level above "none" is supported by at least one quote that was checked verbatim against the retrieved source text; unverifiable quotes are removed and the item is downgraded. Items marked UNREVIEWED or STALE still require human validation.
