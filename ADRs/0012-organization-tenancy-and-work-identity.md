# ADR 0012 — Organization tenancy and separate work identities

Decision: extend the existing modular monolith with stable organization IDs, composite tenant hierarchy relationships, separate work-account employment records and role-limited clinical privileges. Organization onboarding begins pending and platform review is separate from hospital administration. A verified parent healthcare group does not inherit child-facility data. Work IDs are identifiers only.

Reason: retain existing records/consent/identity workflows while closing the old string-only tenant boundary. Map detailed professional identities onto conservative existing permission ceilings; grant narrower permissions explicitly. Signed record authorship survives offboarding.

Consequences: tenant isolation remains application-enforced in a shared database; no physical/RLS isolation claim. One employment per work account is supported. Moving jobs creates a separate work identity rather than moving historical authorship. External institutional/license validation and secure initial MFA provisioning remain release integrations.
