# Threat model

## Assets and adversaries
Assets: patient identity links, clinical narratives, prescriptions, grants, session credentials, object content, audit evidence, signing keys and secondary-use datasets. Adversaries include unauthenticated attackers, malicious patients, compromised clinicians, insiders, compromised dependencies and external integrators. Accidental wrong-patient association is a clinical hazard with security consequences.

| Boundary/threat | Consequence | Required mitigation | Residual validation |
|---|---|---|---|
| Browser→API forged actor or role | Full impersonation | Trusted server authentication; production disables synthetic identities | OIDC and bypass regression tests |
| Resource ID substitution | Cross-patient disclosure | Resolve owner and authorize every route | BOLA matrix and exports |
| Health ID enumeration | Patient discovery | Minimal lookup, throttling and access-request workflow | Enumeration/rate-limit test |
| Stale consent cache | Disclosure after revocation | Server recheck, invalidate queued disclosures | Concurrent revoke/export test |
| Lab order mismatch | Wrong treatment decision | Bind assigned order, patient and organization | Wrong-patient and retry tests |
| Parallel pharmacy writes | Excess dispensing | Transaction lock/version plus idempotency | Concurrent requests |
| Malicious uploaded report | Malware, XSS or model injection | Quarantine, isolated parsing, text-only rendering, untrusted retrieval content | Scanner and parser adversarial suite |
| Privileged database tampering | Lost audit/provenance | Least privilege, independent checkpoints and retention | Tamper/restoration exercise |
| Credential recovery abuse | Account takeover | Multiple strong proofs, step-up and notifications | SIM-swap/social-engineering review |
| Emergency override misuse | Broad unauthorized disclosure | Eligible strong-auth users, minimal categories, reason, expiry and review | Emergency policy evaluation |
| Offline device theft | Persistent health-data exposure | Minimal encrypted card, local auth and expiry | Native extraction and stale-data checks |
| Rare case + free text | Re-identification | Separate release review, suppression and controlled access | Expert risk assessment |
| AI hallucination/instruction injection | Unsafe clinical advice | Source-linked drafts, review, no automatic writes, feature gate | Clinician evaluation and red team |
| Backup or log exfiltration | Bulk data breach | Encryption, scoped access, lifecycle and monitoring | Restore/access review |

## Clinical safety hazards
H-01 Wrong patient: require confirmation of appropriate identifiers before attaching information; do not show unrestricted demographics to solve discovery. H-02 Incomplete history: prominently indicate scope/freshness without revealing hidden categories. H-03 Medication units/frequency ambiguity: structured fields, validated units, no inferred regimen. H-04 Stale emergency card: show timestamp and expiry. H-05 Duplicate or overwritten result: immutable provenance and amendments. H-06 Similarity interpreted as recommendation: separate learning use, no automatic treatment selection.

Each hazard needs an accountable clinical safety owner, severity/likelihood assessment, mitigation evidence and signed residual-risk acceptance before a clinical pilot. These roles are currently unassigned; this is a live-release blocker.


## Expansion threats and controls

| Threat | Implemented control / remaining boundary |
|---|---|
| Fabricated hospital self-registers for clinical access | Pending onboarding, independent platform review, separate work identity and verified clinical credentials |
| Cross-hospital object ID or parent-group escalation | Server tenant resource filters, composite hierarchy FKs; parentage grants no clinical access |
| Employee leaves but keeps a session or assignment | Request-time membership/expiry checks and timed sweep, session/assignment/future-shift revocation |
| Nurse/technician/insurer uses physician APIs | Role ceilings plus explicit privileges and consent; negative integration tests |
| Wrong specimen reaches wrong patient | Generated specimen reference plus matching patient Health ID before collection stage |
| Unreviewed imaging text appears signed | Radiologist identity required for report attestation; ordering clinician review is distinct |
| Card exposed under ordinary chart-document consent | Separate insurance purpose, filtered document/timeline APIs, grant-controlled card endpoints |
| Insurance information leaks to advertising | Marketplace has no patient linkage; insurer clinical denial; sponsorship disabled |
| Forged/stale workflow update | CSRF, server transitions, current version, scoped recipients, dependencies and idempotency on supported submissions |
| Notification/push reveals patient data | Generic bounded tenant change signals; details require authorized workspace fetch |
| Malicious eligibility endpoint/response | Deployment-only HTTPS endpoint, protected token, disabled redirects, time/size/status bounds; live integration not validated |

Residuals: one-process application authorization/locks, no independent audit retention, no dedicated clinical paging SLA, external partner/device verification, and organizational policy review. A limited synthetic test suite is not a comprehensive penetration test.
