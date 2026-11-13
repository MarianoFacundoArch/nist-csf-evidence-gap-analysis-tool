# NIST CSF 2.0 — Evidence Request List

> An interview and collection guide for the outcomes this assessment could not demonstrate at the required level. An outcome is listed because the documents provided did not show it — not because the organization necessarily lacks the practice: absence of evidence is not absence of a control. To close an item, collect the documents or records, add them to the documents folder, and re-run the pipeline (ingest, analyze, review, report). The assessment gives a coverage level above "none" only when a quote verified verbatim against the documents supports it; a reviewer then validates each level and may override it.

> The three questions are the same for every outcome and mirror the assessment's rubric. The checklists are the official NIST CSF 2.0 Implementation Examples (public domain, source: NIST CPRT), quoted verbatim: illustrative, not an exhaustive list and not a baseline of required actions. Rationales are the assessment's AI-generated reasoning.

> **DRAFT — not fully reviewed.** 3 unreviewed and 1 stale item(s) remain. A human must validate every item before the coverage levels this list is based on are authoritative.

## Overview

- Generated: 2026-01-01T00:00:00.000Z
- Scope: the 6 applicable outcomes that do not meet their target, in the same order and numbering as remediation-plan.md
- Not listed: 3 at or above target, 1 scoped out as not-applicable
- Open requests: 6 (current coverage: none 3, partial 3)

## Evidence requests

### High priority (1)

#### 1. GV.OC-02 — none → substantial (2 levels to close)

- Function / Category: GOVERN / Organizational Context (GV.OC)
- Outcome: Internal and external stakeholders are understood, and their needs and expectations regarding cybersecurity risk management are understood and considered
- Current coverage: none; target: substantial; priority: high
- Review status: reviewed
- Assessment rationale: [Auto-downgraded: the claimed coverage had no verifiable verbatim quote in the retrieved evidence.] Rationale text GV.OC-02.
- Reviewer note: Manual evidence check pending.
- Questions to ask:
  1. Is this outcome achieved today, and who is accountable for it?
  2. Where is it documented, and when was that documentation last reviewed?
  3. Which records show it operating in practice (not only that it is required)?
- Evidence that could demonstrate it — documents or records showing practices such as these in operation (NIST CSF 2.0 Implementation Examples, verbatim; illustrative, not exhaustive, not a required baseline):
  - [ ] Identify relevant internal stakeholders and their cybersecurity-related expectations (e.g., performance and risk expectations of officers, directors, and advisors; cultural expectations of employees)
  - [ ] Identify relevant external stakeholders and their cybersecurity-related expectations (e.g., privacy expectations of customers, business expectations of partnerships, compliance expectations of regulators, ethics expectations of society)

### Medium priority (4)

#### 2. PR.AA-05 — none → full (3 levels to close)

- Function / Category: PROTECT / Identity Management, Authentication, and Access Control (PR.AA)
- Outcome: Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed, and incorporate the principles of least privilege and separation of duties
- Current coverage: none (reviewer override: partial → none); target: full; priority: medium
- Review status: reviewed
- Assessment rationale: Rationale text PR.AA-05.
- Reviewer note: Policy superseded 2025-11.
- Documents already quoted: `policy.md` (1 quote)
- Questions to ask:
  1. Is this outcome achieved today, and who is accountable for it?
  2. Where is it documented, and when was that documentation last reviewed?
  3. Which records show it operating in practice (not only that it is required)?
- Evidence that could demonstrate it — documents or records showing practices such as these in operation (NIST CSF 2.0 Implementation Examples, verbatim; illustrative, not exhaustive, not a required baseline):
  - [ ] Review logical and physical access privileges periodically and whenever someone changes roles or leaves the organization, and promptly rescind privileges that are no longer needed
  - [ ] Take attributes of the requester and the requested resource into account for authorization decisions (e.g., geolocation, day/time, requester endpoint's cyber health)

#### 3. PR.AA-01 — partial → full (2 levels to close) _(⚠ STALE REVIEW)_

- Function / Category: PROTECT / Identity Management, Authentication, and Access Control (PR.AA)
- Outcome: Identities and credentials for authorized users, services, and hardware are managed by the organization
- Current coverage: partial; target: full; priority: medium
- Review status: stale
- Assessment rationale: Rationale text PR.AA-01.
- Reviewer note: Minutes requested.
- Documents already quoted: `access-standard.pdf` (2 quotes)
- Questions to ask:
  1. Is this outcome achieved today, and who is accountable for it?
  2. Where is it documented, and when was that documentation last reviewed?
  3. Which records show it operating in practice (not only that it is required)?
- Evidence that could demonstrate it — documents or records showing practices such as these in operation (NIST CSF 2.0 Implementation Examples, verbatim; illustrative, not exhaustive, not a required baseline):
  - [ ] Initiate requests for new access or additional access for employees, contractors, and others, and track, review, and fulfill the requests, with permission from system or data owners when needed
  - [ ] Issue, manage, and revoke cryptographic certificates and identity tokens, cryptographic keys (i.e., key management), and other credentials

#### 4. GV.RM-01 — partial → substantial (1 level to close) _(⚠ UNREVIEWED)_

- Function / Category: GOVERN / Risk Management Strategy (GV.RM)
- Outcome: Risk management objectives are established and agreed to by organizational stakeholders
- Current coverage: partial; target: substantial; priority: medium
- Review status: unreviewed
- Assessment rationale: Rationale text GV.RM-01, line 1. - line 2 (list item look-alike) # line 3 (heading look-alike)
- Documents already quoted: `policy.md` (2 quotes), `risk-register.xlsx.md` (1 quote)
- Questions to ask:
  1. Is this outcome achieved today, and who is accountable for it?
  2. Where is it documented, and when was that documentation last reviewed?
  3. Which records show it operating in practice (not only that it is required)?
- Evidence that could demonstrate it — documents or records showing practices such as these in operation (NIST CSF 2.0 Implementation Examples, verbatim; illustrative, not exhaustive, not a required baseline):
  - [ ] Update near-term and long-term cybersecurity risk management objectives as part of annual strategic planning and when major changes occur
  - [ ] Establish measurable objectives for cybersecurity risk management (e.g., manage the quality of user training, ensure adequate risk protection for industrial control systems)

#### 5. ZZ.CU-01 — partial → substantial (1 level to close)

- Function / Category: CUSTOM / Custom Controls
- Outcome: A custom outcome that is not part of the published Core
- Current coverage: partial; target: substantial; priority: medium
- Review status: reviewed
- Assessment rationale: Rationale text ZZ.CU-01.
- Documents already quoted: ``weird|name `x`.md`` (1 quote)
- Questions to ask:
  1. Is this outcome achieved today, and who is accountable for it?
  2. Where is it documented, and when was that documentation last reviewed?
  3. Which records show it operating in practice (not only that it is required)?
- Evidence that could demonstrate it: (no Implementation Examples provided by this CSF core export)

### Low priority (1)

#### 6. RC.RP-01 — none → substantial (2 levels to close) _(⚠ UNREVIEWED)_

- Function / Category: RECOVER / Incident Recovery Plan Execution (RC.RP)
- Outcome: The recovery portion of the incident response plan is executed once initiated from the incident response process
- Current coverage: none; target: substantial; priority: low
- Review status: unreviewed
- Assessment rationale: [Auto-downgraded: the claimed coverage had no verifiable verbatim quote in the retrieved evidence.] Rationale text RC.RP-01.
- Questions to ask:
  1. Is this outcome achieved today, and who is accountable for it?
  2. Where is it documented, and when was that documentation last reviewed?
  3. Which records show it operating in practice (not only that it is required)?
- Evidence that could demonstrate it — documents or records showing practices such as these in operation (NIST CSF 2.0 Implementation Examples, verbatim; illustrative, not exhaustive, not a required baseline):
  - [ ] Begin recovery procedures during or after incident response processes
  - [ ] Make all individuals with recovery responsibilities aware of the plans for recovery and the authorizations required to implement each aspect of the plans

---

An item leaves this list when a later assessment demonstrates the outcome at the required level with verified quotes, or when the target profile lowers its target or scopes it out. Items marked UNREVIEWED or STALE still require human validation.
