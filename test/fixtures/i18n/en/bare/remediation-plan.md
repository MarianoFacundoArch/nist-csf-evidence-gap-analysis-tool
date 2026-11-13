# NIST CSF 2.0 — Remediation Plan (Current → Target)

> Targets, priorities, and out-of-scope decisions are human choices recorded in the target profile — no AI makes them. Suggested actions are the official NIST CSF 2.0 Implementation Examples (public domain, source: NIST CPRT): illustrative starting points, not an exhaustive or mandatory list.

> **DRAFT — not fully reviewed.** The current-coverage side of this plan contains 10 unreviewed and 0 stale item(s). A human must validate every item before this plan is authoritative.

## Overview

- Framework: NIST CSF 2.0 (CSF 2.0)
- Generated: 2026-01-01T00:00:00.000Z
- Target baseline: **full** for every outcome, plus any overrides recorded in the target profile
- CSF Tier — current: not recorded; target: Tier 4 (Adaptive). Selected by the organization and recorded in the target profile; not derived by this tool. Tier definitions: NIST Cybersecurity Framework (CSF) 2.0, NIST CSWP 29, Appendix B.
- Applicable outcomes: 10 of 10
- Target met: **0/10 (0%)** — unmet: **10** (high 0, medium 10, low 0)

## Current vs target by Function

| Function | Applicable | Met | Unmet | Out of scope | % met |
| --- | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 3 | 0 | 3 | 0 | 0% |
| IDENTIFY | 1 | 0 | 1 | 0 | 0% |
| PROTECT | 3 | 0 | 3 | 0 | 0% |
| DETECT | 1 | 0 | 1 | 0 | 0% |
| RECOVER | 1 | 0 | 1 | 0 | 0% |
| CUSTOM | 1 | 0 | 1 | 0 | 0% |

## Prioritized action plan

Ranked by remediation priority, then by distance from the target. Work the list top-down; each item lists what the outcome requires, where the assessment stands, and NIST's example actions.

### Medium priority (10)

#### 1. GV.OC-01 — none → full (3 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: GOVERN / Organizational Context (GV.OC)
- Outcome: The organizational mission is understood and informs cybersecurity risk management
- Assessment rationale: Automated fallback: provider timeout 504
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Share the organization's mission (e.g., through vision and mission statements, marketing, and service strategies) to provide a basis for identifying risks that may impede that mission

#### 2. GV.OC-02 — none → full (3 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: GOVERN / Organizational Context (GV.OC)
- Outcome: Internal and external stakeholders are understood, and their needs and expectations regarding cybersecurity risk management are understood and considered
- Assessment rationale: Automated fallback: no evidence retrieved from the corpus.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Identify relevant internal stakeholders and their cybersecurity-related expectations (e.g., performance and risk expectations of officers, directors, and advisors; cultural expectations of employees)
  2. Identify relevant external stakeholders and their cybersecurity-related expectations (e.g., privacy expectations of customers, business expectations of partnerships, compliance expectations of regulators, ethics expectations of society)

#### 3. GV.RM-01 — none → full (3 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: GOVERN / Risk Management Strategy (GV.RM)
- Outcome: Risk management objectives are established and agreed to by organizational stakeholders
- Assessment rationale: Automated fallback: model output failed schema validation after one retry.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Update near-term and long-term cybersecurity risk management objectives as part of annual strategic planning and when major changes occur
  2. Establish measurable objectives for cybersecurity risk management (e.g., manage the quality of user training, ensure adequate risk protection for industrial control systems)

#### 4. ID.AM-01 — none → full (3 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: IDENTIFY / Asset Management (ID.AM)
- Outcome: Inventories of hardware managed by the organization are maintained
- Assessment rationale: No assessment was produced for this subcategory.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Maintain inventories for all types of hardware, including IT, IoT, OT, and mobile devices
  2. Constantly monitor networks to detect new hardware and automatically update inventories

#### 5. PR.AA-01 — none → full (3 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: PROTECT / Identity Management, Authentication, and Access Control (PR.AA)
- Outcome: Identities and credentials for authorized users, services, and hardware are managed by the organization
- Assessment rationale: No assessment was produced for this subcategory.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Initiate requests for new access or additional access for employees, contractors, and others, and track, review, and fulfill the requests, with permission from system or data owners when needed
  2. Issue, manage, and revoke cryptographic certificates and identity tokens, cryptographic keys (i.e., key management), and other credentials

#### 6. PR.AA-05 — none → full (3 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: PROTECT / Identity Management, Authentication, and Access Control (PR.AA)
- Outcome: Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed, and incorporate the principles of least privilege and separation of duties
- Assessment rationale: No assessment was produced for this subcategory.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Review logical and physical access privileges periodically and whenever someone changes roles or leaves the organization, and promptly rescind privileges that are no longer needed
  2. Take attributes of the requester and the requested resource into account for authorization decisions (e.g., geolocation, day/time, requester endpoint's cyber health)

#### 7. PR.AA-06 — none → full (3 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: PROTECT / Identity Management, Authentication, and Access Control (PR.AA)
- Outcome: Physical access to assets is managed, monitored, and enforced commensurate with risk
- Assessment rationale: No assessment was produced for this subcategory.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Use security guards, security cameras, locked entrances, alarm systems, and other physical controls to monitor facilities and restrict access
  2. Employ additional physical security controls for areas that contain high-risk assets

#### 8. DE.CM-01 — none → full (3 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: DETECT / Continuous Monitoring (DE.CM)
- Outcome: Networks and network services are monitored to find potentially adverse events
- Assessment rationale: No assessment was produced for this subcategory.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Monitor DNS, BGP, and other network services for adverse events
  2. Monitor wired and wireless networks for connections from unauthorized endpoints

#### 9. RC.RP-01 — none → full (3 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: RECOVER / Incident Recovery Plan Execution (RC.RP)
- Outcome: The recovery portion of the incident response plan is executed once initiated from the incident response process
- Assessment rationale: No assessment was produced for this subcategory.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Begin recovery procedures during or after incident response processes
  2. Make all individuals with recovery responsibilities aware of the plans for recovery and the authorizations required to implement each aspect of the plans

#### 10. ZZ.CU-01 — none → full (3 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: CUSTOM / Custom Controls
- Outcome: A custom outcome that is not part of the published Core
- Assessment rationale: No assessment was produced for this subcategory.
- Suggested actions: (none provided by this CSF core export)

## At or above target (0)

_No outcome meets its target yet._

---

The current-coverage side of this plan comes from the reviewed assessment (see gap-analysis.md and current-profile.json); every coverage level above "none" is anchored to quotes verified verbatim against the source documents. Items marked UNREVIEWED or STALE still require human validation.
