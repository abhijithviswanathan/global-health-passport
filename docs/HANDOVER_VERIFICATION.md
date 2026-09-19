# Handover maintenance verification — 2026-09-19

This revision improves source explanations and formatting for a coworker taking over development. Baseline: `ddbb484` (the published GitHub Pages demo).

## Changes

- Added module-purpose comments across 73 application, shared-model and setup files, plus targeted explanations of permissions, stale requests, versions, retries, provenance, file handling and native lifecycle behavior.
- Expanded the compressed Python setup/fixture/report scripts, native emergency-policy helper, Maven configuration and static demo into readable formatting.
- Added the [handover guide](HANDOVER.md) and [source map](SOURCE_MAP.md), linked them from the README, and clarified the separate Pages/full-app boundary in the parity document.
- Added comments to backend configuration, the photo-check subprocess, web build configuration and CI. Existing database migrations and dependency lockfiles are unchanged.

No functional feature, API contract, authorization rule, fixture value or database migration is intentionally changed.

## Executed checks

| Check | Result |
| --- | --- |
| Java 21 `./mvnw -B --no-transfer-progress verify` | Passed: 94 discovered, 63 executed successfully, 31 optional PostgreSQL cases skipped locally; zero failures/errors. Runnable JAR packaged. |
| Web locked dependency installation | Passed. |
| Web `npm run typecheck`, `npm run lint`, `npm run build` | Passed. |
| Mobile locked dependency installation | Passed. |
| Mobile `npm run typecheck` and `npm test` | Passed; all 18 behavior tests passed. |
| Comment/format preservation | 29 Java files retain the same non-comment tokens; 11 Python files retain the same AST; 35 TypeScript/JavaScript files retain the same parsed syntax. |
| Configuration preservation | Maven XML has the same element/attribute/value structure; YAML and application properties differ only by comments. |
| Static demo code preservation | Embedded JS and CSS compare equally after applying the same formatter and excluding comments. |
| Static demo browser regression | Passed chart opening, patient search/empty search, five request rows, linked sample reports, task completion/reset and patient-perspective record selection. |
| Static responsive layout | Checked 1440px desktop and 390px mobile; no document horizontal overflow across the main views, no browser script errors. Desktop screenshot visually reviewed. |
| Documentation links and whitespace | New handover/source-map/README local links resolve; `git diff --check` passed. |

The source comparisons are maintenance checks against the baseline, not new runtime regression tests. Existing mobile tests additionally exercise the reformatted emergency snapshot validation.

## Limits and hosted verification

No fixture-seeding scripts were executed against an existing local database for this revision. Python parsing/AST comparison checks preservation without triggering their side effects. No new full-app browser E2E run, physical iOS/Android test, native bundle export or real photo-hardware check is claimed.

The repository's [verification workflow](../.github/workflows/ci.yml) runs on push and supplies a real PostgreSQL service. Its result belongs to the commit shown in [GitHub Actions](https://github.com/abhijithviswanathan/global-health-passport/actions), separately from the local results above. GitHub Pages also runs its own deployment for the formatted demo.
