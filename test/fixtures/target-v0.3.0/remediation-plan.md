# NIST CSF 2.0 — Remediation Plan (Current → Target)

> Targets, priorities, and out-of-scope decisions are human choices recorded in the target profile — no AI makes them. Suggested actions are the official NIST CSF 2.0 Implementation Examples (public domain, source: NIST CPRT): illustrative starting points, not an exhaustive or mandatory list.

> **DRAFT — not fully reviewed.** The current-coverage side of this plan contains 3 unreviewed and 1 stale item(s). A human must validate every item before this plan is authoritative.

## Overview

- Framework: NIST CSF 2.0 (CSF 2.0)
- Generated: 2026-01-01T00:00:00.000Z
- Target baseline: **substantial** for every outcome, plus any overrides recorded in the target profile
- Target description: Fixture target profile in the shape v0.3.0 wrote: no plan, no tiers.
- Applicable outcomes: 6 of 7 (1 scoped out as not-applicable)
- Target met: **2/6 (33%)** — unmet: **4** (high 1, medium 2, low 1)

## Current vs target by Function

| Function | Applicable | Met | Unmet | Out of scope | % met |
| --- | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 2 | 1 | 1 | 0 | 50% |
| IDENTIFY | 1 | 1 | 0 | 0 | 100% |
| PROTECT | 2 | 0 | 2 | 1 | 0% |
| RECOVER | 1 | 0 | 1 | 0 | 0% |

## Prioritized action plan

Ranked by remediation priority, then by distance from the target. Work the list top-down; each item lists what the outcome requires, where the assessment stands, and NIST's example actions.

### High priority (1)

#### 1. GV.OC-02 — none → substantial (2 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: GOVERN / Organizational Context (GV.OC)
- Outcome: Stakeholders understood
- Assessment rationale: rationale for GV.OC-02
- Target note: Stakeholder register is the first deliverable this quarter.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Identify stakeholders
  2. Review expectations yearly

### Medium priority (2)

#### 2. PR.AA-06 — none → full (3 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: PROTECT / Identity Management (PR.AA)
- Outcome: Physical access managed
- Assessment rationale: rationale for PR.AA-06
- Suggested actions: (none provided by this CSF core export)

#### 3. PR.AA-01 — partial → full (2 levels to close)

- Function / Category: PROTECT / Identity Management (PR.AA)
- Outcome: Identities managed
- Assessment rationale: rationale for PR.AA-01
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Maintain identity inventory

### Low priority (1)

#### 4. RC.RP-01 — partial → substantial (1 level to close) _(⚠ STALE REVIEW)_

- Function / Category: RECOVER / Incident Recovery Plan Execution (RC.RP)
- Outcome: Recovery plan executed
- Assessment rationale: rationale for RC.RP-01
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Begin recovery procedures

## At or above target (2)

### GOVERN

- **GV.OC-01** — substantial (target: substantial)

### IDENTIFY

- **ID.AM-01** — substantial (target: substantial)

## Out of scope — not-applicable (1)

Marked not-applicable in the target profile; excluded from the met/unmet figures above.

- **PR.AA-05** — Access enforced _(reason: No OT systems in scope.)_

---

The current-coverage side of this plan comes from the reviewed assessment (see gap-analysis.md and current-profile.json); every coverage level above "none" is anchored to quotes verified verbatim against the source documents. Items marked UNREVIEWED or STALE still require human validation.
