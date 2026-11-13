# NIST CSF 2.0 — Current Profile & Gap Analysis

> AI-assisted draft. Guiding principle: AI proposes, a human validates. Coverage judgments above "none" are anchored to quotes verified verbatim against the source evidence. CSF 2.0 Subcategory text is in the public domain (source: NIST CPRT).

> **DRAFT — not fully reviewed.** 1 unreviewed and 0 stale item(s) remain. A human must validate every item before this profile is authoritative.

## Overview

- Framework: NIST CSF 2.0 (CSF 2.0)
- Generated: 2026-01-01T00:00:00.000Z
- Providers: embeddings = `mock`, reasoning = `mock`
- CSF source: NIST CPRT — CSF 2.0 Core (public domain).
- Subcategories: 10 — gaps (none/partial): **1**
- Coverage: none 0, partial 1, substantial 4, full 5
- Review: reviewed 9, unreviewed 1, stale 0, overrides 0
- Quotes downgraded by the verifier: 0

## Coverage by Function

| Function | Total | None | Partial | Substantial | Full | % addressed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 3 | 0 | 0 | 2 | 1 | 100% |
| IDENTIFY | 1 | 0 | 0 | 0 | 1 | 100% |
| PROTECT | 3 | 0 | 0 | 2 | 1 | 100% |
| DETECT | 1 | 0 | 0 | 0 | 1 | 100% |
| RECOVER | 1 | 0 | 1 | 0 | 0 | 0% |
| CUSTOM | 1 | 0 | 0 | 0 | 1 | 100% |

## Current vs Target

Target baseline: **substantial**. Met **7/8** applicable outcomes (88%); unmet 1 (high 0, medium 1, low 0); out of scope 2.

CSF Tier — current: Tier 1 (Partial); target: not recorded. Selected by the organization and recorded in the target profile; not derived by this tool. Tier definitions: NIST Cybersecurity Framework (CSF) 2.0, NIST CSWP 29, Appendix B.

| Function | Applicable | Met | Unmet | Out of scope | % met |
| --- | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 3 | 3 | 0 | 0 | 100% |
| IDENTIFY | 1 | 1 | 0 | 0 | 100% |
| PROTECT | 3 | 3 | 0 | 0 | 100% |
| DETECT | 0 | 0 | 0 | 1 | 100% |
| RECOVER | 1 | 0 | 1 | 0 | 0% |
| CUSTOM | 0 | 0 | 0 | 1 | 100% |

See **remediation-plan.md** for the prioritized action plan that closes these gaps.

## Gaps and partial coverage (address these first)

### RECOVER

- **RC.RP-01** — _partial_ _(⚠ UNREVIEWED)_
  - Outcome: The recovery portion of the incident response plan is executed once initiated from the incident response process
  - Rationale: Rationale text RC.RP-01.
  - Evidence (policy.md): "Quoted evidence text RC.RP-01."

## Substantially or fully covered

### GOVERN

- **GV.OC-01** — _substantial_: The organizational mission is understood and informs cybersecurity risk management
  - Evidence (policy.md)
- **GV.OC-02** — _full_: Internal and external stakeholders are understood, and their needs and expectations regarding cybersecurity risk management are understood and considered
  - Evidence (policy.md)
- **GV.RM-01** — _substantial_: Risk management objectives are established and agreed to by organizational stakeholders
  - Evidence (policy.md)

### IDENTIFY

- **ID.AM-01** — _full_: Inventories of hardware managed by the organization are maintained
  - Evidence (retired-01.md)

### PROTECT

- **PR.AA-01** — _substantial_: Identities and credentials for authorized users, services, and hardware are managed by the organization
  - Evidence (retired-07.md)
- **PR.AA-05** — _full_: Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed, and incorporate the principles of least privilege and separation of duties
  - Evidence (policy.md)
- **PR.AA-06** — _substantial_: Physical access to assets is managed, monitored, and enforced commensurate with risk
  - Evidence (policy.md)

### DETECT

- **DE.CM-01** — _full_: Networks and network services are monitored to find potentially adverse events
  - Evidence (policy.md)

### CUSTOM

- **ZZ.CU-01** — _full_: A custom outcome that is not part of the published Core
  - Evidence (policy.md)

---

Every coverage level above "none" is supported by at least one quote that was checked verbatim against the retrieved source text; unverifiable quotes are removed and the item is downgraded. Items marked UNREVIEWED or STALE still require human validation.
