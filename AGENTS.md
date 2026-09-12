# Cross-platform product changes

The user explicitly requested that changes apply everywhere, not only to the currently open client.

- For every user-facing change, inspect `apps/web`, `apps/mobile`, and the shared backend/API contract. Implement equivalent behavior on both supported clients using platform-appropriate controls.
- Preserve patient/doctor role separation and server-enforced consent. A selected login tab never grants a role.
- Verify cross-client continuity for shared persisted workflows, plus applicable navigation, accessibility, permissions and stale-write handling.
- Update the parity matrix and verification evidence. State any real platform limitation explicitly; do not claim native device testing from JavaScript exports or browser-harness tests.
- Preserve the synthetic-only development boundary and existing security/data-storage policy.

# README approval
The user requested an initial illustrated local setup/use/deployment README with the profile-photo revision. That initial guide is authorized. For subsequent feature changes, ask before modifying README files; complete other authorized implementation and verification while awaiting that documentation approval. Do not interpret this as requiring approval for code changes.
