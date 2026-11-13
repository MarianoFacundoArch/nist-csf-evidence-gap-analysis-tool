# NIST CSF 2.0 — Remediation Plan (Current → Target)

> Targets, priorities, and out-of-scope decisions are human choices recorded in the target profile — no AI makes them. Suggested actions are the official NIST CSF 2.0 Implementation Examples (public domain, source: NIST CPRT): illustrative starting points, not an exhaustive or mandatory list.

> **DRAFT — not fully reviewed.** The current-coverage side of this plan contains 1 unreviewed and 0 stale item(s). A human must validate every item before this plan is authoritative.

## Overview

- Framework: NIST CSF 2.0 (CSF 2.0)
- Generated: 2026-01-01T00:00:00.000Z
- Target baseline: **substantial** for every outcome, plus any overrides recorded in the target profile
- CSF Tier — current: Tier 1 (Partial); target: not recorded. Selected by the organization and recorded in the target profile; not derived by this tool. Tier definitions: NIST Cybersecurity Framework (CSF) 2.0, NIST CSWP 29, Appendix B.
- Applicable outcomes: 8 of 10 (2 scoped out as not-applicable)
- Target met: **7/8 (88%)** — unmet: **1** (high 0, medium 1, low 0)

## Current vs target by Function

| Function | Applicable | Met | Unmet | Out of scope | % met |
| --- | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 3 | 3 | 0 | 0 | 100% |
| IDENTIFY | 1 | 1 | 0 | 0 | 100% |
| PROTECT | 3 | 3 | 0 | 0 | 100% |
| DETECT | 0 | 0 | 0 | 1 | 100% |
| RECOVER | 1 | 0 | 1 | 0 | 0% |
| CUSTOM | 0 | 0 | 0 | 1 | 100% |

## Prioritized action plan

Ranked by remediation priority, then by distance from the target. Work the list top-down; each item lists what the outcome requires, where the assessment stands, and NIST's example actions.

### Medium priority (1)

#### 1. RC.RP-01 — partial → substantial (1 level to close) _(⚠ UNREVIEWED)_

- Function / Category: RECOVER / Incident Recovery Plan Execution (RC.RP)
- Outcome: The recovery portion of the incident response plan is executed once initiated from the incident response process
- Assessment rationale: Rationale text RC.RP-01.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Begin recovery procedures during or after incident response processes
  2. Make all individuals with recovery responsibilities aware of the plans for recovery and the authorizations required to implement each aspect of the plans

## At or above target (7)

### GOVERN

- **GV.OC-01** — substantial (target: substantial)
- **GV.OC-02** — full (target: substantial)
- **GV.RM-01** — substantial (target: substantial)

### IDENTIFY

- **ID.AM-01** — full (target: substantial)

### PROTECT

- **PR.AA-01** — substantial (target: substantial)
- **PR.AA-05** — full (target: substantial)
- **PR.AA-06** — substantial (target: substantial)

## Out of scope — not-applicable (2)

Marked not-applicable in the target profile; excluded from the met/unmet figures above.

- **DE.CM-01** — Networks and network services are monitored to find potentially adverse events
- **ZZ.CU-01** — A custom outcome that is not part of the published Core

---

The current-coverage side of this plan comes from the reviewed assessment (see gap-analysis.md and current-profile.json); every coverage level above "none" is anchored to quotes verified verbatim against the source documents. Items marked UNREVIEWED or STALE still require human validation.
