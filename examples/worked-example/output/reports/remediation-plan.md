# NIST CSF 2.0 — Remediation Plan (Current → Target)

> Targets, priorities, and out-of-scope decisions are human choices recorded in the target profile — no AI makes them. Suggested actions are the official NIST CSF 2.0 Implementation Examples (public domain, source: NIST CPRT): illustrative starting points, not an exhaustive or mandatory list.

## Overview

- Framework: NIST CSF 2.0 (CSF 2.0)
- Generated: 2026-01-01T00:00:00.000Z
- Target baseline: **substantial** for every outcome, plus any overrides recorded in the target profile
- Target description: Illustrative Target Profile for the worked example: substantial baseline, full identity and access management, recovery deprioritized this cycle.
- Applicable outcomes: 105 of 106 (1 scoped out as not-applicable)
- Target met: **10/105 (10%)** — unmet: **95** (high 9, medium 78, low 8)

## Current vs target by Function

| Function | Applicable | Met | Unmet | Out of scope | % met |
| --- | ---: | ---: | ---: | ---: | ---: |
| GOVERN | 31 | 7 | 24 | 0 | 23% |
| IDENTIFY | 21 | 3 | 18 | 0 | 14% |
| PROTECT | 21 | 0 | 21 | 1 | 0% |
| DETECT | 11 | 0 | 11 | 0 | 0% |
| RESPOND | 13 | 0 | 13 | 0 | 0% |
| RECOVER | 8 | 0 | 8 | 0 | 0% |

## Prioritized action plan

Ranked by remediation priority, then by distance from the target. Work the list top-down; each item lists what the outcome requires, where the assessment stands, and NIST's example actions.

### High priority (9)

#### 1. PR.AA-03 — none → full (3 levels to close)

- Function / Category: PROTECT / Identity Management, Authentication, and Access Control (PR.AA)
- Outcome: Users, services, and hardware are authenticated
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Require multifactor authentication
  2. Enforce policies for the minimum strength of passwords, PINs, and similar authenticators
  3. Periodically reauthenticate users, services, and hardware based on risk (e.g., in zero trust architectures)
  4. Ensure that authorized personnel can access accounts essential for protecting safety under emergency conditions

#### 2. PR.AA-04 — none → full (3 levels to close)

- Function / Category: PROTECT / Identity Management, Authentication, and Access Control (PR.AA)
- Outcome: Identity assertions are protected, conveyed, and verified
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Protect identity assertions that are used to convey authentication and user information through single sign-on systems
  2. Protect identity assertions that are used to convey authentication and user information between federated systems
  3. Implement standards-based approaches for identity assertions in all contexts, and follow all guidance for the generation (e.g., data models, metadata), protection (e.g., digital signing, encryption), and verification (e.g., signature validation) of identity assertions

#### 3. GV.OC-01 — none → substantial (2 levels to close)

- Function / Category: GOVERN / Organizational Context (GV.OC)
- Outcome: The organizational mission is understood and informs cybersecurity risk management
- Assessment rationale: [Auto-downgraded: the claimed coverage had no verifiable verbatim quote in the retrieved evidence.] The organization appears to link its mission to cybersecurity risk decisions through a formal annual review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Share the organization's mission (e.g., through vision and mission statements, marketing, and service strategies) to provide a basis for identifying risks that may impede that mission

#### 4. GV.OC-03 — none → substantial (2 levels to close)

- Function / Category: GOVERN / Organizational Context (GV.OC)
- Outcome: Legal, regulatory, and contractual requirements regarding cybersecurity - including privacy and civil liberties obligations - are understood and managed
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Determine a process to track and manage legal and regulatory requirements regarding protection of individuals' information (e.g., Health Insurance Portability and Accountability Act, California Consumer Privacy Act, General Data Protection Regulation)
  2. Determine a process to track and manage contractual requirements for cybersecurity management of supplier, customer, and partner information
  3. Align the organization's cybersecurity strategy with legal, regulatory, and contractual requirements

#### 5. PR.AA-01 — partial → full (2 levels to close)

- Function / Category: PROTECT / Identity Management, Authentication, and Access Control (PR.AA)
- Outcome: Identities and credentials for authorized users, services, and hardware are managed by the organization
- Assessment rationale: The evidence in "access-control-standard.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Initiate requests for new access or additional access for employees, contractors, and others, and track, review, and fulfill the requests, with permission from system or data owners when needed
  2. Issue, manage, and revoke cryptographic certificates and identity tokens, cryptographic keys (i.e., key management), and other credentials
  3. Select a unique identifier for each device from immutable hardware characteristics or an identifier securely provisioned to the device
  4. Physically label authorized hardware with an identifier for inventory and servicing purposes

#### 6. PR.AA-02 — partial → full (2 levels to close)

- Function / Category: PROTECT / Identity Management, Authentication, and Access Control (PR.AA)
- Outcome: Identities are proofed and bound to credentials based on the context of interactions
- Assessment rationale: The evidence in "access-control-standard.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Verify a person's claimed identity at enrollment time using government-issued identity credentials (e.g., passport, visa, driver's license)
  2. Issue a different credential for each person (i.e., no credential sharing)

#### 7. PR.AA-05 — partial → full (2 levels to close)

- Function / Category: PROTECT / Identity Management, Authentication, and Access Control (PR.AA)
- Outcome: Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed, and incorporate the principles of least privilege and separation of duties
- Assessment rationale: The evidence addresses this topic as stated intent/policy rather than demonstrated operation, so coverage is capped at partial. It is grounded in "access-control-standard.md". Flagged for human confirmation of operational evidence.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Review logical and physical access privileges periodically and whenever someone changes roles or leaves the organization, and promptly rescind privileges that are no longer needed
  2. Take attributes of the requester and the requested resource into account for authorization decisions (e.g., geolocation, day/time, requester endpoint's cyber health)
  3. Restrict access and privileges to the minimum necessary (e.g., zero trust architecture)
  4. Periodically review the privileges associated with critical business functions to confirm proper separation of duties

#### 8. GV.OC-04 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Organizational Context (GV.OC)
- Outcome: Critical objectives, capabilities, and services that external stakeholders depend on or expect from the organization are understood and communicated
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Establish criteria for determining the criticality of capabilities and services as viewed by internal and external stakeholders
  2. Determine (e.g., from a business impact analysis) assets and business operations that are vital to achieving mission objectives and the potential impact of a loss (or partial loss) of such operations
  3. Establish and communicate resilience objectives (e.g., recovery time objectives) for delivering critical capabilities and services in various operating states (e.g., under attack, during recovery, normal operation)

#### 9. GV.OC-05 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Organizational Context (GV.OC)
- Outcome: Outcomes, capabilities, and services that the organization depends on are understood and communicated
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Create an inventory of the organization's dependencies on external resources (e.g., facilities, cloud-based hosting providers) and their relationships to organizational assets and business functions
  2. Identify and document external dependencies that are potential points of failure for the organization's critical capabilities and services, and share that information with appropriate personnel

### Medium priority (78)

#### 10. GV.RR-04 — none → substantial (2 levels to close)

- Function / Category: GOVERN / Roles, Responsibilities, and Authorities (GV.RR)
- Outcome: Cybersecurity is included in human resources practices
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Integrate cybersecurity risk management considerations into human resources processes (e.g., personnel screening, onboarding, change notification, offboarding)
  2. Consider cybersecurity knowledge to be a positive factor in hiring, training, and retention decisions
  3. Conduct background checks prior to onboarding new personnel for sensitive roles, and periodically repeat background checks for personnel with such roles
  4. Define and enforce obligations for personnel to be aware of, adhere to, and uphold security policies as they relate to their roles

#### 11. GV.SC-04 — none → substantial (2 levels to close)

- Function / Category: GOVERN / Cybersecurity Supply Chain Risk Management (GV.SC)
- Outcome: Suppliers are known and prioritized by criticality
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Develop criteria for supplier criticality based on, for example, the sensitivity of data processed or possessed by suppliers, the degree of access to the organization's systems, and the importance of the products or services to the organization's mission
  2. Keep a record of all suppliers, and prioritize suppliers based on the criticality criteria

#### 12. GV.SC-05 — none → substantial (2 levels to close)

- Function / Category: GOVERN / Cybersecurity Supply Chain Risk Management (GV.SC)
- Outcome: Requirements to address cybersecurity risks in supply chains are established, prioritized, and integrated into contracts and other types of agreements with suppliers and other relevant third parties
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Establish security requirements for suppliers, products, and services commensurate with their criticality level and potential impact if compromised
  2. Include all cybersecurity and supply chain requirements that third parties must follow and how compliance with the requirements may be verified in default contractual language
  3. Define the rules and protocols for information sharing between the organization and its suppliers and sub-tier suppliers in agreements
  4. Manage risk by including security requirements in agreements based on their criticality and potential impact if compromised
  5. Define security requirements in service-level agreements (SLAs) for monitoring suppliers for acceptable security performance throughout the supplier relationship lifecycle
  6. Contractually require suppliers to disclose cybersecurity features, functions, and vulnerabilities of their products and services for the life of the product or the term of service
  7. Contractually require suppliers to provide and maintain a current component inventory (e.g., software or hardware bill of materials) for critical products
  8. Contractually require suppliers to vet their employees and guard against insider threats
  9. Contractually require suppliers to provide evidence of performing acceptable security practices through, for example, self-attestation, conformance to known standards, certifications, or inspections
  10. Specify in contracts and other agreements the rights and responsibilities of the organization, its suppliers, and their supply chains, with respect to potential cybersecurity risks

#### 13. GV.SC-06 — none → substantial (2 levels to close)

- Function / Category: GOVERN / Cybersecurity Supply Chain Risk Management (GV.SC)
- Outcome: Planning and due diligence are performed to reduce risks before entering into formal supplier or other third-party relationships
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Perform thorough due diligence on prospective suppliers that is consistent with procurement planning and commensurate with the level of risk, criticality, and complexity of each supplier relationship
  2. Assess the suitability of the technology and cybersecurity capabilities and the risk management practices of prospective suppliers
  3. Conduct supplier risk assessments against business and applicable cybersecurity requirements
  4. Assess the authenticity, integrity, and security of critical products prior to acquisition and use

#### 14. GV.SC-07 — none → substantial (2 levels to close)

- Function / Category: GOVERN / Cybersecurity Supply Chain Risk Management (GV.SC)
- Outcome: The risks posed by a supplier, their products and services, and other third parties are understood, recorded, prioritized, assessed, responded to, and monitored over the course of the relationship
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Adjust assessment formats and frequencies based on the third party's reputation and the criticality of the products or services they provide
  2. Evaluate third parties' evidence of compliance with contractual cybersecurity requirements, such as self-attestations, warranties, certifications, and other artifacts
  3. Monitor critical suppliers to ensure that they are fulfilling their security obligations throughout the supplier relationship lifecycle using a variety of methods and techniques, such as inspections, audits, tests, or other forms of evaluation
  4. Monitor critical suppliers, services, and products for changes to their risk profiles, and reevaluate supplier criticality and risk impact accordingly
  5. Plan for unexpected supplier and supply chain-related interruptions to ensure business continuity

#### 15. GV.SC-10 — none → substantial (2 levels to close)

- Function / Category: GOVERN / Cybersecurity Supply Chain Risk Management (GV.SC)
- Outcome: Cybersecurity supply chain risk management plans include provisions for activities that occur after the conclusion of a partnership or service agreement
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Establish processes for terminating critical relationships under both normal and adverse circumstances
  2. Define and implement plans for component end-of-life maintenance support and obsolescence
  3. Verify that supplier access to organization resources is deactivated promptly when it is no longer needed
  4. Verify that assets containing the organization's data are returned or properly disposed of in a timely, controlled, and safe manner
  5. Develop and execute a plan for terminating or transitioning supplier relationships that takes supply chain security risk and resiliency into account
  6. Mitigate risks to data and systems created by supplier termination
  7. Manage data leakage risks associated with supplier termination

#### 16. ID.AM-04 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Asset Management (ID.AM)
- Outcome: Inventories of services provided by suppliers are maintained
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Inventory all external services used by the organization, including third-party infrastructure-as-a-service (IaaS), platform-as-a-service (PaaS), and software-as-a-service (SaaS) offerings; APIs; and other externally hosted application services
  2. Update the inventory when a new external service is going to be utilized to ensure adequate cybersecurity risk management monitoring of the organization's use of that service

#### 17. ID.AM-05 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Asset Management (ID.AM)
- Outcome: Assets are prioritized based on classification, criticality, resources, and impact on the mission
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Define criteria for prioritizing each class of assets
  2. Apply the prioritization criteria to assets
  3. Track the asset priorities and update them periodically or when significant changes to the organization occur

#### 18. ID.IM-01 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Improvement (ID.IM)
- Outcome: Improvements are identified from evaluations
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Perform self-assessments of critical services that take current threats and TTPs into consideration
  2. Invest in third-party assessments or independent audits of the effectiveness of the organization's cybersecurity program to identify areas that need improvement
  3. Constantly evaluate compliance with selected cybersecurity requirements through automated means

#### 19. ID.IM-03 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Improvement (ID.IM)
- Outcome: Improvements are identified from execution of operational processes, procedures, and activities
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Conduct collaborative lessons learned sessions with suppliers
  2. Annually review cybersecurity policies, processes, and procedures to take lessons learned into account
  3. Use metrics to assess operational cybersecurity performance over time

#### 20. ID.RA-01 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Risk Assessment (ID.RA)
- Outcome: Vulnerabilities in assets are identified, validated, and recorded
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Use vulnerability management technologies to identify unpatched and misconfigured software
  2. Assess network and system architectures for design and implementation weaknesses that affect cybersecurity
  3. Review, analyze, or test organization-developed software to identify design, coding, and default configuration vulnerabilities
  4. Assess facilities that house critical computing assets for physical vulnerabilities and resilience issues
  5. Monitor sources of cyber threat intelligence for information on new vulnerabilities in products and services
  6. Review processes and procedures for weaknesses that could be exploited to affect cybersecurity

#### 21. ID.RA-02 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Risk Assessment (ID.RA)
- Outcome: Cyber threat intelligence is received from information sharing forums and sources
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Configure cybersecurity tools and technologies with detection or response capabilities to securely ingest cyber threat intelligence feeds
  2. Receive and review advisories from reputable third parties on current threat actors and their tactics, techniques, and procedures (TTPs)
  3. Monitor sources of cyber threat intelligence for information on the types of vulnerabilities that emerging technologies may have

#### 22. ID.RA-03 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Risk Assessment (ID.RA)
- Outcome: Internal and external threats to the organization are identified and recorded
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Use cyber threat intelligence to maintain awareness of the types of threat actors likely to target the organization and the TTPs they are likely to use
  2. Perform threat hunting to look for signs of threat actors within the environment
  3. Implement processes for identifying internal threat actors

#### 23. ID.RA-04 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Risk Assessment (ID.RA)
- Outcome: Potential impacts and likelihoods of threats exploiting vulnerabilities are identified and recorded
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Business leaders and cybersecurity risk management practitioners work together to estimate the likelihood and impact of risk scenarios and record them in risk registers
  2. Enumerate the potential business impacts of unauthorized access to the organization's communications, systems, and data processed in or by those systems
  3. Account for the potential impacts of cascading failures for systems of systems

#### 24. ID.RA-05 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Risk Assessment (ID.RA)
- Outcome: Threats, vulnerabilities, likelihoods, and impacts are used to understand inherent risk and inform risk response prioritization
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Develop threat models to better understand risks to the data and identify appropriate risk responses
  2. Prioritize cybersecurity resource allocations and investments based on estimated likelihoods and impacts

#### 25. ID.RA-06 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Risk Assessment (ID.RA)
- Outcome: Risk responses are chosen, prioritized, planned, tracked, and communicated
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Apply the vulnerability management plan's criteria for deciding whether to accept, transfer, mitigate, or avoid risk
  2. Apply the vulnerability management plan's criteria for selecting compensating controls to mitigate risk
  3. Track the progress of risk response implementation (e.g., plan of action and milestones [POA&M], risk register, risk detail report)
  4. Use risk assessment findings to inform risk response decisions and actions
  5. Communicate planned risk responses to affected stakeholders in priority order

#### 26. ID.RA-07 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Risk Assessment (ID.RA)
- Outcome: Changes and exceptions are managed, assessed for risk impact, recorded, and tracked
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Implement and follow procedures for the formal documentation, review, testing, and approval of proposed changes and requested exceptions
  2. Document the possible risks of making or not making each proposed change, and provide guidance on rolling back changes
  3. Document the risks related to each requested exception and the plan for responding to those risks
  4. Periodically review risks that were accepted based upon planned future actions or milestones

#### 27. ID.RA-08 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Risk Assessment (ID.RA)
- Outcome: Processes for receiving, analyzing, and responding to vulnerability disclosures are established
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Conduct vulnerability information sharing between the organization and its suppliers following the rules and protocols defined in contracts
  2. Assign responsibilities and verify the execution of procedures for processing, analyzing the impact of, and responding to cybersecurity threat, vulnerability, or incident disclosures by suppliers, customers, partners, and government cybersecurity organizations

#### 28. ID.RA-09 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Risk Assessment (ID.RA)
- Outcome: The authenticity and integrity of hardware and software are assessed prior to acquisition and use
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Assess the authenticity and cybersecurity of critical technology products and services prior to acquisition and use

#### 29. ID.RA-10 — none → substantial (2 levels to close)

- Function / Category: IDENTIFY / Risk Assessment (ID.RA)
- Outcome: Critical suppliers are assessed prior to acquisition
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Conduct supplier risk assessments against business and applicable cybersecurity requirements, including the supply chain

#### 30. PR.DS-11 — none → substantial (2 levels to close)

- Function / Category: PROTECT / Data Security (PR.DS)
- Outcome: Backups of data are created, protected, maintained, and tested
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Continuously back up critical data in near-real-time, and back up other data frequently at agreed-upon schedules
  2. Test backups and restores for all types of data sources at least annually
  3. Securely store some backups offline and offsite so that an incident or disaster will not damage them
  4. Enforce geographic separation and geolocation restrictions for data backup storage

#### 31. PR.IR-01 — none → substantial (2 levels to close)

- Function / Category: PROTECT / Technology Infrastructure Resilience (PR.IR)
- Outcome: Networks and environments are protected from unauthorized logical access and usage
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Logically segment organization networks and cloud-based platforms according to trust boundaries and platform types (e.g., IT, IoT, OT, mobile, guests), and permit required communications only between segments
  2. Logically segment organization networks from external networks, and permit only necessary communications to enter the organization's networks from the external networks
  3. Implement zero trust architectures to restrict network access to each resource to the minimum necessary
  4. Check the cyber health of endpoints before allowing them to access and use production resources

#### 32. PR.IR-02 — none → substantial (2 levels to close)

- Function / Category: PROTECT / Technology Infrastructure Resilience (PR.IR)
- Outcome: The organization's technology assets are protected from environmental threats
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Protect organizational equipment from known environmental threats, such as flooding, fire, wind, and excessive heat and humidity
  2. Include protection from environmental threats and provisions for adequate operating infrastructure in requirements for service providers that operate systems on the organization's behalf

#### 33. PR.IR-03 — none → substantial (2 levels to close)

- Function / Category: PROTECT / Technology Infrastructure Resilience (PR.IR)
- Outcome: Mechanisms are implemented to achieve resilience requirements in normal and adverse situations
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Avoid single points of failure in systems and infrastructure
  2. Use load balancing to increase capacity and improve reliability
  3. Use high-availability components like redundant storage and power supplies to improve system reliability

#### 34. PR.IR-04 — none → substantial (2 levels to close)

- Function / Category: PROTECT / Technology Infrastructure Resilience (PR.IR)
- Outcome: Adequate resource capacity to ensure availability is maintained
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Monitor usage of storage, power, compute, network bandwidth, and other resources
  2. Forecast future needs, and scale resources accordingly

#### 35. PR.PS-01 — none → substantial (2 levels to close)

- Function / Category: PROTECT / Platform Security (PR.PS)
- Outcome: Configuration management practices are established and applied
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Establish, test, deploy, and maintain hardened baselines that enforce the organization's cybersecurity policies and provide only essential capabilities (i.e., principle of least functionality)
  2. Review all default configuration settings that may potentially impact cybersecurity when installing or upgrading software
  3. Monitor implemented software for deviations from approved baselines

#### 36. PR.PS-02 — none → substantial (2 levels to close)

- Function / Category: PROTECT / Platform Security (PR.PS)
- Outcome: Software is maintained, replaced, and removed commensurate with risk
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Perform routine and emergency patching within the timeframes specified in the vulnerability management plan
  2. Update container images, and deploy new container instances to replace rather than update existing instances
  3. Replace end-of-life software and service versions with supported, maintained versions
  4. Uninstall and remove unauthorized software and services that pose undue risks
  5. Uninstall and remove any unnecessary software components (e.g., operating system utilities) that attackers might misuse
  6. Define and implement plans for software and service end-of-life maintenance support and obsolescence

#### 37. PR.PS-03 — none → substantial (2 levels to close)

- Function / Category: PROTECT / Platform Security (PR.PS)
- Outcome: Hardware is maintained, replaced, and removed commensurate with risk
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Replace hardware when it lacks needed security capabilities or when it cannot support software with needed security capabilities
  2. Define and implement plans for hardware end-of-life maintenance support and obsolescence
  3. Perform hardware disposal in a secure, responsible, and auditable manner

#### 38. PR.PS-04 — none → substantial (2 levels to close)

- Function / Category: PROTECT / Platform Security (PR.PS)
- Outcome: Log records are generated and made available for continuous monitoring
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Configure all operating systems, applications, and services (including cloud-based services) to generate log records
  2. Configure log generators to securely share their logs with the organization's logging infrastructure systems and services
  3. Configure log generators to record the data needed by zero-trust architectures

#### 39. PR.PS-05 — none → substantial (2 levels to close)

- Function / Category: PROTECT / Platform Security (PR.PS)
- Outcome: Installation and execution of unauthorized software are prevented
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. When risk warrants it, restrict software execution to permitted products only or deny the execution of prohibited and unauthorized software
  2. Verify the source of new software and the software's integrity before installing it
  3. Configure platforms to use only approved DNS services that block access to known malicious domains
  4. Configure platforms to allow the installation of organization-approved software only

#### 40. DE.AE-03 — none → substantial (2 levels to close)

- Function / Category: DETECT / Adverse Event Analysis (DE.AE)
- Outcome: Information is correlated from multiple sources
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Constantly transfer log data generated by other sources to a relatively small number of log servers
  2. Use event correlation technology (e.g., SIEM) to collect information captured by multiple sources
  3. Utilize cyber threat intelligence to help correlate events among log sources

#### 41. DE.AE-04 — none → substantial (2 levels to close)

- Function / Category: DETECT / Adverse Event Analysis (DE.AE)
- Outcome: The estimated impact and scope of adverse events are understood
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Use SIEMs or other tools to estimate impact and scope, and review and refine the estimates
  2. A person creates their own estimates of impact and scope

#### 42. DE.AE-06 — none → substantial (2 levels to close)

- Function / Category: DETECT / Adverse Event Analysis (DE.AE)
- Outcome: Information on adverse events is provided to authorized staff and tools
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Use cybersecurity software to generate alerts and provide them to the security operations center (SOC), incident responders, and incident response tools
  2. Incident responders and other authorized personnel can access log analysis findings at all times
  3. Automatically create and assign tickets in the organization's ticketing system when certain types of alerts occur
  4. Manually create and assign tickets in the organization's ticketing system when technical staff discover indicators of compromise

#### 43. DE.AE-07 — none → substantial (2 levels to close)

- Function / Category: DETECT / Adverse Event Analysis (DE.AE)
- Outcome: Cyber threat intelligence and other contextual information are integrated into the analysis
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Securely provide cyber threat intelligence feeds to detection technologies, processes, and personnel
  2. Securely provide information from asset inventories to detection technologies, processes, and personnel
  3. Rapidly acquire and analyze vulnerability disclosures for the organization's technologies from suppliers, vendors, and third-party security advisories

#### 44. RS.AN-03 — none → substantial (2 levels to close)

- Function / Category: RESPOND / Incident Analysis (RS.AN)
- Outcome: Analysis is performed to establish what has taken place during an incident and the root cause of the incident
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Determine the sequence of events that occurred during the incident and which assets and resources were involved in each event
  2. Attempt to determine what vulnerabilities, threats, and threat actors were directly or indirectly involved in the incident
  3. Analyze the incident to find the underlying, systemic root causes
  4. Check any cyber deception technology for additional information on attacker behavior

#### 45. RS.AN-06 — none → substantial (2 levels to close)

- Function / Category: RESPOND / Incident Analysis (RS.AN)
- Outcome: Actions performed during an investigation are recorded, and the records' integrity and provenance are preserved
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Require each incident responder and others (e.g., system administrators, cybersecurity engineers) who perform incident response tasks to record their actions and make the record immutable
  2. Require the incident lead to document the incident in detail and be responsible for preserving the integrity of the documentation and the sources of all information being reported

#### 46. RS.AN-07 — none → substantial (2 levels to close)

- Function / Category: RESPOND / Incident Analysis (RS.AN)
- Outcome: Incident data and metadata are collected, and their integrity and provenance are preserved
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Collect, preserve, and safeguard the integrity of all pertinent incident data and metadata (e.g., data source, date/time of collection) based on evidence preservation and chain-of-custody procedures

#### 47. RS.AN-08 — none → substantial (2 levels to close)

- Function / Category: RESPOND / Incident Analysis (RS.AN)
- Outcome: An incident's magnitude is estimated and validated
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Review other potential targets of the incident to search for indicators of compromise and evidence of persistence
  2. Automatically run tools on targets to look for indicators of compromise and evidence of persistence

#### 48. RS.CO-02 — none → substantial (2 levels to close)

- Function / Category: RESPOND / Incident Response Reporting and Communication (RS.CO)
- Outcome: Internal and external stakeholders are notified of incidents
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Follow the organization's breach notification procedures after discovering a data breach incident, including notifying affected customers
  2. Notify business partners and customers of incidents in accordance with contractual requirements
  3. Notify law enforcement agencies and regulatory bodies of incidents based on criteria in the incident response plan and management approval

#### 49. RS.CO-03 — none → substantial (2 levels to close)

- Function / Category: RESPOND / Incident Response Reporting and Communication (RS.CO)
- Outcome: Information is shared with designated internal and external stakeholders
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Securely share information consistent with response plans and information sharing agreements
  2. Voluntarily share information about an attacker's observed TTPs, with all sensitive data removed, with an Information Sharing and Analysis Center (ISAC)
  3. Notify HR when malicious insider activity occurs
  4. Regularly update senior leadership on the status of major incidents
  5. Follow the rules and protocols defined in contracts for incident information sharing between the organization and its suppliers
  6. Coordinate crisis communication methods between the organization and its critical suppliers

#### 50. RS.MA-02 — none → substantial (2 levels to close)

- Function / Category: RESPOND / Incident Management (RS.MA)
- Outcome: Incident reports are triaged and validated
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Preliminarily review incident reports to confirm that they are cybersecurity-related and necessitate incident response activities
  2. Apply criteria to estimate the severity of an incident

#### 51. RS.MA-03 — none → substantial (2 levels to close)

- Function / Category: RESPOND / Incident Management (RS.MA)
- Outcome: Incidents are categorized and prioritized
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Further review and categorize incidents based on the type of incident (e.g., data breach, ransomware, DDoS, account compromise)
  2. Prioritize incidents based on their scope, likely impact, and time-critical nature
  3. Select incident response strategies for active incidents by balancing the need to quickly recover from an incident with the need to observe the attacker or conduct a more thorough investigation

#### 52. RS.MA-04 — none → substantial (2 levels to close)

- Function / Category: RESPOND / Incident Management (RS.MA)
- Outcome: Incidents are escalated or elevated as needed
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Track and validate the status of all ongoing incidents
  2. Coordinate incident escalation or elevation with designated internal and external stakeholders

#### 53. RS.MA-05 — none → substantial (2 levels to close)

- Function / Category: RESPOND / Incident Management (RS.MA)
- Outcome: The criteria for initiating incident recovery are applied
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Apply incident recovery criteria to known and assumed characteristics of the incident to determine whether incident recovery processes should be initiated
  2. Take the possible operational disruption of incident recovery activities into account

#### 54. RS.MI-01 — none → substantial (2 levels to close)

- Function / Category: RESPOND / Incident Mitigation (RS.MI)
- Outcome: Incidents are contained
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Cybersecurity technologies (e.g., antivirus software) and cybersecurity features of other technologies (e.g., operating systems, network infrastructure devices) automatically perform containment actions
  2. Allow incident responders to manually select and perform containment actions
  3. Allow a third party (e.g., internet service provider, managed security service provider) to perform containment actions on behalf of the organization
  4. Automatically transfer compromised endpoints to a remediation virtual local area network (VLAN)

#### 55. RS.MI-02 — none → substantial (2 levels to close)

- Function / Category: RESPOND / Incident Mitigation (RS.MI)
- Outcome: Incidents are eradicated
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Cybersecurity technologies and cybersecurity features of other technologies (e.g., operating systems, network infrastructure devices) automatically perform eradication actions
  2. Allow incident responders to manually select and perform eradication actions
  3. Allow a third party (e.g., managed security service provider) to perform eradication actions on behalf of the organization

#### 56. GV.OV-03 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Oversight (GV.OV)
- Outcome: Organizational cybersecurity risk management performance is evaluated and reviewed for adjustments needed
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Review key performance indicators (KPIs) to ensure that organization-wide policies and procedures achieve objectives
  2. Review key risk indicators (KRIs) to identify risks the organization faces, including likelihood and potential impact
  3. Collect and communicate metrics on cybersecurity risk management with senior leadership

#### 57. GV.RM-01 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Risk Management Strategy (GV.RM)
- Outcome: Risk management objectives are established and agreed to by organizational stakeholders
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Update near-term and long-term cybersecurity risk management objectives as part of annual strategic planning and when major changes occur
  2. Establish measurable objectives for cybersecurity risk management (e.g., manage the quality of user training, ensure adequate risk protection for industrial control systems)
  3. Senior leaders agree about cybersecurity objectives and use them for measuring and managing risk and performance

#### 58. GV.RM-02 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Risk Management Strategy (GV.RM)
- Outcome: Risk appetite and risk tolerance statements are established, communicated, and maintained
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Determine and communicate risk appetite statements that convey expectations about the appropriate level of risk for the organization
  2. Translate risk appetite statements into specific, measurable, and broadly understandable risk tolerance statements
  3. Refine organizational objectives and risk appetite periodically based on known risk exposure and residual risk

#### 59. GV.RM-03 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Risk Management Strategy (GV.RM)
- Outcome: Cybersecurity risk management activities and outcomes are included in enterprise risk management processes
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Aggregate and manage cybersecurity risks alongside other enterprise risks (e.g., compliance, financial, operational, regulatory, reputational, safety)
  2. Include cybersecurity risk managers in enterprise risk management planning
  3. Establish criteria for escalating cybersecurity risks within enterprise risk management

#### 60. GV.RM-04 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Risk Management Strategy (GV.RM)
- Outcome: Strategic direction that describes appropriate risk response options is established and communicated
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Specify criteria for accepting and avoiding cybersecurity risk for various classifications of data
  2. Determine whether to purchase cybersecurity insurance
  3. Document conditions under which shared responsibility models are acceptable (e.g., outsourcing certain cybersecurity functions, having a third party perform financial transactions on behalf of the organization, using public cloud-based services)

#### 61. GV.RM-05 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Risk Management Strategy (GV.RM)
- Outcome: Lines of communication across the organization are established for cybersecurity risks, including risks from suppliers and other third parties
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Determine how to update senior executives, directors, and management on the organization's cybersecurity posture at agreed-upon intervals
  2. Identify how all departments across the organization - such as management, operations, internal auditors, legal, acquisition, physical security, and HR - will communicate with each other about cybersecurity risks

#### 62. GV.RM-06 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Risk Management Strategy (GV.RM)
- Outcome: A standardized method for calculating, documenting, categorizing, and prioritizing cybersecurity risks is established and communicated
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Establish criteria for using a quantitative approach to cybersecurity risk analysis, and specify probability and exposure formulas
  2. Create and use templates (e.g., a risk register) to document cybersecurity risk information (e.g., risk description, exposure, treatment, and ownership)
  3. Establish criteria for risk prioritization at the appropriate levels within the enterprise
  4. Use a consistent list of risk categories to support integrating, aggregating, and comparing cybersecurity risks

#### 63. GV.RM-07 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Risk Management Strategy (GV.RM)
- Outcome: Strategic opportunities (i.e., positive risks) are characterized and are included in organizational cybersecurity risk discussions
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Define and communicate guidance and methods for identifying opportunities and including them in risk discussions (e.g., strengths, weaknesses, opportunities, and threats [SWOT] analysis)
  2. Identify stretch goals and document them
  3. Calculate, document, and prioritize positive risks alongside negative risks

#### 64. GV.RR-01 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Roles, Responsibilities, and Authorities (GV.RR)
- Outcome: Organizational leadership is responsible and accountable for cybersecurity risk and fosters a culture that is risk-aware, ethical, and continually improving
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Leaders (e.g., directors) agree on their roles and responsibilities in developing, implementing, and assessing the organization's cybersecurity strategy
  2. Share leaders' expectations regarding a secure and ethical culture, especially when current events present the opportunity to highlight positive or negative examples of cybersecurity risk management
  3. Leaders direct the CISO to maintain a comprehensive cybersecurity risk strategy and review and update it at least annually and after major events
  4. Conduct reviews to ensure adequate authority and coordination among those responsible for managing cybersecurity risk

#### 65. GV.RR-03 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Roles, Responsibilities, and Authorities (GV.RR)
- Outcome: Adequate resources are allocated commensurate with the cybersecurity risk strategy, roles, responsibilities, and policies
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Conduct periodic management reviews to ensure that those given cybersecurity risk management responsibilities have the necessary authority
  2. Identify resource allocation and investment in line with risk tolerance and response
  3. Provide adequate and sufficient people, process, and technical resources to support the cybersecurity strategy

#### 66. GV.SC-01 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Cybersecurity Supply Chain Risk Management (GV.SC)
- Outcome: A cybersecurity supply chain risk management program, strategy, objectives, policies, and processes are established and agreed to by organizational stakeholders
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Establish a strategy that expresses the objectives of the cybersecurity supply chain risk management program
  2. Develop the cybersecurity supply chain risk management program, including a plan (with milestones), policies, and procedures that guide implementation and improvement of the program, and share the policies and procedures with the organizational stakeholders
  3. Develop and implement program processes based on the strategy, objectives, policies, and procedures that are agreed upon and performed by the organizational stakeholders
  4. Establish a cross-organizational mechanism that ensures alignment between functions that contribute to cybersecurity supply chain risk management, such as cybersecurity, IT, operations, legal, human resources, and engineering

#### 67. GV.SC-03 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Cybersecurity Supply Chain Risk Management (GV.SC)
- Outcome: Cybersecurity supply chain risk management is integrated into cybersecurity and enterprise risk management, risk assessment, and improvement processes
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Identify areas of alignment and overlap with cybersecurity and enterprise risk management
  2. Establish integrated control sets for cybersecurity risk management and cybersecurity supply chain risk management
  3. Integrate cybersecurity supply chain risk management into improvement processes
  4. Escalate material cybersecurity risks in supply chains to senior management, and address them at the enterprise risk management level

#### 68. GV.SC-08 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Cybersecurity Supply Chain Risk Management (GV.SC)
- Outcome: Relevant suppliers and other third parties are included in incident planning, response, and recovery activities
- Assessment rationale: The evidence addresses this topic as stated intent/policy rather than demonstrated operation, so coverage is capped at partial. It is grounded in "incident-response-plan.pdf". Flagged for human confirmation of operational evidence.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Define and use rules and protocols for reporting incident response and recovery activities and the status between the organization and its suppliers
  2. Identify and document the roles and responsibilities of the organization and its suppliers for incident response
  3. Include critical suppliers in incident response exercises and simulations
  4. Define and coordinate crisis communication methods and protocols between the organization and its critical suppliers
  5. Conduct collaborative lessons learned sessions with critical suppliers

#### 69. GV.SC-09 — partial → substantial (1 level to close)

- Function / Category: GOVERN / Cybersecurity Supply Chain Risk Management (GV.SC)
- Outcome: Supply chain security practices are integrated into cybersecurity and enterprise risk management programs, and their performance is monitored throughout the technology product and service life cycle
- Assessment rationale: The evidence in "access-control-standard.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Policies and procedures require provenance records for all acquired technology products and services
  2. Periodically provide risk reporting to leaders about how acquired components are proven to be untampered and authentic
  3. Communicate regularly among cybersecurity risk managers and operations personnel about the need to acquire software patches, updates, and upgrades only from authenticated and trustworthy software providers
  4. Review policies to ensure that they require approved supplier personnel to perform maintenance on supplier products
  5. Policies and procedure require checking upgrades to critical hardware for unauthorized changes

#### 70. ID.AM-03 — partial → substantial (1 level to close)

- Function / Category: IDENTIFY / Asset Management (ID.AM)
- Outcome: Representations of the organization's authorized network communication and internal and external network data flows are maintained
- Assessment rationale: The evidence in "asset-inventory-procedure.docx" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Maintain baselines of communication and data flows within the organization's wired and wireless networks
  2. Maintain baselines of communication and data flows between the organization and third parties
  3. Maintain baselines of communication and data flows for the organization's infrastructure-as-a-service (IaaS) usage
  4. Maintain documentation of expected network ports, protocols, and services that are typically used among authorized systems

#### 71. ID.AM-08 — partial → substantial (1 level to close)

- Function / Category: IDENTIFY / Asset Management (ID.AM)
- Outcome: Systems, hardware, software, services, and data are managed throughout their life cycles
- Assessment rationale: The evidence in "asset-inventory-procedure.docx" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Integrate cybersecurity considerations throughout the life cycles of systems, hardware, software, and services
  2. Integrate cybersecurity considerations into product life cycles
  3. Identify unofficial uses of technology to meet mission objectives (i.e., shadow IT)
  4. Periodically identify redundant systems, hardware, software, and services that unnecessarily increase the organization's attack surface
  5. Properly configure and secure systems, hardware, software, and services prior to their deployment in production
  6. Update inventories when systems, hardware, software, and services are moved or transferred within the organization
  7. Securely destroy stored data based on the organization's data retention policy using the prescribed destruction method, and keep and manage a record of the destructions
  8. Securely sanitize data storage when hardware is being retired, decommissioned, reassigned, or sent for repairs or replacement
  9. Offer methods for destroying paper, storage media, and other physical forms of data storage

#### 72. ID.IM-02 — partial → substantial (1 level to close)

- Function / Category: IDENTIFY / Improvement (ID.IM)
- Outcome: Improvements are identified from security tests and exercises, including those done in coordination with suppliers and relevant third parties
- Assessment rationale: The evidence addresses this topic as stated intent/policy rather than demonstrated operation, so coverage is capped at partial. It is grounded in "incident-response-plan.pdf". Flagged for human confirmation of operational evidence.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Identify improvements for future incident response activities based on findings from incident response assessments (e.g., tabletop exercises and simulations, tests, internal reviews, independent audits)
  2. Identify improvements for future business continuity, disaster recovery, and incident response activities based on exercises performed in coordination with critical service providers and product suppliers
  3. Involve internal stakeholders (e.g., senior executives, legal department, HR) in security tests and exercises as appropriate
  4. Perform penetration testing to identify opportunities to improve the security posture of selected high-risk systems as approved by leadership
  5. Exercise contingency plans for responding to and recovering from the discovery that products or services did not originate with the contracted supplier or partner or were altered before receipt
  6. Collect and analyze performance metrics using security tools and services to inform improvements to the cybersecurity program

#### 73. ID.IM-04 — partial → substantial (1 level to close)

- Function / Category: IDENTIFY / Improvement (ID.IM)
- Outcome: Incident response plans and other cybersecurity plans that affect operations are established, communicated, maintained, and improved
- Assessment rationale: The evidence addresses this topic as stated intent/policy rather than demonstrated operation, so coverage is capped at partial. It is grounded in "incident-response-plan.pdf". Flagged for human confirmation of operational evidence.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Establish contingency plans (e.g., incident response, business continuity, disaster recovery) for responding to and recovering from adverse events that can interfere with operations, expose confidential information, or otherwise endanger the organization's mission and viability
  2. Include contact and communication information, processes for handling common scenarios, and criteria for prioritization, escalation, and elevation in all contingency plans
  3. Create a vulnerability management plan to identify and assess all types of vulnerabilities and to prioritize, test, and implement risk responses
  4. Communicate cybersecurity plans (including updates) to those responsible for carrying them out and to affected parties
  5. Review and update all cybersecurity plans annually or when a need for significant improvements is identified

#### 74. PR.AT-01 — partial → substantial (1 level to close)

- Function / Category: PROTECT / Awareness and Training (PR.AT)
- Outcome: Personnel are provided with awareness and training so that they possess the knowledge and skills to perform general tasks with cybersecurity risks in mind
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Provide basic cybersecurity awareness and training to employees, contractors, partners, suppliers, and all other users of the organization's non-public resources
  2. Train personnel to recognize social engineering attempts and other common attacks, report attacks and suspicious activity, comply with acceptable use policies, and perform basic cyber hygiene tasks (e.g., patching software, choosing passwords, protecting credentials)
  3. Explain the consequences of cybersecurity policy violations, both to individual users and the organization as a whole
  4. Periodically assess or test users on their understanding of basic cybersecurity practices
  5. Require annual refreshers to reinforce existing practices and introduce new practices

#### 75. PR.AT-02 — partial → substantial (1 level to close)

- Function / Category: PROTECT / Awareness and Training (PR.AT)
- Outcome: Individuals in specialized roles are provided with awareness and training so that they possess the knowledge and skills to perform relevant tasks with cybersecurity risks in mind
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Identify the specialized roles within the organization that require additional cybersecurity training, such as physical and cybersecurity personnel, finance personnel, senior leadership, and anyone with access to business-critical data
  2. Provide role-based cybersecurity awareness and training to all those in specialized roles, including contractors, partners, suppliers, and other third parties
  3. Periodically assess or test users on their understanding of cybersecurity practices for their specialized roles
  4. Require annual refreshers to reinforce existing practices and introduce new practices

#### 76. PR.DS-01 — partial → substantial (1 level to close)

- Function / Category: PROTECT / Data Security (PR.DS)
- Outcome: The confidentiality, integrity, and availability of data-at-rest are protected
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Use encryption, digital signatures, and cryptographic hashes to protect the confidentiality and integrity of stored data in files, databases, virtual machine disk images, container images, and other resources
  2. Use full disk encryption to protect data stored on user endpoints
  3. Confirm the integrity of software by validating signatures
  4. Restrict the use of removable media to prevent data exfiltration
  5. Physically secure removable media containing unencrypted sensitive information, such as within locked offices or file cabinets

#### 77. PR.DS-02 — partial → substantial (1 level to close)

- Function / Category: PROTECT / Data Security (PR.DS)
- Outcome: The confidentiality, integrity, and availability of data-in-transit are protected
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Use encryption, digital signatures, and cryptographic hashes to protect the confidentiality and integrity of network communications
  2. Automatically encrypt or block outbound emails and other communications that contain sensitive data, depending on the data classification
  3. Block access to personal email, file sharing, file storage services, and other personal communications applications and services from organizational systems and networks
  4. Prevent reuse of sensitive data from production environments (e.g., customer records) in development, testing, and other non-production environments

#### 78. PR.DS-10 — partial → substantial (1 level to close)

- Function / Category: PROTECT / Data Security (PR.DS)
- Outcome: The confidentiality, integrity, and availability of data-in-use are protected
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Remove data that must remain confidential (e.g., from processors and memory) as soon as it is no longer needed
  2. Protect data in use from access by other users and processes of the same platform

#### 79. PR.PS-06 — partial → substantial (1 level to close)

- Function / Category: PROTECT / Platform Security (PR.PS)
- Outcome: Secure software development practices are integrated, and their performance is monitored throughout the software development life cycle
- Assessment rationale: The evidence in "access-control-standard.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Protect all components of organization-developed software from tampering and unauthorized access
  2. Secure all software produced by the organization, with minimal vulnerabilities in their releases
  3. Maintain the software used in production environments, and securely dispose of software once it is no longer needed

#### 80. DE.AE-02 — partial → substantial (1 level to close)

- Function / Category: DETECT / Adverse Event Analysis (DE.AE)
- Outcome: Potentially adverse events are analyzed to better understand associated activities
- Assessment rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Use security information and event management (SIEM) or other tools to continuously monitor log events for known malicious and suspicious activity
  2. Utilize up-to-date cyber threat intelligence in log analysis tools to improve detection accuracy and characterize threat actors, their methods, and indicators of compromise
  3. Regularly conduct manual reviews of log events for technologies that cannot be sufficiently monitored through automation
  4. Use log analysis tools to generate reports on their findings

#### 81. DE.AE-08 — partial → substantial (1 level to close)

- Function / Category: DETECT / Adverse Event Analysis (DE.AE)
- Outcome: Incidents are declared when adverse events meet the defined incident criteria
- Assessment rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Apply incident criteria to known and assumed characteristics of activity in order to determine whether an incident should be declared
  2. Take known false positives into account when applying incident criteria

#### 82. DE.CM-01 — partial → substantial (1 level to close)

- Function / Category: DETECT / Continuous Monitoring (DE.CM)
- Outcome: Networks and network services are monitored to find potentially adverse events
- Assessment rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Monitor DNS, BGP, and other network services for adverse events
  2. Monitor wired and wireless networks for connections from unauthorized endpoints
  3. Monitor facilities for unauthorized or rogue wireless networks
  4. Compare actual network flows against baselines to detect deviations
  5. Monitor network communications to identify changes in security postures for zero trust purposes

#### 83. DE.CM-02 — partial → substantial (1 level to close)

- Function / Category: DETECT / Continuous Monitoring (DE.CM)
- Outcome: The physical environment is monitored to find potentially adverse events
- Assessment rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Monitor logs from physical access control systems (e.g., badge readers) to find unusual access patterns (e.g., deviations from the norm) and failed access attempts
  2. Review and monitor physical access records (e.g., from visitor registration, sign-in sheets)
  3. Monitor physical access controls (e.g., locks, latches, hinge pins, alarms) for signs of tampering
  4. Monitor the physical environment using alarm systems, cameras, and security guards

#### 84. DE.CM-03 — partial → substantial (1 level to close)

- Function / Category: DETECT / Continuous Monitoring (DE.CM)
- Outcome: Personnel activity and technology usage are monitored to find potentially adverse events
- Assessment rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Use behavior analytics software to detect anomalous user activity to mitigate insider threats
  2. Monitor logs from logical access control systems to find unusual access patterns and failed access attempts
  3. Continuously monitor deception technology, including user accounts, for any usage

#### 85. DE.CM-06 — partial → substantial (1 level to close)

- Function / Category: DETECT / Continuous Monitoring (DE.CM)
- Outcome: External service provider activities and services are monitored to find potentially adverse events
- Assessment rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Monitor remote and onsite administration and maintenance activities that external providers perform on organizational systems
  2. Monitor activity from cloud-based services, internet service providers, and other service providers for deviations from expected behavior

#### 86. DE.CM-09 — partial → substantial (1 level to close)

- Function / Category: DETECT / Continuous Monitoring (DE.CM)
- Outcome: Computing hardware and software, runtime environments, and their data are monitored to find potentially adverse events
- Assessment rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Monitor email, web, file sharing, collaboration services, and other common attack vectors to detect malware, phishing, data leaks and exfiltration, and other adverse events
  2. Monitor authentication attempts to identify attacks against credentials and unauthorized credential reuse
  3. Monitor software configurations for deviations from security baselines
  4. Monitor hardware and software for signs of tampering
  5. Use technologies with a presence on endpoints to detect cyber health issues (e.g., missing patches, malware infections, unauthorized software), and redirect the endpoints to a remediation environment before access is authorized

#### 87. RS.MA-01 — partial → substantial (1 level to close)

- Function / Category: RESPOND / Incident Management (RS.MA)
- Outcome: The incident response plan is executed in coordination with relevant third parties once an incident is declared
- Assessment rationale: The evidence addresses this topic as stated intent/policy rather than demonstrated operation, so coverage is capped at partial. It is grounded in "incident-response-plan.pdf". Flagged for human confirmation of operational evidence.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Detection technologies automatically report confirmed incidents
  2. Request incident response assistance from the organization's incident response outsourcer
  3. Designate an incident lead for each incident
  4. Initiate execution of additional cybersecurity plans as needed to support incident response (for example, business continuity and disaster recovery)

### Low priority (8)

#### 88. RC.CO-03 — none → substantial (2 levels to close)

- Function / Category: RECOVER / Incident Recovery Communication (RC.CO)
- Outcome: Recovery activities and progress in restoring operational capabilities are communicated to designated internal and external stakeholders
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Securely share recovery information, including restoration progress, consistent with response plans and information sharing agreements
  2. Regularly update senior leadership on recovery status and restoration progress for major incidents
  3. Follow the rules and protocols defined in contracts for incident information sharing between the organization and its suppliers
  4. Coordinate crisis communication between the organization and its critical suppliers

#### 89. RC.CO-04 — none → substantial (2 levels to close)

- Function / Category: RECOVER / Incident Recovery Communication (RC.CO)
- Outcome: Public updates on incident recovery are shared using approved methods and messaging
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Follow the organization's breach notification procedures for recovering from a data breach incident
  2. Explain the steps being taken to recover from the incident and to prevent a recurrence

#### 90. RC.RP-02 — none → substantial (2 levels to close)

- Function / Category: RECOVER / Incident Recovery Plan Execution (RC.RP)
- Outcome: Recovery actions are selected, scoped, prioritized, and performed
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Select recovery actions based on the criteria defined in the incident response plan and available resources
  2. Change planned recovery actions based on a reassessment of organizational needs and resources

#### 91. RC.RP-03 — none → substantial (2 levels to close)

- Function / Category: RECOVER / Incident Recovery Plan Execution (RC.RP)
- Outcome: The integrity of backups and other restoration assets is verified before using them for restoration
- Assessment rationale: The retrieved evidence does not demonstrate this outcome; relevant terms are absent or only incidental. Flagged for human review.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Check restoration assets for indicators of compromise, file corruption, and other integrity issues before use

#### 92. RC.RP-01 — partial → substantial (1 level to close)

- Function / Category: RECOVER / Incident Recovery Plan Execution (RC.RP)
- Outcome: The recovery portion of the incident response plan is executed once initiated from the incident response process
- Assessment rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Begin recovery procedures during or after incident response processes
  2. Make all individuals with recovery responsibilities aware of the plans for recovery and the authorizations required to implement each aspect of the plans

#### 93. RC.RP-04 — partial → substantial (1 level to close)

- Function / Category: RECOVER / Incident Recovery Plan Execution (RC.RP)
- Outcome: Critical mission functions and cybersecurity risk management are considered to establish post-incident operational norms
- Assessment rationale: The evidence in "information-security-policy.md" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Use business impact and system categorization records (including service delivery objectives) to validate that essential services are restored in the appropriate order
  2. Work with system owners to confirm the successful restoration of systems and the return to normal operations
  3. Monitor the performance of restored systems to verify the adequacy of the restoration

#### 94. RC.RP-05 — partial → substantial (1 level to close)

- Function / Category: RECOVER / Incident Recovery Plan Execution (RC.RP)
- Outcome: The integrity of restored assets is verified, systems and services are restored, and normal operating status is confirmed
- Assessment rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Check restored assets for indicators of compromise and remediation of root causes of the incident before production use
  2. Verify the correctness and adequacy of the restoration actions taken before putting a restored system online

#### 95. RC.RP-06 — partial → substantial (1 level to close)

- Function / Category: RECOVER / Incident Recovery Plan Execution (RC.RP)
- Outcome: The end of incident recovery is declared based on criteria, and incident-related documentation is completed
- Assessment rationale: The evidence in "incident-response-plan.pdf" shows the outcome is at least partly achieved in operation (lexical overlap with the outcome statement). A human should confirm scope and completeness.
- Suggested actions (NIST CSF 2.0 Implementation Examples):
  1. Prepare an after-action report that documents the incident itself, the response and recovery actions taken, and lessons learned
  2. Declare the end of incident recovery once the criteria are met

## At or above target (10)

### GOVERN

- **GV.OC-02** — substantial (target: substantial)
- **GV.OV-01** — substantial (target: substantial)
- **GV.OV-02** — substantial (target: substantial)
- **GV.PO-01** — full (target: substantial)
- **GV.PO-02** — substantial (target: substantial)
- **GV.RR-02** — full (target: substantial)
- **GV.SC-02** — substantial (target: substantial)

### IDENTIFY

- **ID.AM-01** — full (target: substantial)
- **ID.AM-02** — full (target: substantial)
- **ID.AM-07** — substantial (target: substantial)

## Out of scope — not-applicable (1)

Marked not-applicable in the target profile; excluded from the met/unmet figures above.

- **PR.AA-06** — Physical access to assets is managed, monitored, and enforced commensurate with risk _(reason: Fully remote organization; no physical facilities beyond a registered address.)_

---

The current-coverage side of this plan comes from the reviewed assessment (see gap-analysis.md and current-profile.json); every coverage level above "none" is anchored to quotes verified verbatim against the source documents. Items marked UNREVIEWED or STALE still require human validation.
