# Global Health Passport — project source of truth

## Authority and status
The user supplied the 46-section master specification and approved proceeding through all phases without intermediate approvals on 2026-09-10. That overrides the original stop-after-each-phase workflow, not the requirement for evidence or external legal/clinical validation. The original specification is retained in `docs/MASTER_REQUIREMENTS.md`.

Current status: implementation in progress. This document distinguishes implemented controls from planned controls. No live-patient release is authorized by technical completion alone. Development uses synthetic data only. Unresolved launch market, controller/processor roles, contracts, budget and real integration partners are external decisions.

## Product and scope
Longitudinal, provenance-preserving patient record with permanent cryptographically random Health ID, patient-controlled sharing, verified professional workflows, laboratory and pharmacy workflows, FHIR exchange, mobile access, auditable amendments and future governed case retrieval and AI.

Initial engineering scope: adult self-managed outpatient workflows. Preserve the complete specification as the long-term requirements baseline. Minors, guardians, production prescribing networks, full hospital management, production DICOM viewers, insurance adjudication, real de-identification and clinically validated AI must not be presented as implemented unless supported by evidence.

## Decisions
- Java + Spring Boot modular backend, PostgreSQL deployment target, H2 synthetic local/test profile. H2 tests are not PostgreSQL validation.
- React and TypeScript web. Sites starter uses Vinext, a Next-compatible build layer; this beta runtime is a development dependency and requires review before any production release. Clinical authority remains in Java backend, never client JavaScript.
- React Native / Expo mobile; OS-protected secret storage and explicit native-device validation requirement.
- Public Health ID independent of internal primary keys, random, immutable, non-reassigned. Public identifier knowledge conveys no authorization.
- API `/api/`; secure server sessions, CSRF on browser mutations, no clinical records or authentication tokens in browser localStorage. Only theme preferences may be stored there.
- Explicit authorization per operation: role + actor organization + patient grant + purpose + resource scope + time. Deny by default. Admin does not imply clinical authority.
- Preserve original records and author/source; amendments retain lineage. Patient-entered records visibly distinct.
- Audit trail contains necessary metadata, not copied clinical payloads. Hash linking is tamper-evident only within its documented threat assumptions; independent anchoring required for hostile privileged operators.
- FHIR R4 bounded export/mapping; do not claim full FHIR server conformance or R4B compatibility without profile and validator evidence.
- Responsive semantic interface; light/dark tokens, 8px card radius, keyboard focus, WCAG 2.2 AA target.
- Independent regional deployments are a future production decision. No assumptions of universal lawful sharing, retention, or erasure.

## Naming, folders and quality
Repository structure: `apps/backend`, `apps/web`, `apps/mobile`, `docs`, `ADRs`, `tests`, `infra`, `scripts`. Java domains use explicit resource DTOs and service authorization. APIs use opaque resource IDs and structured errors. Timestamps carry offsets and are normalized to UTC; clinical effective date is distinct from recorded timestamp. Clinical codes preserve system and code; units preserve original representation.

Requirements must trace PRD → SRS → test/evidence. Run builds, API/integration tests, negative access-control tests, migration checks, web E2E, accessibility checks and scans where tooling permits. Report unsupported/native/cloud/legal tests as NOT VERIFIED. Synthetic seed only; no committed passwords or credentials. Logical Git commits preserve recoverability.

## Open external decisions
1. Launch country/state and responsible legal entities.
2. Provider-sponsored versus direct-to-consumer contracts and obligations.
3. Real EHR/lab/pharmacy counterparties, licensing and credentials.
4. Operational budget, SLO approval, deployment cloud, retention and residency.
5. Clinical safety officer, security review and legal/privacy reviewers.

## Completed functionality
None verified yet. Updated at integration handoff with actual evidence.

## Remaining functionality
Full master specification remains tracked in PRD/SRS; implementation status and limitations will be updated from executed test reports. Real production credentials, contractual/legal approval, native app signing and device testing are not inferable from available tools.
