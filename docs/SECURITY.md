# Security controls and release boundary

**Synthetic development use only until production gates are satisfied.** This is a security design and review checklist, not a certification. No real clinical data or real patient accounts should be introduced into a development preview.

## Required controls
Authentication: maintained OIDC provider, authorization-code/PKCE, phishing-resistant MFA for clinicians/admins, short-lived sessions, refresh rotation, revocation and recovery with strong proof. Browser sessions use HttpOnly Secure SameSite cookies with CSRF protection when cookie-authenticated. Native tokens use OS-protected storage. Development identity shortcuts must never be accepted in production.

Authorization: deny by default on every protected request; trust no client role, patient ID, purpose or category. A Health ID must not be an access token. Apply BOLA checks after resolving the actual resource owner, not only the path patient. Labs see assigned orders, pharmacy sees necessary prescriptions, administrators see administrative state. Consent expiry/revocation checks precede every disclosure. Nested/export/download routes receive equal protection.

Data: TLS at the edge and internal links as risk requires; KMS-backed envelope encryption, rotation, scoped secrets and private object buckets. Do not log tokens, passwords, clinical narratives or full request bodies. Use parameterized database access and server-side bounds. Clinical text renders as text; no untrusted HTML. Uploads require quarantine, content-type verification, scanning and authorized retrieval.

Audit: append sensitive success/denial events and permission changes with actor, organization, subject/resource, purpose, policy basis, session, time and outcome. Hash chaining is useful but insufficient against a database administrator who can rewrite the chain. Use independently protected checkpoints/retention-locked storage and monitor gaps.

## Abuse-case verification
Test unauthenticated/forged/expired sessions, Patient A→B, clinician without consent, revoked/expired/category mismatch, lab unrelated order, pharmacy unrelated timeline, admin clinical read, mass-assigned author/role, replayed dispense, concurrent supply use, XSS strings, SQL metacharacters, CSRF where applicable, upload traversal/SSRF, brute-force/rate limits and protected export routes. Broader OWASP review and an independent penetration test remain required.

## Vulnerability handling
Never include patient data in issues. Record affected build, reproduction using synthetic data, severity, exploit prerequisites, remediation owner and verification. Critical/high unresolved defects block live deployment. Revoke compromised credentials, contain access and preserve forensic evidence before restoration. Do not publish exploit details before coordinated remediation.

## Evidence discipline
Automated access-control tests demonstrate specific cases only. Source review cannot certify production transport, cloud isolation, native keychain behavior or recovery. TESTING records executed checks and missing evidence. COMPLIANCE describes external review. OPERATIONS describes incident and restore gates.

## Current implemented identity controls and gaps
The backend uses BCrypt accounts, CSRF tokens, session-ID rotation, a database session revocation registry and process-local failed-attempt limits. Synthetic registration generates a random public Health ID. TOTP enrollment requires password reauthentication and a separate confirmation; TOTP material is AES-GCM encrypted with an externally supplied key. Consumed time steps prevent replay. Eight random recovery codes are shown once, stored hashed, and recovery invalidates all codes and sessions. Identity HTTP tests cover enrollment, missing/replayed MFA, recovery replay, session ownership/revocation, encrypted material and a standard TOTP vector.

Passkeys use the maintained Yubico library with RP/origin/challenge/user-verification checks and one-time session-bound challenges. Non-demo staff password login requires enrolled TOTP by default; passkey authentication is a separate strong-auth route. Organization-scoped practitioner verification/suspension is enforced on protected access; suspension revokes existing grants/sessions. OIDC, external credential-validation integrations, notifications and distributed attempt limits remain incomplete. Registry persistence does not make servlet sessions distributed or durable: restart requires login. The 15-minute session expiry is absolute. Key rotation needs a migration strategy; no automated KMS lifecycle is provided. Password creation is bounded by BCrypt’s 72-byte UTF-8 limit; unknown-user login performs dummy BCrypt work to reduce trivial timing enumeration.

Structured prescription/order controls now include recipient assignment, supply checks and idempotent dispensing; they remain synthetic and do not validate clinical appropriateness or legal prescribing. Audit events are locally hash-linked but lack independent anchoring and full SRS metadata. These remain live-release gaps.

## Dependency and source scan
See SECURITY_SCAN.md and evidence artifacts for the exact Maven/OSV scan, upgrades and review coverage. A zero-match vulnerability scan is limited to the database and package versions queried; it is not proof that the application or dependencies are fully secure.
