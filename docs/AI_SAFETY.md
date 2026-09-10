# AI and learning-case safety

## Current release rule
Real-data secondary-use processing and clinical AI are gated. Synthetic examples or deterministic summaries are not validated clinical AI. Do not enable a live model merely by providing a key. No real PHI may enter an external model, embedding index or case search without approved processing purpose, contracts, isolation and clinical evaluation.

## Learning environment design
Use a separate account/store and service identity. Ingestion requires an approved release record, permitted purpose, lineage and expiry. Remove direct identifiers, generalize age/dates/geography, assess rare combinations, inspect free text and remove image metadata and burned-in identifiers. Pseudonymization is not anonymity. A privacy specialist must assess re-identification risk for the actual dataset and access population. Log searches and exports; prohibit bulk uncontrolled downloads. Clinical application identities do not imply learning-environment access.

## Retrieval and generation controls
Retrieve only documents the current actor is permitted to use, including permission rechecks before output. Treat retrieved text as data, not instructions. Cite exact source/version and distinguish supported facts from uncertainty. Output is labelled draft/AI-generated, reviewable and stored separately from source records. No autonomous diagnosis, prescription, medical-order write or silent amendment. Similarity describes similarity; it is not evidence that a treatment is appropriate for a different patient.

## Evaluation gates
Define intended task and unacceptable harms. Assemble clinician-reviewed synthetic/appropriately authorized evaluation cases including conflicting records, missing dates, redacted history, unusual units and adversarial text. Measure factual consistency, citation correctness, omitted critical allergies/medications, unsupported assertions, subgroup performance and inappropriate certainty. Clinical leadership sets acceptance thresholds before evaluation. Pin model/prompt/retrieval versions, record reviewer decisions, monitor drift and support immediate rollback. No current evaluation establishes clinical validity.

## Implemented synthetic capability
LearningApi reads only the bundled six-vignette synthetic corpus, verifies synthetic markers at startup and offers doctor-only structured age/sex/laboratory filtering plus weighted lexical and small synonym/concept matching. It audits access without storing query text. This is deterministic retrieval, not a semantic model or clinical recommendation engine.

The source-summary route extracts permitted active record excerpts with a record citation per statement and explicitly identifies itself as non-AI. It reuses backend consent checks and does not mutate records or populate the case corpus. LearningTest covers role rejection, required acknowledgement, filters, absence of private record content in case search, source citation/no mutation and denial after revocation. Test execution status is in final verification evidence.
