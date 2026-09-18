#!/usr/bin/env bash
# Fetch script for eval corpus 2: New York State Office of Information
# Technology Services (NYS ITS) — Chief Information Security Office
# information security policy & standards suite.
#
# These are publicly published documents served from the organization's
# official .gov domain (https://its.ny.gov/policies). This script exists so
# the corpus can be reproduced without redistributing the files.
#
# Note: NYS ITS occasionally re-publishes documents under new dated paths
# when a policy is revised. If a URL 404s, visit the landing page listed in
# MANIFEST.md (the landing-page URLs are stable) and update the file URL.
#
# Downloaded: 2026-06-10

set -euo pipefail
cd "$(dirname "$0")/docs"

fetch() { echo "-> $2"; curl -sfL -o "$2" "$1"; }

fetch "https://its.ny.gov/system/files/documents/2025/02/nys-p03-002-information-security_1.pdf" \
      "nys-p03-002-information-security-policy.pdf"
fetch "https://its.ny.gov/system/files/documents/2023/03/nys-p14-001-acceptable-use-of-information-technology-resources.pdf" \
      "nys-p14-001-acceptable-use-of-it-resources.pdf"
fetch "https://its.ny.gov/system/files/documents/2025/06/nys-s13-003-sanitization-secure-disposal-standard.pdf" \
      "nys-s13-003-sanitization-secure-disposal.pdf"
fetch "https://its.ny.gov/system/files/documents/2023/11/nys-s13-005-cyber-incident-response_0.pdf" \
      "nys-s13-005-cyber-incident-response.pdf"
fetch "https://its.ny.gov/system/files/documents/2024/04/nys-s14-001-information-security-risk-management_0.pdf" \
      "nys-s14-001-information-security-risk-management.pdf"
fetch "https://its.ny.gov/system/files/documents/2025/04/nys-s14-002-information-classification-standard.pdf" \
      "nys-s14-002-information-classification.pdf"
fetch "https://its.ny.gov/system/files/documents/2024/07/nys-s14-005-security-logging.pdf" \
      "nys-s14-005-security-logging.pdf"
fetch "https://its.ny.gov/system/files/documents/2025/06/nys-s14-007-encryption.pdf" \
      "nys-s14-007-encryption.pdf"
fetch "https://its.ny.gov/system/files/documents/2025/08/nys-s14-009-mobile-device-security.pdf" \
      "nys-s14-009-mobile-device-security.pdf"
fetch "https://its.ny.gov/system/files/documents/2025/08/nys-s14-010-remote-access.pdf" \
      "nys-s14-010-remote-access.pdf"
fetch "https://its.ny.gov/system/files/documents/2024/02/nys-s14-013-account-management-access-control-standard.pdf" \
      "nys-s14-013-account-management-access-control.pdf"
fetch "https://its.ny.gov/system/files/documents/2025/05/nys-s15-001-patch-management-standard_0.pdf" \
      "nys-s15-001-patch-management.pdf"

echo "Done. $(ls -1 *.pdf | wc -l | tr -d ' ') PDFs fetched."
