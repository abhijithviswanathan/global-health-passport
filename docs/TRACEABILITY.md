# Requirements traceability

The table maps product intent to specifications and executable evidence targets. Named test IDs are acceptance cases, not a claim that corresponding tests exist or have passed. Execution evidence belongs in the final verification report.

| Product | Specification | Acceptance cases | Required evidence/status |
|---|---|---|---|
| PRD-01 | SRS-ID-01/02 | T-ID-01 random stable ID; T-ID-02 collision; T-ID-03 recovery abuse | Generator/schema/test inspection; recovery pending |
| PRD-02 | SRS-REC-01/02 | T-REC-01 provenance; T-REC-02 amend history; T-REC-03 order/time | Backend tests and client presentation |
| PRD-03 | SRS-ACL-01/02, SRS-CNS-01/02 | T-ACL-01 patient A/B; T-ACL-02 no grant; T-CNS-01 revoke; T-CNS-02 expiry/category | Negative API tests and browser workflow |
| PRD-04 | SRS-AUTH-01/02, SRS-REC-01/02 | T-CLN-01 request/encounter; T-AUTH-01 forged identity; T-AUTH-02 strong auth | Synthetic workflow plus production identity gate |
| PRD-05 | SRS-LAB-01, SRS-ACL-03 | T-LAB-01 ordered result; T-LAB-02 wrong association | API role and ownership suite |
| PRD-06 | SRS-RX-01, SRS-ACL-03 | T-RX-01 verification; T-RX-02 oversupply; T-RX-03 concurrent retry | Transaction and pharmacy role suite |
| PRD-07 | SRS-AUD-01, SRS-ACL-04 | T-AUD-01 history; T-AUD-02 tamper; T-ACL-04 admin denied | API tests; independent audit retention pending |
| PRD-08 | SRS-MOB-01 | T-MOB-01 shared API; T-MOB-02 device storage/expiry | Typecheck insufficient; native execution required |
| PRD-09 | SRS-AI-01, SRS-CASE-01 | T-AI-01 gated/no writes; T-CASE-01 release isolation | Clinical/privacy validation pending |
| PRD-10 | SRS-FHIR-01, SRS-UPL-01, SRS-EMG-01 | T-FHIR-01 validator; T-UPL-01 quarantine; T-EMG-01 policy | All deferred controls remain release blockers |

The complete prompt scope is retained in PRD's full-scope backlog. A page, stub endpoint, synthetic fixture or architecture diagram cannot satisfy a production functional requirement by itself.

## Learning implementation mapping
LearningTest.governedSearchUsesSyntheticCorpusAndStructuredFilters covers doctor-only role enforcement, acknowledgement, age/sex/lab filtering and deterministic matching against fictional cases. LearningTest.sourceSummariesHonorConsentAndNeverModifyOrPopulateCorpus covers source IDs, explicit non-AI flags, no record mutation/corpus ingestion, category-limited summary and immediate denial after revoke. These map PRD-09/SRS-AI-01/SRS-CASE-01 only for the bounded synthetic capability; real-data/model gates remain open.
