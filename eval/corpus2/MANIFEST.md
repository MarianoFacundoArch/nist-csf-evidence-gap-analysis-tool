# Evaluation Corpus 2 — NYS ITS Information Security Policy Suite

## Organization

**New York State Office of Information Technology Services (NYS ITS), Chief
Information Security Office (CISO).** NYS ITS publishes the statewide
information security policy and its supporting standards for all New York
State entities at <https://its.ny.gov/policies>. All documents below are
authored and published by NYS ITS on its official `.gov` domain.

These are real, independently-authored organizational policy documents — not
NIST publications and not authored by this project. They are used here solely
as research-evaluation inputs for assessing one organization's documentation
against NIST CSF 2.0. The files are **not redistributed** beyond this research
artifact; use `fetch.sh` in this directory to re-download them from the
official source.

- **Download date:** 2026-06-10
- **Format:** 12 native (text-layer) PDFs, 163 pages total, ~47,500 words
- **Parse check:** `node bin/csf-tool.js ingest --docs eval/corpus2/docs
  --embed-provider mock --work-dir /tmp/corpus2-check` →
  `12 parsed, 0 skipped, 0 failed` (376 chunks)

## Documents

| File | Doc No. | Title | Last updated | Pages | Words | Source URL (PDF) |
|---|---|---|---|---:|---:|---|
| `nys-p03-002-information-security-policy.pdf` | NYS-P03-002 | Information Security Policy | 02/02/2025 | 23 | 6,618 | <https://its.ny.gov/system/files/documents/2025/02/nys-p03-002-information-security_1.pdf> |
| `nys-p14-001-acceptable-use-of-it-resources.pdf` | NYS-P14-001 | Acceptable Use of Information Technology (IT) Resources Policy | 01/05/2023 | 9 | 2,777 | <https://its.ny.gov/system/files/documents/2023/03/nys-p14-001-acceptable-use-of-information-technology-resources.pdf> |
| `nys-s13-003-sanitization-secure-disposal.pdf` | NYS-S13-003 | Sanitization/Secure Disposal Standard | 06/10/2025 | 27 | 9,451 | <https://its.ny.gov/system/files/documents/2025/06/nys-s13-003-sanitization-secure-disposal-standard.pdf> |
| `nys-s13-005-cyber-incident-response.pdf` | NYS-S13-005 | Cyber Incident Response Standard | 11/03/2023 | 22 | 5,991 | <https://its.ny.gov/system/files/documents/2023/11/nys-s13-005-cyber-incident-response_0.pdf> |
| `nys-s14-001-information-security-risk-management.pdf` | NYS-S14-001 | Information Security Risk Management Standard | 04/23/2024 | 15 | 4,360 | <https://its.ny.gov/system/files/documents/2024/04/nys-s14-001-information-security-risk-management_0.pdf> |
| `nys-s14-002-information-classification.pdf` | NYS-S14-002 | Information Classification Standard | 04/08/2025 | 20 | 5,529 | <https://its.ny.gov/system/files/documents/2025/04/nys-s14-002-information-classification-standard.pdf> |
| `nys-s14-005-security-logging.pdf` | NYS-S14-005 | Security Logging Standard | 06/27/2024 | 7 | 1,827 | <https://its.ny.gov/system/files/documents/2024/07/nys-s14-005-security-logging.pdf> |
| `nys-s14-007-encryption.pdf` | NYS-S14-007 | Encryption Standard | 03/05/2025 | 12 | 3,576 | <https://its.ny.gov/system/files/documents/2025/06/nys-s14-007-encryption.pdf> |
| `nys-s14-009-mobile-device-security.pdf` | NYS-S14-009 | Mobile Device Security Standard | 08/18/2025 | 5 | 1,204 | <https://its.ny.gov/system/files/documents/2025/08/nys-s14-009-mobile-device-security.pdf> |
| `nys-s14-010-remote-access.pdf` | NYS-S14-010 | Remote Access Standard | 08/18/2025 | 5 | 1,291 | <https://its.ny.gov/system/files/documents/2025/08/nys-s14-010-remote-access.pdf> |
| `nys-s14-013-account-management-access-control.pdf` | NYS-S14-013 | Account Management / Access Control Standard | 02/13/2024 | 11 | 3,510 | <https://its.ny.gov/system/files/documents/2024/02/nys-s14-013-account-management-access-control-standard.pdf> |
| `nys-s15-001-patch-management.pdf` | NYS-S15-001 | Patch Management Standard | 04/29/2025 | 7 | 1,352 | <https://its.ny.gov/system/files/documents/2025/05/nys-s15-001-patch-management-standard_0.pdf> |

Page counts are from the PDF text layer (max page index reported by the
parser); word counts are raw extracted-text word counts.

## Stable landing pages

The dated `system/files/...` URLs above change when NYS ITS revises a
document. These landing pages are stable and always link to the current PDF:

| Doc No. | Landing page |
|---|---|
| NYS-P03-002 | <https://its.ny.gov/information-security-policy> |
| NYS-P14-001 | <https://its.ny.gov/acceptable-use-information-technology-it-resources> |
| NYS-S13-003 | <https://its.ny.gov/sanitization-secure-disposal> |
| NYS-S13-005 | <https://its.ny.gov/cyber-incident-response> |
| NYS-S14-001 | <https://its.ny.gov/information-security-risk-management> |
| NYS-S14-002 | <https://its.ny.gov/information-classification> |
| NYS-S14-005 | <https://its.ny.gov/security-logging> |
| NYS-S14-007 | <https://its.ny.gov/encryption> |
| NYS-S14-009 | <https://its.ny.gov/mobile-device-security> |
| NYS-S14-010 | <https://its.ny.gov/remote-access> |
| NYS-S14-013 | <https://its.ny.gov/account-management-access-control-standard> |
| NYS-S15-001 | <https://its.ny.gov/patch-management> |

## SHA-256 checksums (as downloaded 2026-06-10)

```
e2b82e253a50a2a5f5c3d57849d43511a4ba40982b3ff7c80655608e0562b089  nys-p03-002-information-security-policy.pdf
f6177cc23d52f4e053e4bd890861ce6e2ce9b2ebc4e33ddecf445b14f65ba310  nys-p14-001-acceptable-use-of-it-resources.pdf
7ab1a6ba6d3a88a54dc086888fd06842211e8e0fc3a8d7caab4937bb0bd8fb54  nys-s13-003-sanitization-secure-disposal.pdf
aca6cdff6ca8424ca7f9fd0bc15f70cede69139947db20699709d283f76069c3  nys-s13-005-cyber-incident-response.pdf
a816e396bdcdebdef7beddef8bec599a759f37e45d4cc550e294d5d4f6a647ae  nys-s14-001-information-security-risk-management.pdf
b696a6eb7258357fc0c102da088cd8cfe6eb3006d0ed3cf4e60212995774e4b7  nys-s14-002-information-classification.pdf
ab8fb98d419b4bd4d6f974a172d518ec22f01544b55641002ef42891c28a3361  nys-s14-005-security-logging.pdf
d0276f071b49f1bc4eaf352279db8c4fdb4fd21bc3f0b30c6a3d572bd0fd68dd  nys-s14-007-encryption.pdf
01b0ca73a3cd1938586afc90f3431658083e53fbfacaec0f9936cd3357608bd9  nys-s14-009-mobile-device-security.pdf
b3c4a5b16e66f3be6d6531e0fd6233c6777ec52247362928764c7302dc91116b  nys-s14-010-remote-access.pdf
b39587a3ad7682538f121aee5453b8cb3a6567f66ac9506930c91b98da9abffc  nys-s14-013-account-management-access-control.pdf
2da2778facae48bcf5f7e55719bbabd298247a5c0ffd90a34ffe68466608ebc5  nys-s15-001-patch-management.pdf
```

## Why this corpus

- **One real organization** with a coherent, internally cross-referencing
  policy suite (the Information Security Policy NYS-P03-002 is the umbrella
  document; the standards implement it), matching the experiment's premise of
  assessing a single organization against NIST CSF 2.0.
- **Genuine PDF extraction noise:** running headers/footers ("State Capitol
  P.O. Box 2062 Albany, NY 12220-0062 www.its.ny.gov"), page-number footers
  with split glyphs (e.g. "NYS - S1 3 - 00 3 Page 1 of 27"), revision-history
  tables, and TrueType font warnings during parsing — real-world ingestion
  conditions rather than clean synthetic text.
- **Topical spread across CSF 2.0 functions:** governance/policy (GV),
  risk management and classification (ID), access control, encryption,
  remote access, mobile, sanitization, patching, AUP (PR), logging (DE),
  and incident response (RS/RC).
