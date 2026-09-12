# Cross-platform product changes

The user explicitly requested that changes apply everywhere, not only to the currently open client.

- For every user-facing change, inspect `apps/web`, `apps/mobile`, and the shared backend/API contract. Implement equivalent behavior on both supported clients using platform-appropriate controls.
- Preserve patient/doctor role separation and server-enforced consent. A selected login tab never grants a role.
- Verify cross-client continuity for shared persisted workflows, plus applicable navigation, accessibility, permissions and stale-write handling.
- Update the parity matrix and verification evidence. State any real platform limitation explicitly; do not claim native device testing from JavaScript exports or browser-harness tests.
- Preserve the synthetic-only development boundary and existing security/data-storage policy.

# Repository maintenance
The owner authorized routine README, setup, configuration example and screenshot updates when completing project requests. Keep documentation accurate and verify relevant changes. Preserve existing work and commit history; check for credentials and private data before pushing. This authorization covers requested project maintenance, not unrelated publication or messages to others.
