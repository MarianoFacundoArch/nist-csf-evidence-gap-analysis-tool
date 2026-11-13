# NIST CSF 2.0 — Current Profile & Gap Analysis

> AI-assisted draft. Guiding principle: AI proposes, a human validates. Coverage judgments above "none" are anchored to quotes verified verbatim against the source evidence. CSF 2.0 Subcategory text is in the public domain (source: NIST CPRT).

> **DRAFT — not fully reviewed.** 3 unreviewed and 1 stale item(s) remain. A human must validate every item before this profile is authoritative.

## Overview

- Framework: NIST CSF 2.0 (CSF 2.0)
- Generated: 2026-01-01T00:00:00.000Z
- Providers: embeddings = `mock`, reasoning = `mock`
- CSF source: NIST CPRT — CSF 2.0 Core (public domain).
- Subcategories: 10 — gaps (none/partial): **7**
- Coverage: none 4, partial 3, substantial 2, full 1
- Review: reviewed 6, unreviewed 3, stale 1, overrides 2
- Quotes downgraded by the verifier: 2

## Coverage by Function

| Function | Total | None | Partial | Substantial | Full | % addressed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 3 | 1 | 1 | 1 | 0 | 33% |
| IDENTIFY | 1 | 0 | 0 | 1 | 0 | 100% |
| PROTECT | 3 | 2 | 1 | 0 | 0 | 0% |
| DETECT | 1 | 0 | 0 | 0 | 1 | 100% |
| RECOVER | 1 | 1 | 0 | 0 | 0 | 0% |
| CUSTOM | 1 | 0 | 1 | 0 | 0 | 0% |

## Current vs Target

Target baseline: **substantial**. Met **3/9** applicable outcomes (33%); unmet 6 (high 1, medium 4, low 1); out of scope 1.

CSF Tier — current: Tier 2 (Risk Informed); target: Tier 3 (Repeatable). Selected by the organization and recorded in the target profile; not derived by this tool. Tier definitions: NIST Cybersecurity Framework (CSF) 2.0, NIST CSWP 29, Appendix B.

Tier note: Committee decision 2025-11.

| Function | Applicable | Met | Unmet | Out of scope | % met |
| --- | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 3 | 1 | 2 | 0 | 33% |
| IDENTIFY | 1 | 1 | 0 | 0 | 100% |
| PROTECT | 2 | 0 | 2 | 1 | 0% |
| DETECT | 1 | 1 | 0 | 0 | 100% |
| RECOVER | 1 | 0 | 1 | 0 | 0% |
| CUSTOM | 1 | 0 | 1 | 0 | 0% |

See **remediation-plan.md** for the prioritized action plan that closes these gaps.

## Gaps and partial coverage (address these first)

### GOVERN

- **GV.OC-02** — _none_ _(verifier downgraded (unverifiable quote removed))_
  - Outcome: Internal and external stakeholders are understood, and their needs and expectations regarding cybersecurity risk management are understood and considered
  - Rationale: [Auto-downgraded: the claimed coverage had no verifiable verbatim quote in the retrieved evidence.] Rationale text GV.OC-02.
  - Reviewer note: Manual evidence check pending.
- **GV.RM-01** — _partial_ _(⚠ UNREVIEWED)_
  - Outcome: Risk management objectives are established and agreed to by organizational stakeholders
  - Rationale: Rationale text GV.RM-01, line 1. - line 2 (list item look-alike) # line 3 (heading look-alike)
  - Evidence (risk-register.xlsx.md): "Quoted evidence text GV.RM-01 (1)."
  - Evidence (policy.md): "Quoted evidence text GV.RM-01 (2): sensor 01 online; sensor 02 online; sensor 03 online; sensor 04 online; sensor 05 online; sensor 06 online; sensor 07 online; sensor 08 online; sensor 09 online; sensor 10 online; sensor 11 online; sensor 12 online; sensor 13 online; sensor 14 online; sensor 15 onl…"
  - Evidence (policy.md): "Quoted evidence text GV.RM-01 (3)."

### PROTECT

- **PR.AA-05** — _none_ _(reviewer override: partial → none)_
  - Outcome: Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed, and incorporate the principles of least privilege and separation of duties
  - Rationale: Rationale text PR.AA-05.
  - Evidence (policy.md): "Quoted evidence text PR.AA-05."
  - Reviewer note: Policy superseded 2025-11.
- **PR.AA-06** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: Physical access to assets is managed, monitored, and enforced commensurate with risk
  - Rationale: Rationale text PR.AA-06.
- **PR.AA-01** — _partial_ _(⚠ STALE REVIEW)_
  - Outcome: Identities and credentials for authorized users, services, and hardware are managed by the organization
  - Rationale: Rationale text PR.AA-01.
  - Evidence (access-standard.pdf, p.2): "Quoted evidence text PR.AA-01 (1)."
  - Evidence (access-standard.pdf, p.5): "Quoted evidence text PR.AA-01 (2)."
  - Reviewer note: Minutes requested.

### RECOVER

- **RC.RP-01** — _none_ _(⚠ UNREVIEWED; verifier downgraded (unverifiable quote removed))_
  - Outcome: The recovery portion of the incident response plan is executed once initiated from the incident response process
  - Rationale: [Auto-downgraded: the claimed coverage had no verifiable verbatim quote in the retrieved evidence.] Rationale text RC.RP-01.

### CUSTOM

- **ZZ.CU-01** — _partial_
  - Outcome: A custom outcome that is not part of the published Core
  - Rationale: Rationale text ZZ.CU-01.
  - Evidence (weird|name `x`.md): "Quoted evidence text ZZ.CU-01."

## Substantially or fully covered

### GOVERN

- **GV.OC-01** — _substantial_: The organizational mission is understood and informs cybersecurity risk management
  - Evidence (old-handbook.md)

### IDENTIFY

- **ID.AM-01** — _substantial_ _(reviewer override: partial → substantial)_: Inventories of hardware managed by the organization are maintained
  - Evidence (asset-procedure.docx)

### DETECT

- **DE.CM-01** — _full_: Networks and network services are monitored to find potentially adverse events
  - Evidence (policy.md, p.3)

---

Every coverage level above "none" is supported by at least one quote that was checked verbatim against the retrieved source text; unverifiable quotes are removed and the item is downgraded. Items marked UNREVIEWED or STALE still require human validation.
