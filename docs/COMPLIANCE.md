# Compliance readiness and jurisdiction matrix

This repository is designed to support later compliance work. It is not certified or approved for live healthcare use. Launch jurisdiction, contracting model, controller/processor or covered-entity/business-associate roles, retention schedule and licensed clinical intended use remain unresolved. The following is an applicability checklist, not legal advice or a statement of current commencement dates. Qualified counsel must verify current official requirements at launch.

| Region/framework | Questions for qualified review | Engineering evidence required |
|---|---|---|
| US HIPAA/HITECH and Privacy/Security/Breach rules | Are customers covered entities? Is the platform a business associate? Which contracts and subcontractor obligations apply? | Data-flow inventory, access policies, risk assessment, incident process, BAAs and vendor register |
| US 42 CFR Part 2, state health/privacy laws | Does sensitive treatment data or a particular state rule apply? | Sensitive-category policy, segmentation and disclosure decision tests |
| US information blocking/interoperability | Which actors and exceptions apply? | Export capability, access decision history, response procedures |
| EU/EEA GDPR health data | Roles, legal basis and special-category condition? Is a DPIA required? | Processing register, DPIA, rights workflows, security measures and retention |
| EU/EEA international transfer/EHDS | Which transfers, safeguards and phased duties apply to this intended use? | Regional routing, transfer contracts, interoperability assessment |
| India DPDP Act/rules | Which commenced obligations, roles and rights apply at launch? | Notices, consent/rights processes, processor terms and safeguards |
| India ABDM/ABHA | Will the product participate; what certification/interfaces are required? | Authorized integration, consent artifacts and conformance evidence |

## Control/evidence ownership
Product owns intended use and population. Privacy/legal owns notices, legal basis, retention, rights and contracts. Clinical leadership owns record integrity and clinical risk. Security owns threat assessment and incident readiness. Operations owns backups, on-call and recovery. These functions cannot be replaced by generated documents; assign actual people before a pilot.

## Record lifecycle policy model
Classify each object as provider legal record, patient contribution, imported/platform copy or approved learning release. For each region/class define retention trigger, period, legal-hold precedence, deletion authority, correction mechanism, backup aging and provenance. Do not hard-code a universal retention period. Revocation changes future sharing; it cannot recall a prior legitimate disclosure or erase provider retention obligations. Deletion requests require identity verification and documented disposition, including lawful exceptions.

## Required release dossier
Approved intended use; jurisdiction applicability opinion; signed customer/subprocessor agreements; data inventory and processing register; privacy notice; DPIA/risk assessment as applicable; tested rights and retention workflows; incident notification decision process; training and access-review records; vendor/security review; independent penetration findings/resolution; clinical safety acceptance; partner/terminology licenses; production restore and regional-storage evidence. All remain pending unless an evidence report explicitly says otherwise.
