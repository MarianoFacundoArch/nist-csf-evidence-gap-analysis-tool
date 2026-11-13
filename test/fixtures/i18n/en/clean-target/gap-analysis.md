# NIST CSF 2.0 — Current Profile & Gap Analysis

> AI-assisted draft. Guiding principle: AI proposes, a human validates. Coverage judgments above "none" are anchored to quotes verified verbatim against the source evidence. CSF 2.0 Subcategory text is in the public domain (source: NIST CPRT).

## Overview

- Framework: NIST CSF 2.0 (CSF 2.0)
- Generated: 2026-01-01T00:00:00.000Z
- Providers: embeddings = `mock`, reasoning = `mock`
- CSF source: NIST CPRT — CSF 2.0 Core (public domain).
- Subcategories: 10 — gaps (none/partial): **0**
- Coverage: none 0, partial 0, substantial 5, full 5
- Review: reviewed 10, unreviewed 0, stale 0, overrides 0
- Quotes downgraded by the verifier: 0

## Coverage by Function

| Function | Total | None | Partial | Substantial | Full | % addressed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 3 | 0 | 0 | 2 | 1 | 100% |
| IDENTIFY | 1 | 0 | 0 | 0 | 1 | 100% |
| PROTECT | 3 | 0 | 0 | 2 | 1 | 100% |
| DETECT | 1 | 0 | 0 | 0 | 1 | 100% |
| RECOVER | 1 | 0 | 0 | 1 | 0 | 100% |
| CUSTOM | 1 | 0 | 0 | 0 | 1 | 100% |

## Current vs Target

Target baseline: **partial**. Met **10/10** applicable outcomes (100%); unmet 0 (high 0, medium 0, low 0).

| Function | Applicable | Met | Unmet | Out of scope | % met |
| --- | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 3 | 3 | 0 | 0 | 100% |
| IDENTIFY | 1 | 1 | 0 | 0 | 100% |
| PROTECT | 3 | 3 | 0 | 0 | 100% |
| DETECT | 1 | 1 | 0 | 0 | 100% |
| RECOVER | 1 | 1 | 0 | 0 | 100% |
| CUSTOM | 1 | 1 | 0 | 0 | 100% |

See **remediation-plan.md** for the prioritized action plan that closes these gaps.

## Gaps and partial coverage (address these first)

_No gaps — every subcategory is at least substantially covered._

## Substantially or fully covered

### GOVERN

- **GV.OC-01** — _substantial_: The organizational mission is understood and informs cybersecurity risk management
  - Evidence (policy.md, p.4)
- **GV.OC-02** — _full_: Internal and external stakeholders are understood, and their needs and expectations regarding cybersecurity risk management are understood and considered
  - Evidence (policy.md)
- **GV.RM-01** — _substantial_: Risk management objectives are established and agreed to by organizational stakeholders
  - Evidence (policy.md)

### IDENTIFY

- **ID.AM-01** — _full_: Inventories of hardware managed by the organization are maintained
  - Evidence (policy.md)

### PROTECT

- **PR.AA-01** — _substantial_: Identities and credentials for authorized users, services, and hardware are managed by the organization
  - Evidence (policy.md)
- **PR.AA-05** — _full_: Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed, and incorporate the principles of least privilege and separation of duties
  - Evidence (policy.md)
- **PR.AA-06** — _substantial_: Physical access to assets is managed, monitored, and enforced commensurate with risk
  - Evidence (policy.md)

### DETECT

- **DE.CM-01** — _full_: Networks and network services are monitored to find potentially adverse events
  - Evidence (policy.md)

### RECOVER

- **RC.RP-01** — _substantial_: The recovery portion of the incident response plan is executed once initiated from the incident response process
  - Evidence (policy.md)

### CUSTOM

- **ZZ.CU-01** — _full_: A custom outcome that is not part of the published Core
  - Evidence (annex.md)

---

Every coverage level above "none" is supported by at least one quote that was checked verbatim against the retrieved source text; unverifiable quotes are removed and the item is downgraded. Items marked UNREVIEWED or STALE still require human validation.
