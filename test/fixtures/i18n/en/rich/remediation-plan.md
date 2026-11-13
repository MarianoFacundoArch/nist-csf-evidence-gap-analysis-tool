# NIST CSF 2.0 — Remediation Plan (Current → Target)

> Targets, priorities, and out-of-scope decisions are human choices recorded in the target profile — no AI makes them. Suggested actions are the official NIST CSF 2.0 Implementation Examples (public domain, source: NIST CPRT): illustrative starting points, not an exhaustive or mandatory list.

> **DRAFT — not fully reviewed.** The current-coverage side of this plan contains 3 unreviewed and 1 stale item(s). A human must validate every item before this plan is authoritative.

## Overview

- Framework: NIST CSF 2.0 (CSF 2.0)
- Generated: 2026-01-01T00:00:00.000Z
- Target baseline: **substantial** for every outcome, plus any overrides recorded in the target profile
- Target description: Illustrative target profile; second line.
- CSF Tier — current: Tier 2 (Risk Informed); target: Tier 3 (Repeatable). Selected by the organization and recorded in the target profile; not derived by this tool. Tier definitions: NIST Cybersecurity Framework (CSF) 2.0, NIST CSWP 29, Appendix B.
- Tier note: Committee decision 2025-11.
- Applicable outcomes: 9 of 10 (1 scoped out as not-applicable)
- Target met: **3/9 (33%)** — unmet: **6** (high 1, medium 4, low 1)

## Current vs target by Function

| Function | Applicable | Met | Unmet | Out of scope | % met |
| --- | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 3 | 1 | 2 | 0 | 33% |
| IDENTIFY | 1 | 1 | 0 | 0 | 100% |
| PROTECT | 2 | 0 | 2 | 1 | 0% |
| DETECT | 1 | 1 | 0 | 0 | 100% |
| RECOVER | 1 | 0 | 1 | 0 | 0% |
| CUSTOM | 1 | 0 | 1 | 0 | 0% |

## Prioritized action plan

Ranked by remediation priority, then by distance from the target. Work the list top-down; each item lists what the outcome requires, where the assessment stands, and NIST's example actions.

### High priority (1)

#### 1. GV.OC-02 — none → substantial (2 levels to close)

- Function / Category: GOVERN / Organizational Context (GV.OC)
- Outcome: Internal and external stakeholders are understood, and their needs and expectations regarding cybersecurity risk management are understood and considered
- Assessment rationale: [Auto-downgraded: the claimed coverage had no verifiable verbatim quote in the retrieved evidence.] Rationale text GV.OC-02.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Identify relevant internal stakeholders and their cybersecurity-related expectations (e.g., performance and risk expectations of officers, directors, and advisors; cultural expectations of employees)
  2. Identify relevant external stakeholders and their cybersecurity-related expectations (e.g., privacy expectations of customers, business expectations of partnerships, compliance expectations of regulators, ethics expectations of society)

### Medium priority (4)

#### 2. PR.AA-05 — none → full (3 levels to close)

- Function / Category: PROTECT / Identity Management, Authentication, and Access Control (PR.AA)
- Outcome: Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed, and incorporate the principles of least privilege and separation of duties
- Assessment rationale: Rationale text PR.AA-05.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Review logical and physical access privileges periodically and whenever someone changes roles or leaves the organization, and promptly rescind privileges that are no longer needed
  2. Take attributes of the requester and the requested resource into account for authorization decisions (e.g., geolocation, day/time, requester endpoint's cyber health)

#### 3. PR.AA-01 — partial → full (2 levels to close) _(⚠ STALE REVIEW)_

- Function / Category: PROTECT / Identity Management, Authentication, and Access Control (PR.AA)
- Outcome: Identities and credentials for authorized users, services, and hardware are managed by the organization
- Assessment rationale: Rationale text PR.AA-01.
- Plan (recorded in the target profile): owner: IT Operations Lead; due: 2026-06-30; status: in-progress; milestones: Pilot; rollout Q3.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Initiate requests for new access or additional access for employees, contractors, and others, and track, review, and fulfill the requests, with permission from system or data owners when needed
  2. Issue, manage, and revoke cryptographic certificates and identity tokens, cryptographic keys (i.e., key management), and other credentials

#### 4. GV.RM-01 — partial → substantial (1 level to close) _(⚠ UNREVIEWED)_

- Function / Category: GOVERN / Risk Management Strategy (GV.RM)
- Outcome: Risk management objectives are established and agreed to by organizational stakeholders
- Assessment rationale: Rationale text GV.RM-01, line 1. - line 2 (list item look-alike) # line 3 (heading look-alike)
- Target note: Board request 2025-10.
- Plan (recorded in the target profile): owner: Chief Risk Officer
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Update near-term and long-term cybersecurity risk management objectives as part of annual strategic planning and when major changes occur
  2. Establish measurable objectives for cybersecurity risk management (e.g., manage the quality of user training, ensure adequate risk protection for industrial control systems)

#### 5. ZZ.CU-01 — partial → substantial (1 level to close)

- Function / Category: CUSTOM / Custom Controls
- Outcome: A custom outcome that is not part of the published Core
- Assessment rationale: Rationale text ZZ.CU-01.
- Suggested actions: (none provided by this CSF core export)

### Low priority (1)

#### 6. RC.RP-01 — none → substantial (2 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: RECOVER / Incident Recovery Plan Execution (RC.RP)
- Outcome: The recovery portion of the incident response plan is executed once initiated from the incident response process
- Assessment rationale: [Auto-downgraded: the claimed coverage had no verifiable verbatim quote in the retrieved evidence.] Rationale text RC.RP-01.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Begin recovery procedures during or after incident response processes
  2. Make all individuals with recovery responsibilities aware of the plans for recovery and the authorizations required to implement each aspect of the plans

## At or above target (3)

### GOVERN

- **GV.OC-01** — substantial (target: substantial)

### IDENTIFY

- **ID.AM-01** — substantial (target: substantial)

### DETECT

- **DE.CM-01** — full (target: substantial)

## Out of scope — not-applicable (1)

Marked not-applicable in the target profile; excluded from the met/unmet figures above.

- **PR.AA-06** — Physical access to assets is managed, monitored, and enforced commensurate with risk _(reason: Remote organization; registered address solely.)_

---

The current-coverage side of this plan comes from the reviewed assessment (see gap-analysis.md and current-profile.json); every coverage level above "none" is anchored to quotes verified verbatim against the source documents. Items marked UNREVIEWED or STALE still require human validation.
