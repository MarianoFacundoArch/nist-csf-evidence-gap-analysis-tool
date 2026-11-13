# NIST CSF 2.0 — Current Profile & Gap Analysis

> AI-assisted draft. Guiding principle: AI proposes, a human validates. Coverage judgments above "none" are anchored to quotes verified verbatim against the source evidence. CSF 2.0 Subcategory text is in the public domain (source: NIST CPRT).

> **DRAFT — not fully reviewed.** 10 unreviewed and 0 stale item(s) remain. A human must validate every item before this profile is authoritative.

## Overview

- Framework: NIST CSF 2.0 (CSF 2.0)
- Generated: 2026-01-01T00:00:00.000Z
- Providers: embeddings = `mock`, reasoning = `mock`
- CSF source: PARTIAL CSF subset in use — replace with the full NIST CPRT export.
- Subcategories: 10 — gaps (none/partial): **10**
- Coverage: none 10, partial 0, substantial 0, full 0
- Review: reviewed 0, unreviewed 10, stale 0, overrides 0
- Quotes downgraded by the verifier: 0

## Coverage by Function

| Function | Total | None | Partial | Substantial | Full | % addressed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 3 | 3 | 0 | 0 | 0 | 0% |
| IDENTIFY | 1 | 1 | 0 | 0 | 0 | 0% |
| PROTECT | 3 | 3 | 0 | 0 | 0 | 0% |
| DETECT | 1 | 1 | 0 | 0 | 0 | 0% |
| RECOVER | 1 | 1 | 0 | 0 | 0 | 0% |
| CUSTOM | 1 | 1 | 0 | 0 | 0 | 0% |

## Current vs Target

Target baseline: **full**. Met **0/10** applicable outcomes (0%); unmet 10 (high 0, medium 10, low 0).

CSF Tier — current: not recorded; target: Tier 4 (Adaptive). Selected by the organization and recorded in the target profile; not derived by this tool. Tier definitions: NIST Cybersecurity Framework (CSF) 2.0, NIST CSWP 29, Appendix B.

| Function | Applicable | Met | Unmet | Out of scope | % met |
| --- | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 3 | 0 | 3 | 0 | 0% |
| IDENTIFY | 1 | 0 | 1 | 0 | 0% |
| PROTECT | 3 | 0 | 3 | 0 | 0% |
| DETECT | 1 | 0 | 1 | 0 | 0% |
| RECOVER | 1 | 0 | 1 | 0 | 0% |
| CUSTOM | 1 | 0 | 1 | 0 | 0% |

See **remediation-plan.md** for the prioritized action plan that closes these gaps.

## Gaps and partial coverage (address these first)

### GOVERN

- **GV.OC-01** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: The organizational mission is understood and informs cybersecurity risk management
  - Rationale: Automated fallback: provider timeout 504
- **GV.OC-02** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: Internal and external stakeholders are understood, and their needs and expectations regarding cybersecurity risk management are understood and considered
  - Rationale: Automated fallback: no evidence retrieved from the corpus.
- **GV.RM-01** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: Risk management objectives are established and agreed to by organizational stakeholders
  - Rationale: Automated fallback: model output failed schema validation after one retry.

### IDENTIFY

- **ID.AM-01** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: Inventories of hardware managed by the organization are maintained
  - Rationale: No assessment was produced for this subcategory.

### PROTECT

- **PR.AA-01** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: Identities and credentials for authorized users, services, and hardware are managed by the organization
  - Rationale: No assessment was produced for this subcategory.
- **PR.AA-05** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed, and incorporate the principles of least privilege and separation of duties
  - Rationale: No assessment was produced for this subcategory.
- **PR.AA-06** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: Physical access to assets is managed, monitored, and enforced commensurate with risk
  - Rationale: No assessment was produced for this subcategory.

### DETECT

- **DE.CM-01** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: Networks and network services are monitored to find potentially adverse events
  - Rationale: No assessment was produced for this subcategory.

### RECOVER

- **RC.RP-01** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: The recovery portion of the incident response plan is executed once initiated from the incident response process
  - Rationale: No assessment was produced for this subcategory.

### CUSTOM

- **ZZ.CU-01** — _none_ _(⚠ UNREVIEWED)_
  - Outcome: A custom outcome that is not part of the published Core
  - Rationale: No assessment was produced for this subcategory.

## Substantially or fully covered

_No subcategories are substantially or fully covered yet._

---

Every coverage level above "none" is supported by at least one quote that was checked verbatim against the retrieved source text; unverifiable quotes are removed and the item is downgraded. Items marked UNREVIEWED or STALE still require human validation.
