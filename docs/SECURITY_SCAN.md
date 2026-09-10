# Security scan and review evidence

Scan date: 2026-09-10. Scope: resolved backend Maven dependency graph, including runtime and test dependencies, plus targeted source review. This is not a penetration test, exploitability proof, legal approval or certification.

## Executed dependency assessment
Generated the resolved graph with Maven Dependency Plugin 3.8.1 in JSON form, submitted each Maven coordinate/version to the public OSV `/v1/querybatch` API, and retrieved returned advisory details. No patient data, source code, secrets or private repository content was submitted; only public dependency coordinates/versions. Exact results are retained in `evidence/maven-dependencies.json`, `evidence/osv-before.json` and `evidence/osv-final.json`.

| Snapshot | Resolved artifacts | Advisory matches | Severity distribution |
|---|---:|---:|---|
| Original foundation | 90 | 56 | 6 Critical, 21 High, 19 Moderate, 10 Low |
| First upgrade, including new FHIR test dependencies | 147 | 5 | 5 Moderate |
| Final resolved graph | 148 | 0 | No OSV matches returned |

These are package/advisory matches, not counts of proven exploitable vulnerabilities. Several Tomcat findings depend on container features this application does not configure. Upgrading was preferable to retaining affected package versions. Package count grew because HAPI validator test dependencies were added during development.

## Remediation
Spring Boot parent 3.5.5 → 3.5.16; Tomcat 10.1.44 → 10.1.59; Spring Framework 6.2.10 → 6.2.19 through the BOM; Jackson 2.19.2 → 2.21.5; HTTP client/core → 5.6.3/5.4.3; PostgreSQL JDBC → 42.7.12; Log4j API → 2.25.5; test dependency Commons Lang → 3.18.0 and OpenTelemetry → 1.62.0. Other managed upgrades are in the resolved graph. Explicit version properties remain in the POM so future BOM updates can reassess/remove them deliberately.

Authoritative release/advisory context: [Spring Boot 3.5.16 release](https://spring.io/blog/2026/06/25/spring-boot-3-5-16-available-now/), [Apache Tomcat 10 security advisories](https://tomcat.apache.org/security-10.html), [Spring annotation advisory](https://spring.io/security/cve-2025-41249/). The latter requires specific method-security usage not present in this application; the framework was upgraded regardless. Detailed OSV identifiers and affected/fixed ranges are in the evidence JSON.

## Targeted source fixes
Password login previously skipped BCrypt work for unknown usernames, creating a trivial timing difference. It now evaluates a dummy BCrypt hash for unknown users. Password creation previously accepted more than BCrypt's 72 UTF-8 bytes, which could produce a server error; registration/recovery now validate that bound, and login rejects oversized values with a generic authentication failure while doing dummy hash work. All password step-up sites use the shared bounded helper. An HTTP regression checks multibyte oversized registration/login/recovery inputs. This reduces the specific discrepancy; it is not a claim of perfectly constant network timing.

## OWASP-oriented coverage
| Class | Concrete evidence/control | Remaining scope |
|---|---|---|
| Broken access control / IDOR | Patient-self, doctor grant/revoke, category restriction, lab/pharmacy/admin negatives; document authorization and session-owner tests | Complete all-domain/multi-organization and export matrix |
| Authentication / session fixation | CSRF, session rotation, TOTP replay, recovery replay/revocation, WebAuthn protocol tests | Physical authenticators, OIDC, recovery notifications, distributed sessions |
| CSRF | Mutating endpoints require session token; negative HTTP cases | Final browser mutations passed; real cross-origin production deployment verification remains |
| Injection | JDBC parameter binding and bounded typed identifiers; source review found no user-built SQL | Dedicated adversarial SQL suite and production database review |
| XSS | Structured API data; clients must render text; JSON validation | Final E2E verifies hostile text rendering; broader payload/CSP and future rich-content surfaces remain |
| SSRF | No user-supplied remote-fetch endpoint in reviewed backend; scanner path is administrator configuration | Future import/adapters and cloud egress controls |
| Upload / traversal | UUID storage paths, signature/MIME/extension/size checks, encrypted content, quarantine and fake-scanner tests | Real ClamAV run, malformed parser corpus, scanner operations and rescan queue |
| Mass assignment / privilege escalation | Explicit accepted fields and server-derived actor/role/source | Systematic forbidden-field fuzzing across every endpoint |
| Token misuse / replay | One-time TOTP/recovery/challenge state, signature tests, dispense idempotency/concurrency | Multi-instance races, passkey hardware and signed credential trust governance |
| Rate limits / resource exhaustion | Per-process attempt windows and bounded inputs | Distributed limits, IP trust, load/DoS tests and lifecycle cleanup |
| Secrets / infrastructure | No submitted secrets in this scan; configured encryption/signing material and generated development files ignored | Independent secret scanner/container scan, cloud KMS and live configuration audit |

## Limits and release conditions
The final zero-match result covers only OSV's database response at scan time and resolved Maven package versions. It does not cover npm (reported separately), operating system/container packages, undisclosed vulnerabilities, unsafe application behavior or cloud configuration. Rerun against the final lock/build graph in CI and periodically after release. No Critical/High dependency match remains in this scanned graph, but independent security review and the operational/clinical release gates still apply.

Final full-suite Maven package passed: 29 cases, 0 failures/errors, 6 optional PostgreSQL cases skipped (23 executed passed). Exact summaries are in evidence/backend-test-summary.json.

## Reproduce the Maven inventory scan
From the repository root, with Java/Maven/Python available and network access:

```sh
mvn -f apps/backend/pom.xml org.apache.maven.plugins:maven-dependency-plugin:3.8.1:tree -DoutputType=json -DoutputFile=target/dependencies.json
python3 scripts/audit-maven.py apps/backend/target/dependencies.json apps/backend/target/osv.json
```

The scanner exits with a tool error if the OSV request fails; do not interpret missing output as a clean scan. It prints affected package/advisory details and writes raw evidence. Review severity and applicability explicitly; the current script reports findings rather than enforcing a CI failure threshold.

## Supplemental source pattern check
A limited pattern scan inspected 127 source/configuration files, excluding generated builds, dependencies, runtime directories and vulnerability evidence. Two matches were manually reviewed: construction of an `otpauth` URI from a generated enrollment secret, and the synthetic credential-file label followed by a generated/configured password variable. Neither match is a literal embedded credential. No private-key-block, AWS key or GitHub-token pattern matched. Metadata-only findings are in `evidence/source-pattern-scan.json`; secret values were not printed. This heuristic is not equivalent to an independent full secret-scanning product and does not inspect runtime/generated files.

The Spring Boot packaging plugin also received explicit patched HTTP client/core dependencies after its build-time transitive versions were observed during packaging. The 148-artifact OSV graph covers project runtime/test dependencies, not an exhaustive inventory of every Maven plugin dependency. The plugin override was verified by a subsequent successful repackage with tests skipped; the immediately preceding full suite covers unchanged application code.

Final web/npm evidence: seven browser E2E tests passed including hostile text, virtual WebAuthn and administrative authorization denial. The separate final npm audit reported zero findings; see evidence/web-npm-audit-final.json. These augment, rather than expand the scope of, the Maven OSV scan.
