# NIST CSF 2.0 — Current Profile & Gap Analysis

> AI-assisted draft. Guiding principle: AI proposes, a human validates. Coverage judgments above "none" are anchored to quotes verified verbatim against the source evidence. CSF 2.0 Subcategory text is in the public domain (source: NIST CPRT).

## Overview

- Framework: NIST CSF 2.0 (CSF 2.0)
- Generated: 2026-01-01T00:00:00.000Z
- Providers: embeddings = `mock`, reasoning = `mock`
- CSF source: NIST CPRT — CSF 2.0 Core (public domain).
- Subcategories: 106 — gaps (none/partial): **96**
- Coverage: none 54, partial 42, substantial 6, full 4
- Review: reviewed 106, unreviewed 0, stale 0, overrides 2
- Quotes downgraded by the verifier: 1

## Coverage by Function

| Function | Total | None | Partial | Substantial | Full | % addressed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 31 | 8 | 16 | 5 | 2 | 23% |
| IDENTIFY | 21 | 14 | 4 | 1 | 2 | 14% |
| PROTECT | 22 | 12 | 10 | 0 | 0 | 0% |
| DETECT | 11 | 4 | 7 | 0 | 0 | 0% |
| RESPOND | 13 | 12 | 1 | 0 | 0 | 0% |
| RECOVER | 8 | 4 | 4 | 0 | 0 | 0% |

## Gaps and partial coverage (address these first)

### GOVERN

- **GV.OC-01** — _none_ _(verifier downgraded (unverifiable quote removed))_
  - Outcome: The organizational mission is understood and informs cybersecurity risk management
  - Rationale: [Auto-downgraded: the claimed coverage had no verifiable verbatim quote in the retrieved evidence.] The organization appears to link its mission to cybersecurity risk decisions through a formal annual review.
  - Reviewer note: Accepted: the AI quote could not be verified verbatim and was removed by the tool; manual evidence check pending.
- **GV.OC-03** — _none_
  - Outcome: Legal, regulatory, and contractual requirements regarding cybersecurity - including privacy and civil liberties obligations - are understood and managed
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **GV.RR-04** — _none_
  - Outcome: Cybersecurity is included in human resources practices
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **GV.SC-04** — _none_
  - Outcome: Suppliers are known and prioritized by criticality
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **GV.SC-05** — _none_
  - Outcome: Requirements to address cybersecurity risks in supply chains are established, prioritized, and integrated into contracts and other types of agreements with suppliers and other relevant third parties
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **GV.SC-06** — _none_
  - Outcome: Planning and due diligence are performed to reduce risks before entering into formal supplier or other third-party relationships
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **GV.SC-07** — _none_
  - Outcome: The risks posed by a supplier, their products and services, and other third parties are understood, recorded, prioritized, assessed, responded to, and monitored over the course of the relationship
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **GV.SC-10** — _none_
  - Outcome: Cybersecurity supply chain risk management plans include provisions for activities that occur after the conclusion of a partnership or service agreement
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **GV.OC-04** — _partial_
  - Outcome: Critical objectives, capabilities, and services that external stakeholders depend on or expect from the organization are understood and communicated
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Roles and Responsibilities

The following cybersecurity roles, responsibilities, and authorities are
established and communicated across the organization:

- The Chief Information Security Officer (CISO) is accountable for the
 cybersecurity program and reports quarterly to executive"
- **GV.OC-05** — _partial_ _(reviewer override: substantial → partial)_
  - Outcome: Outcomes, capabilities, and services that the organization depends on are understood and communicated
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Roles and Responsibilities

The following cybersecurity roles, responsibilities, and authorities are
established and communicated across the organization:

- The Chief Information Security Officer (CISO) is accountable for the
 cybersecurity program and reports quarterly to executive"
  - Reviewer note: Reviewer override: evidence reads as intent more than sustained operation; lowering pending dated records.
- **GV.OV-03** — _partial_
  - Outcome: Organizational cybersecurity risk management performance is evaluated and reviewed for adjustments needed
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Information Security Policy

This Information Security Policy for managing cybersecurity risks is established
based on our organizational context and business priorities, and is approved by
the Chief Executive Officer."
- **GV.RM-01** — _partial_
  - Outcome: Risk management objectives are established and agreed to by organizational stakeholders
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Risk Management

Cybersecurity risks are discussed at the monthly Security Committee meeting."
- **GV.RM-02** — _partial_
  - Outcome: Risk appetite and risk tolerance statements are established, communicated, and maintained
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "authorities are
established and communicated across the organization:

- The Chief Information Security Officer (CISO) is accountable for the
 cybersecurity program and reports quarterly to executive leadership."
- **GV.RM-03** — _partial_
  - Outcome: Cybersecurity risk management activities and outcomes are included in enterprise risk management processes
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Risk Management

Cybersecurity risks are discussed at the monthly Security Committee meeting."
- **GV.RM-04** — _partial_
  - Outcome: Strategic direction that describes appropriate risk response options is established and communicated
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "authorities are
established and communicated across the organization:

- The Chief Information Security Officer (CISO) is accountable for the
 cybersecurity program and reports quarterly to executive leadership."
- **GV.RM-05** — _partial_
  - Outcome: Lines of communication across the organization are established for cybersecurity risks, including risks from suppliers and other third parties
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "authorities are
established and communicated across the organization:

- The Chief Information Security Officer (CISO) is accountable for the
 cybersecurity program and reports quarterly to executive leadership."
- **GV.RM-06** — _partial_
  - Outcome: A standardized method for calculating, documenting, categorizing, and prioritizing cybersecurity risks is established and communicated
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Information Security Policy

This Information Security Policy for managing cybersecurity risks is established
based on our organizational context and business priorities, and is approved by
the Chief Executive Officer."
- **GV.RM-07** — _partial_
  - Outcome: Strategic opportunities (i.e., positive risks) are characterized and are included in organizational cybersecurity risk discussions
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Information Security Policy

This Information Security Policy for managing cybersecurity risks is established
based on our organizational context and business priorities, and is approved by
the Chief Executive Officer."
- **GV.RR-01** — _partial_
  - Outcome: Organizational leadership is responsible and accountable for cybersecurity risk and fosters a culture that is risk-aware, ethical, and continually improving
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "authorities are
established and communicated across the organization:

- The Chief Information Security Officer (CISO) is accountable for the
 cybersecurity program and reports quarterly to executive leadership."
- **GV.RR-03** — _partial_
  - Outcome: Adequate resources are allocated commensurate with the cybersecurity risk strategy, roles, responsibilities, and policies
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Risk Management

Cybersecurity risks are discussed at the monthly Security Committee meeting."
- **GV.SC-01** — _partial_
  - Outcome: A cybersecurity supply chain risk management program, strategy, objectives, policies, and processes are established and agreed to by organizational stakeholders
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "authorities are
established and communicated across the organization:

- The Chief Information Security Officer (CISO) is accountable for the
 cybersecurity program and reports quarterly to executive leadership."
- **GV.SC-03** — _partial_
  - Outcome: Cybersecurity supply chain risk management is integrated into cybersecurity and enterprise risk management, risk assessment, and improvement processes
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Risk Management

Cybersecurity risks are discussed at the monthly Security Committee meeting."
- **GV.SC-08** — _partial_
  - Outcome: Relevant suppliers and other third parties are included in incident planning, response, and recovery activities
  - Rationale: The evidence addresses this topic as stated intent/policy rather than demonstrated operation, so coverage is capped at partial. It is grounded in "incident-response-plan.pdf". Flagged for human confirmation of operational evidence.
  - Evidence (incident-response-plan.pdf, p.1): "Northwind Analytics - Incident Response Plan (Fictitious document for demonstration purposes only.) When an incident is declared, the incident response plan is executed in coordination with relevant third parties, including our managed security provider, affected clients, and, where required, regula…"
- **GV.SC-09** — _partial_
  - Outcome: Supply chain security practices are integrated into cybersecurity and enterprise risk management programs, and their performance is monitored throughout the technology product and service life cycle
  - Rationale: The evidence in "access-control-standard.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (access-control-standard.md): "Identities and credentials are managed throughout their lifecycle by
the IT team: accounts are provisioned through a ticketed request, credentials
are issued only after manager approval, and accounts are disabled within 24
hours of an employee's departure."

### IDENTIFY

- **ID.AM-04** — _none_
  - Outcome: Inventories of services provided by suppliers are maintained
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.AM-05** — _none_
  - Outcome: Assets are prioritized based on classification, criticality, resources, and impact on the mission
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.IM-01** — _none_
  - Outcome: Improvements are identified from evaluations
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.IM-03** — _none_
  - Outcome: Improvements are identified from execution of operational processes, procedures, and activities
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.RA-01** — _none_
  - Outcome: Vulnerabilities in assets are identified, validated, and recorded
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.RA-02** — _none_
  - Outcome: Cyber threat intelligence is received from information sharing forums and sources
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.RA-03** — _none_
  - Outcome: Internal and external threats to the organization are identified and recorded
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.RA-04** — _none_
  - Outcome: Potential impacts and likelihoods of threats exploiting vulnerabilities are identified and recorded
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.RA-05** — _none_
  - Outcome: Threats, vulnerabilities, likelihoods, and impacts are used to understand inherent risk and inform risk response prioritization
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.RA-06** — _none_
  - Outcome: Risk responses are chosen, prioritized, planned, tracked, and communicated
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.RA-07** — _none_
  - Outcome: Changes and exceptions are managed, assessed for risk impact, recorded, and tracked
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.RA-08** — _none_
  - Outcome: Processes for receiving, analyzing, and responding to vulnerability disclosures are established
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.RA-09** — _none_
  - Outcome: The authenticity and integrity of hardware and software are assessed prior to acquisition and use
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.RA-10** — _none_
  - Outcome: Critical suppliers are assessed prior to acquisition
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **ID.AM-03** — _partial_
  - Outcome: Representations of the organization's authorized network communication and internal and external network data flows are maintained
  - Rationale: The evidence in "asset-inventory-procedure.docx" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (asset-inventory-procedure.docx): "Northwind Analytics - Asset Management Procedure

(Fictitious document for demonstration purposes only.)

Hardware Inventory

Inventories of hardware managed by the organization are maintained in our configuration management database (CMDB)."
- **ID.AM-08** — _partial_
  - Outcome: Systems, hardware, software, services, and data are managed throughout their life cycles
  - Rationale: The evidence in "asset-inventory-procedure.docx" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (asset-inventory-procedure.docx): "Northwind Analytics - Asset Management Procedure

(Fictitious document for demonstration purposes only.)

Hardware Inventory

Inventories of hardware managed by the organization are maintained in our configuration management database (CMDB)."
- **ID.IM-02** — _partial_
  - Outcome: Improvements are identified from security tests and exercises, including those done in coordination with suppliers and relevant third parties
  - Rationale: The evidence addresses this topic as stated intent/policy rather than demonstrated operation, so coverage is capped at partial. It is grounded in "incident-response-plan.pdf". Flagged for human confirmation of operational evidence.
  - Evidence (incident-response-plan.pdf, p.1): "Northwind Analytics - Incident Response Plan (Fictitious document for demonstration purposes only.) When an incident is declared, the incident response plan is executed in coordination with relevant third parties, including our managed security provider, affected clients, and, where required, regula…"
- **ID.IM-04** — _partial_
  - Outcome: Incident response plans and other cybersecurity plans that affect operations are established, communicated, maintained, and improved
  - Rationale: The evidence addresses this topic as stated intent/policy rather than demonstrated operation, so coverage is capped at partial. It is grounded in "incident-response-plan.pdf". Flagged for human confirmation of operational evidence.
  - Evidence (incident-response-plan.pdf, p.1): "Northwind Analytics - Incident Response Plan (Fictitious document for demonstration purposes only.) When an incident is declared, the incident response plan is executed in coordination with relevant third parties, including our managed security provider, affected clients, and, where required, regula…"

### PROTECT

- **PR.AA-03** — _none_
  - Outcome: Users, services, and hardware are authenticated
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **PR.AA-04** — _none_
  - Outcome: Identity assertions are protected, conveyed, and verified
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **PR.DS-11** — _none_
  - Outcome: Backups of data are created, protected, maintained, and tested
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **PR.IR-01** — _none_
  - Outcome: Networks and environments are protected from unauthorized logical access and usage
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **PR.IR-02** — _none_
  - Outcome: The organization's technology assets are protected from environmental threats
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **PR.IR-03** — _none_
  - Outcome: Mechanisms are implemented to achieve resilience requirements in normal and adverse situations
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **PR.IR-04** — _none_
  - Outcome: Adequate resource capacity to ensure availability is maintained
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **PR.PS-01** — _none_
  - Outcome: Configuration management practices are established and applied
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **PR.PS-02** — _none_
  - Outcome: Software is maintained, replaced, and removed commensurate with risk
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **PR.PS-03** — _none_
  - Outcome: Hardware is maintained, replaced, and removed commensurate with risk
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **PR.PS-04** — _none_
  - Outcome: Log records are generated and made available for continuous monitoring
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **PR.PS-05** — _none_
  - Outcome: Installation and execution of unauthorized software are prevented
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **PR.AA-01** — _partial_
  - Outcome: Identities and credentials for authorized users, services, and hardware are managed by the organization
  - Rationale: The evidence in "access-control-standard.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (access-control-standard.md): "Identities and credentials are managed throughout their lifecycle by
the IT team: accounts are provisioned through a ticketed request, credentials
are issued only after manager approval, and accounts are disabled within 24
hours of an employee's departure."
- **PR.AA-02** — _partial_
  - Outcome: Identities are proofed and bound to credentials based on the context of interactions
  - Rationale: The evidence in "access-control-standard.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (access-control-standard.md): "Identities and credentials are managed throughout their lifecycle by
the IT team: accounts are provisioned through a ticketed request, credentials
are issued only after manager approval, and accounts are disabled within 24
hours of an employee's departure."
- **PR.AA-05** — _partial_
  - Outcome: Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed, and incorporate the principles of least privilege and separation of duties
  - Rationale: The evidence addresses this topic as stated intent/policy rather than demonstrated operation, so coverage is capped at partial. It is grounded in "access-control-standard.md". Flagged for human confirmation of operational evidence.
  - Evidence (access-control-standard.md): "Access Permissions and Authorization

Access permissions, entitlements, and authorizations are defined in this policy,
managed through role-based access control (RBAC), and enforced by our identity
provider."
- **PR.AA-06** — _partial_
  - Outcome: Physical access to assets is managed, monitored, and enforced commensurate with risk
  - Rationale: The evidence addresses this topic as stated intent/policy rather than demonstrated operation, so coverage is capped at partial. It is grounded in "access-control-standard.md". Flagged for human confirmation of operational evidence.
  - Evidence (access-control-standard.md): "Access Permissions and Authorization

Access permissions, entitlements, and authorizations are defined in this policy,
managed through role-based access control (RBAC), and enforced by our identity
provider."
- **PR.AT-01** — _partial_
  - Outcome: Personnel are provided with awareness and training so that they possess the knowledge and skills to perform general tasks with cybersecurity risks in mind
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "These responsibilities are documented in role descriptions, communicated to
staff, and the CISO confirms that they are understood during annual training."
- **PR.AT-02** — _partial_
  - Outcome: Individuals in specialized roles are provided with awareness and training so that they possess the knowledge and skills to perform relevant tasks with cybersecurity risks in mind
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "These responsibilities are documented in role descriptions, communicated to
staff, and the CISO confirms that they are understood during annual training."
- **PR.DS-01** — _partial_
  - Outcome: The confidentiality, integrity, and availability of data-at-rest are protected
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Our
mission is to protect the confidentiality and integrity of client data, and the
leadership team recognizes that this mission depends on effective cybersecurity."
- **PR.DS-02** — _partial_
  - Outcome: The confidentiality, integrity, and availability of data-in-transit are protected
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Our
mission is to protect the confidentiality and integrity of client data, and the
leadership team recognizes that this mission depends on effective cybersecurity."
- **PR.DS-10** — _partial_
  - Outcome: The confidentiality, integrity, and availability of data-in-use are protected
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Our
mission is to protect the confidentiality and integrity of client data, and the
leadership team recognizes that this mission depends on effective cybersecurity."
- **PR.PS-06** — _partial_
  - Outcome: Secure software development practices are integrated, and their performance is monitored throughout the software development life cycle
  - Rationale: The evidence in "access-control-standard.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (access-control-standard.md): "Identities and credentials are managed throughout their lifecycle by
the IT team: accounts are provisioned through a ticketed request, credentials
are issued only after manager approval, and accounts are disabled within 24
hours of an employee's departure."

### DETECT

- **DE.AE-03** — _none_
  - Outcome: Information is correlated from multiple sources
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **DE.AE-04** — _none_
  - Outcome: The estimated impact and scope of adverse events are understood
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **DE.AE-06** — _none_
  - Outcome: Information on adverse events is provided to authorized staff and tools
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **DE.AE-07** — _none_
  - Outcome: Cyber threat intelligence and other contextual information are integrated into the analysis
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **DE.AE-02** — _partial_
  - Outcome: Potentially adverse events are analyzed to better understand associated activities
  - Rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (incident-response-plan.pdf, p.2): "Network Monitoring The Security Operations Center monitors networks and network services and reviews intrusion detection system alerts to find potentially adverse events."
- **DE.AE-08** — _partial_
  - Outcome: Incidents are declared when adverse events meet the defined incident criteria
  - Rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (incident-response-plan.pdf, p.1): "Incidents are declared by the on-call lead when adverse events meet the documented incident criteria."
- **DE.CM-01** — _partial_
  - Outcome: Networks and network services are monitored to find potentially adverse events
  - Rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (incident-response-plan.pdf, p.2): "Network Monitoring The Security Operations Center monitors networks and network services and reviews intrusion detection system alerts to find potentially adverse events."
- **DE.CM-02** — _partial_
  - Outcome: The physical environment is monitored to find potentially adverse events
  - Rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (incident-response-plan.pdf, p.2): "Network Monitoring The Security Operations Center monitors networks and network services and reviews intrusion detection system alerts to find potentially adverse events."
- **DE.CM-03** — _partial_
  - Outcome: Personnel activity and technology usage are monitored to find potentially adverse events
  - Rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (incident-response-plan.pdf, p.2): "Network Monitoring The Security Operations Center monitors networks and network services and reviews intrusion detection system alerts to find potentially adverse events."
- **DE.CM-06** — _partial_
  - Outcome: External service provider activities and services are monitored to find potentially adverse events
  - Rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (incident-response-plan.pdf, p.2): "Network Monitoring The Security Operations Center monitors networks and network services and reviews intrusion detection system alerts to find potentially adverse events."
- **DE.CM-09** — _partial_
  - Outcome: Computing hardware and software, runtime environments, and their data are monitored to find potentially adverse events
  - Rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (incident-response-plan.pdf, p.2): "Network Monitoring The Security Operations Center monitors networks and network services and reviews intrusion detection system alerts to find potentially adverse events."

### RESPOND

- **RS.AN-03** — _none_
  - Outcome: Analysis is performed to establish what has taken place during an incident and the root cause of the incident
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RS.AN-06** — _none_
  - Outcome: Actions performed during an investigation are recorded, and the records' integrity and provenance are preserved
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RS.AN-07** — _none_
  - Outcome: Incident data and metadata are collected, and their integrity and provenance are preserved
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RS.AN-08** — _none_
  - Outcome: An incident's magnitude is estimated and validated
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RS.CO-02** — _none_
  - Outcome: Internal and external stakeholders are notified of incidents
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RS.CO-03** — _none_
  - Outcome: Information is shared with designated internal and external stakeholders
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RS.MA-02** — _none_
  - Outcome: Incident reports are triaged and validated
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RS.MA-03** — _none_
  - Outcome: Incidents are categorized and prioritized
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RS.MA-04** — _none_
  - Outcome: Incidents are escalated or elevated as needed
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RS.MA-05** — _none_
  - Outcome: The criteria for initiating incident recovery are applied
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RS.MI-01** — _none_
  - Outcome: Incidents are contained
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RS.MI-02** — _none_
  - Outcome: Incidents are eradicated
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RS.MA-01** — _partial_
  - Outcome: The incident response plan is executed in coordination with relevant third parties once an incident is declared
  - Rationale: The evidence addresses this topic as stated intent/policy rather than demonstrated operation, so coverage is capped at partial. It is grounded in "incident-response-plan.pdf". Flagged for human confirmation of operational evidence.
  - Evidence (incident-response-plan.pdf, p.1): "Northwind Analytics - Incident Response Plan (Fictitious document for demonstration purposes only.) When an incident is declared, the incident response plan is executed in coordination with relevant third parties, including our managed security provider, affected clients, and, where required, regula…"

### RECOVER

- **RC.CO-03** — _none_
  - Outcome: Recovery activities and progress in restoring operational capabilities are communicated to designated internal and external stakeholders
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RC.CO-04** — _none_
  - Outcome: Public updates on incident recovery are shared using approved methods and messaging
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RC.RP-02** — _none_
  - Outcome: Recovery actions are selected, scoped, prioritized, and performed
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RC.RP-03** — _none_
  - Outcome: The integrity of backups and other restoration assets is verified before using them for restoration
  - Rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- **RC.RP-01** — _partial_
  - Outcome: The recovery portion of the incident response plan is executed once initiated from the incident response process
  - Rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (incident-response-plan.pdf, p.2): "Recovery Once recovery is initiated from the incident response process, systems are restored from the most recent verified backups."
- **RC.RP-04** — _partial_
  - Outcome: Critical mission functions and cybersecurity risk management are considered to establish post-incident operational norms
  - Rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (information-security-policy.md): "Information Security Policy

This Information Security Policy for managing cybersecurity risks is established
based on our organizational context and business priorities, and is approved by
the Chief Executive Officer."
- **RC.RP-05** — _partial_
  - Outcome: The integrity of restored assets is verified, systems and services are restored, and normal operating status is confirmed
  - Rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (incident-response-plan.pdf, p.2): "Recovery Once recovery is initiated from the incident response process, systems are restored from the most recent verified backups."
- **RC.RP-06** — _partial_
  - Outcome: The end of incident recovery is declared based on criteria, and incident-related documentation is completed
  - Rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
  - Evidence (incident-response-plan.pdf, p.1): "Incidents are declared by the on-call lead when adverse events meet the documented incident criteria."

## Substantially or fully covered

### GOVERN

- **GV.OC-02** — _substantial_ _(reviewer override: partial → substantial)_: Internal and external stakeholders are understood, and their needs and expectations regarding cybersecurity risk management are understood and considered
  - Evidence (information-security-policy.md)
- **GV.OV-01** — _substantial_: Cybersecurity risk management strategy outcomes are reviewed to inform and adjust strategy and direction
  - Evidence (information-security-policy.md)
- **GV.OV-02** — _substantial_: The cybersecurity risk management strategy is reviewed and adjusted to ensure coverage of organizational requirements and risks
  - Evidence (information-security-policy.md)
- **GV.PO-01** — _full_: Policy for managing cybersecurity risks is established based on organizational context, cybersecurity strategy, and priorities and is communicated and enforced
  - Evidence (information-security-policy.md)
- **GV.PO-02** — _substantial_: Policy for managing cybersecurity risks is reviewed, updated, communicated, and enforced to reflect changes in requirements, threats, technology, and organizational mission
  - Evidence (information-security-policy.md)
- **GV.RR-02** — _full_: Roles, responsibilities, and authorities related to cybersecurity risk management are established, communicated, understood, and enforced
  - Evidence (information-security-policy.md)
- **GV.SC-02** — _substantial_: Cybersecurity roles and responsibilities for suppliers, customers, and partners are established, communicated, and coordinated internally and externally
  - Evidence (information-security-policy.md)

### IDENTIFY

- **ID.AM-01** — _full_: Inventories of hardware managed by the organization are maintained
  - Evidence (asset-inventory-procedure.docx)
- **ID.AM-02** — _full_: Inventories of software, services, and systems managed by the organization are maintained
  - Evidence (asset-inventory-procedure.docx)
- **ID.AM-07** — _substantial_: Inventories of data and corresponding metadata for designated data types are maintained
  - Evidence (asset-inventory-procedure.docx)

---

Every coverage level above "none" is supported by at least one quote that was checked verbatim against the retrieved source text; unverifiable quotes are removed and the item is downgraded. Items marked UNREVIEWED or STALE still require human validation.
