# ADR 0009: TOTP and one-time recovery foundation

Status: Implemented and tested for synthetic development.

Use the maintained java-otp library for TOTP generation/verification, AES-GCM with an externally supplied 32-byte key for secret storage, and transactional timestep consumption to reject replay. Enrollment requires current password proof and a separately confirmed TOTP. Generate eight cryptographically random recovery codes, show them once and store only SHA-256 hashes. A recovery code resets password and MFA and invalidates every recovery code and session.

Session revocation metadata lives in the database and is checked at each protected request. Servlet sessions remain process-local; restarting the server requires login and horizontal deployment needs a maintained shared session/identity integration. Absolute session lifetime is 15 minutes. No weak demographic recovery is offered.

Four HTTP identity tests passed in the full eight-test backend package run. Distributed throttling, notifications, KMS rotation, external identity verification and production OIDC remain additional controls. TOTP is not phishing-resistant; passkeys are a separate capability and preferred for high-assurance use. Missing encryption configuration fails MFA enrollment closed.
