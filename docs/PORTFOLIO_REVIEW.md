# Portfolio review

Review date: September 11, 2026 (America/New_York).

## Contribution and history

Abhijith Viswanathan directed the original project using AI. The initial local Git history was preserved, and existing uncommitted platform revisions were captured separately before portfolio edits. The portfolio task then reviewed the architecture and implemented modules, documented the project for a new reader, ran verification and corrected a timezone-sensitive eligibility test. This does not establish independent implementation proficiency, production use or external clinical validation.

## Review coverage

The review surveyed the Java API and service boundaries, persistence/migrations, authentication and consent, provenance, clinician/care workflows, organization and workforce management, structured clinical execution, insurance separation, documents/photos, notification events, bounded FHIR/learning features, web routes/components, mobile models and configuration, setup scripts, tests and existing evidence. It is a repository survey with focused code inspection and automated checks, not a line-by-line security audit.

## Changes made during the portfolio task

- Rewrote the root README around the full platform, portable setup, synthetic screenshots, architecture and accurate boundaries.
- Injected a UTC-normalized Clock into the synthetic eligibility adapter and added deterministic boundary cases. The original test mixed the host's local day with the application's UTC day and failed around midnight UTC. The default application clock remains UTC.
- Preserved existing history and local feature work while excluding local secrets, databases, generated runtimes and unrelated files from the publication snapshot.

This clock/test change does not alter the shared UI/API contract. No client parity change is needed for it.

## Verification performed in this task

| Check | Result |
|---|---|
| Java 21 Maven verify on publication checkout | Passed: 94 discovered, 63 executed successfully, 31 optional PostgreSQL cases skipped |
| Web clean dependency installation | Passed: 701 packages installed from the lockfile using the local package cache |
| Web TypeScript and lint | Passed; repeated on publication checkout |
| Web production build | Passed on publication checkout: vinext static export, three routes prerendered |
| Mobile TypeScript and unit tests | Passed: 18 tests on original source, identical to the copied mobile source |
| New portfolio code secret-pattern scan | Passed selected credential patterns and sensitive filename checks |
| Health source and historical Git blobs | 513 historical blobs scanned; no match for the selected credential patterns |

The scan is a useful check, not proof that every possible secret or privacy issue is absent. Displayed screenshot patient names are traceable to fictional showcase fixtures.

The root one-command launch was inspected but not replayed end to end in a fresh environment during this review. Backend packaging and web dependency installation/build are separate checks. Native device builds, browser end-to-end suites, Docker, PostgreSQL and restoration were not repeated here. Existing reports under docs/evidence and earlier delivery reports are historical evidence and retain their own dates and limitations.

## Engineering discussion

**Access control:** client-selected portals do not grant roles. Explain how identity, employment/privileges and patient consent constrain a request before data is returned. Trace one grant, record read and revocation in the API and test suite.

**One shared backend:** a modular monolith keeps cross-role transactions and consent decisions together. The tradeoff is tighter coupling and a need for disciplined boundaries as the code grows; microservices would add distributed failures and operational cost.

**Data provenance:** records retain author/source metadata and history. Discuss why amending an existing clinical statement should retain its origin, and how stale writes are detected rather than silently overwriting another edit.

**Workflow state:** orders, results, review and dispensing have distinct actors and transitions. Walk through an invalid transition or insufficient scope, including the backend rejection and client error handling.

**Storage and migrations:** H2 simplifies a demonstration; it does not substitute for PostgreSQL verification. Versioned migrations preserve schema history. Encrypted blobs require coordinated backup of database records, files and keys.

**Timezone failure:** the test once assumed tomorrow in the host timezone was tomorrow in UTC. An injected clock makes the reference day reproducible. The tests cover future, effective, expired and boundary-day policies using fictional insurance only.

**AI contribution:** a truthful introduction is: “I directed this prototype using AI. I can demonstrate the workflow and am building my ability to trace and extend the implementation.” Claim specific coding ownership only for parts you have personally reviewed and changed.

## Known limitations

Synthetic data only; no real clinical claims, production patient use, certification, performance benchmark or live insurer/EHR/PACS connection. Local demo settings are not deployment settings. Native secure storage and biometric enforcement need physical-device verification. Local face detection checks presence, not identity or liveness. Scanning, consent enforcement and encryption each address different risks; none independently proves compliance.
