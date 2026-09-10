# Software requirements specification

## Requirement semantics
MUST denotes a product obligation. Described target behavior is not proof of implemented behavior. Actual executable coverage is recorded in TESTING and TRACEABILITY. Denial responses must avoid unnecessary patient discovery; validation errors must not leak stack traces or secrets.

| ID | Requirement | Verification |
|---|---|---|
| SRS-ID-01 | Public Health IDs MUST be 9 unambiguous letters/digits (45 cryptographically random bits), contain no PII, remain stable after assignment and be unique; preserve previous long IDs as lookup aliases | Generate samples, inspect generator, unique constraint and mutation test |
| SRS-ID-02 | Recovery MUST require evidence beyond Health ID, DOB or a phone number | Recovery abuse tests; blocked until real recovery exists |
| SRS-AUTH-01 | Server MUST authenticate protected operations and derive roles from trusted identity | Missing, expired, forged identity tests |
| SRS-AUTH-02 | Provider production access MUST require verified organization/practitioner and strong authentication | OIDC/MFA/verification integration tests |
| SRS-ACL-01 | Patient A MUST NOT read or mutate Patient B | All resource families and alternate identifiers |
| SRS-ACL-02 | Clinician MUST have active grant, allowed category and purpose | No grant, denied, revoked, expired, wrong-category tests |
| SRS-ACL-03 | Lab and pharmacy MUST access only assigned/minimum resources | Unrelated orders and unrelated clinical record tests |
| SRS-ACL-04 | Administrator MUST NOT inherit clinical access | Admin clinical reads/writes denied |
| SRS-REC-01 | Records MUST retain clinical time, author, source and recording time | Round-trip records and timeline ordering |
| SRS-REC-02 | Amendments MUST retain original version and amendment reason | History/version tests |
| SRS-CNS-01 | Approval MUST bind patient, recipient, categories, purpose and expiry | Mismatched approval, invalid scope and time tests |
| SRS-CNS-02 | Revocation MUST be enforced before subsequent disclosure | Read after revoke and concurrent request tests |
| SRS-LAB-01 | Results MUST reference authorized orders and correct patient | Wrong-order/patient assignment tests |
| SRS-RX-01 | Dispensing MUST validate prescription status, quantity and remaining supply atomically | Duplicate/retry/over-dispense/concurrent tests |
| SRS-AUD-01 | Sensitive success and denial events MUST capture actor, action, resource, outcome and authorization basis | Audit coverage and no-payload checks |
| SRS-FHIR-01 | Exchange MUST preserve identifiers/provenance and state supported resource/profile subset | FHIR validator plus mapping tests |
| SRS-UPL-01 | Uploads MUST remain quarantined until approved scanning and type/size checks | Malware, polyglot, oversized/path traversal tests |
| SRS-EMG-01 | Break-glass MUST expire, minimize data and require eligible strong-auth actor/reason/review | Separate emergency policy suite |
| SRS-MOB-01 | Offline storage MUST be limited, OS-protected and explicitly stale/expiring | Native storage inspection and expiry tests |
| SRS-AI-01 | AI MUST never silently overwrite clinical records | Disabled feature and write-path tests |
| SRS-CASE-01 | Secondary-use processing MUST be isolated and approved before real-data ingestion | Architecture review and re-identification assessment |

## Data and concurrency conventions
Use UTC instants for recorded timestamps; retain original clinical timezone/date precision when supplied. Never infer a date from a missing time. Numeric laboratory values require units and reference-range provenance. Display source units; conversion requires explicit validated mapping. Distinguish unknown, absent, not assessed and negative findings. Transactions must protect result association, grant changes, dispensing counters and audit writes. Production externally retried mutation endpoints require idempotency keys scoped to actor/action and payload hash; replay must not double-dispense. Optimistic version checks protect amendments from lost updates.

## State machines
Consent: requested → approved or denied; approved → revoked or expired. Reapproval requires explicit patient action. Clinical documents: draft → signed → amended; signed original is retained. Laboratory: ordered → assigned → resulted → amended/cancelled with reasons. Prescription: active → completed/cancelled/expired; dispensing adds immutable events and consumes remaining supply. These are target transitions; narrower executable behavior must be explicitly identified.

## Failure behavior
Unauthorized access returns an appropriate 401/403 or non-disclosing 404. Validation is 400/422, conflicts 409, rate-limits 429. Client retries use bounded backoff and never retry non-idempotent clinical writes blindly. Server errors show a correlation identifier, no clinical payload. An unavailable audit path must fail sensitive mutation closed or persist a transactional audit outbox; it must not silently omit records.
