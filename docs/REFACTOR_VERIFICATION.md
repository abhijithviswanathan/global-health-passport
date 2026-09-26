# Architecture refactor — change and verification report

Date: 26 September 2026. Baseline: `c38d185ef9b17960a7984fb6e90d7b6ac08d251e`. Scope: shared backend, web, native application, public Pages demo and developer handover. The goal is maintainable boundaries with compatible user workflows.

## Delivered changes

- Extracted clinician use cases from the HTTP controller into `ClinicianService`, `AppointmentRepository`, `AppointmentScheduler`, `AppointmentPolicy` and immutable `VisitNote`. Preserved server actor resolution, consent checks, doctor row locks, transaction boundaries, version checks, retry keys and record creation rules. No migration or database reset is required.
- Replaced duplicated web/native request mechanics with `HttpClient`, explicit CSRF strategies and thin platform adapters. Browser cookie/token behavior and native fresh-token, raw-row, shallow naming and release HTTPS conventions remain distinct and compatible. Writes are not retried automatically.
- Split shared care and organization form definitions into feature builders, contracts, query, formatting and presentation modules. Facades preserve existing client imports. Insurance editing explicitly reuses the create-form factory rather than depending on another builder's accumulated output.
- Extracted patient display components from both application shells; moved web workspace definitions and native visual tokens into dedicated modules. Session, consent-refresh, stale-response and background-privacy lifecycles remain in the shells.
- Split the Pages app into a state-owning model, application controller, navigation/feedback objects, pure role views and registered workflow commands. Each demo command modifies a detached draft; failures publish nothing. Existing fixtures and presentation behavior are retained.
- Added automated checks for the new boundaries, formatting defaults, a [code architecture guide](CODE_ARCHITECTURE.md), [design decision](../ADRs/0015-feature-boundaries-and-composition.md), updated [handover](HANDOVER.md) and [source map](SOURCE_MAP.md).
- Corrected hospital fixture setup to choose a future shift window when its same-day start has already passed. Previously an afternoon setup could attempt a past appointment even though the shift had not yet ended.
- Made browser test origins configurable so a coworker can verify another checkout without stopping their existing local UI servers.

No runtime dependency, real patient data, external integration or new production claim is introduced. The public Pages site remains a fictional static presentation.

## Executed local checks

| Check | Result |
| --- | --- |
| Before/after form characterization | 1,020 care and 1,248 ecosystem role/section/context combinations matched the baseline, including action order, field descriptors, fixed values and payload metadata. A one-time comparison loaded both baseline and refactored TypeScript modules. This checks client presentation contracts, not server authorization. |
| Demo and shared unit checks | 24 passed: 11 existing workflow journeys, 3 model/navigation/atomic-failure checks, 6 transport/session/cancellation checks and 4 shared-form regressions. |
| Backend Maven verification | 97 discovered; 66 passed, 31 PostgreSQL-only tests skipped locally because no PostgreSQL test service was configured. No failures. Packaged successfully. Hosted CI supplies PostgreSQL for the skipped workflows. |
| Final clinician-focused Java checks | 8 passed, covering existing HTTP/permission/version flows plus clock boundaries, terminal transitions and SOAP limits/formatting. |
| Web types, lint and production build | Passed. Production prerender required permission to start a temporary loopback server; the completed build passed. |
| Mobile types and unit checks | Passed; 19 unit checks including the retained raw-row/nested-field contract. |
| iOS and Android bundles | Both Expo/Hermes exports completed. This is build evidence, not device validation. |
| Demo lint and shared boundary lint | Passed. Shared modules reject imports of client UI frameworks/adapters; explicit legacy row typing remains documented. |
| Doctor web browser flows | 2 passed: booking, rescheduling, draft recovery, encounter filing, entry/navigation and responsive automated accessibility. |
| Native browser clinician/patient flows | 3 passed: cross-client draft conflict and filing; patient navigation/short ID/doctor entry; chart removal and denied reopening after revocation. |
| Public demo Chromium | Complete story and additional report/message/consent/appointment/reset flows passed at 1440, 390 and 360 pixels; sampled accessibility, no page errors, no storage, guide and print checks passed. |

The broader web checks also passed: 2 care-team, 3 hospital/insurance and 7 platform scenarios (14 web scenarios in total with the clinician suite). These include source/amendment safety, actual browser WebAuthn enrollment/sign-in, quarantine, consent/lab/pharmacy/audit flow, responsive light/dark accessibility and metadata-only administration. Four additional native browser care/ecosystem scenarios passed (7 native harness scenarios in total), including nurse task completion, observation provenance, nursing work grids and shared insurance/marketplace data.

An initial combined browser run reached the existing five-registration rate limit after earlier fixture/test activity. The seven platform scenarios were rerun successfully on a fresh disposable backend; no rate limit was weakened. Generated screenshots and raw reports are retained locally for review; historical presentation assets are not replaced merely because a refactor reran their tests.

## Reproduce and inspect publication

The [architecture guide](CODE_ARCHITECTURE.md#verification-commands) lists local commands. Root `scripts/tests/*.test.mjs` includes the public demo and shared regression suites; it needs the installed web TypeScript dependency. The native suite also exercises its adapter with the test-only local TypeScript loader.

[GitHub verification runs](https://github.com/abhijithviswanathan/global-health-passport/actions/workflows/ci.yml) execute Java with a disposable PostgreSQL service, all root regression tests, demo/shared lint, web types/lint/build and mobile types/tests. Inspect the run matching the published commit for hosted results. The separate Pages build publishes `main` → `/docs` at the [live demonstration](https://abhijithviswanathan.github.io/global-health-passport/).

## Boundaries

Browser mobile checks render the real native components with explicit substitutes for device APIs. They do not verify hardware Back, physical-device biometrics, native cookie behavior, background snapshots or VoiceOver/TalkBack. Automated accessibility checks sample screens and are not a complete accessibility audit.

This is a substantial incremental refactor. Other API modules still combine some orchestration and persistence, JDBC data remains map-shaped, and the web/native shells retain coupled session and form lifecycles. Those remaining areas are identified in the architecture guide; the change does not claim that every legacy file has been rewritten or certified production-ready.
