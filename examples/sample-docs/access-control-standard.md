# Northwind Analytics — Access Control Standard

_Fictitious document for demonstration purposes only._

## 1. Identity and Credential Management

Every authorized user, service account, and managed device is issued a unique
identity. Identities and credentials are managed throughout their lifecycle by
the IT team: accounts are provisioned through a ticketed request, credentials
are issued only after manager approval, and accounts are disabled within 24
hours of an employee's departure. Multi-factor authentication is enforced for
all remote access and for all administrative accounts.

## 2. Access Permissions and Authorization

Access permissions, entitlements, and authorizations are defined in this policy,
managed through role-based access control (RBAC), and enforced by our identity
provider. Access is granted according to the principle of least privilege:
users receive only the permissions required for their role. Incompatible duties
are separated so that no single person can both request and approve privileged
access (separation of duties).

## 3. Access Reviews

Access permissions are reviewed every quarter. During each quarterly access
review, system owners certify the list of users and their entitlements, and the
review results are recorded in the access-review log. The most recent review,
completed in March, removed 14 stale accounts and corrected 3 over-privileged
roles.

## 4. Privileged Access

Privileged access requests must be approved by the system owner before
provisioning and are logged in the privileged-access register.
