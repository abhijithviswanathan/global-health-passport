# ADR 0014 — Separate coverage sharing from insurer marketing

Decision: encrypt patient coverage identifiers; classify insurance card files independently from clinical documents; authorize purpose/organization/employee/department/expiry shares and audit reveals. Eligibility uses a server provider interface with explicit synthetic/unconfigured implementations and an optional private HTTPS gateway. Never infer coverage from a marketplace plan or patient diagnosis.

Marketplace participation gives insurers plan-submission authority only. Plans require independent review. Comparison sorting uses objective patient-selected fields. Sponsored and organic results are structurally separate; sponsorship remains disabled pending legal/commercial authorization. No PHI targeting pipeline exists.

Consequences: claims, EOB, prior authorization and payment adjudication are future domains, not implied features. Live gateway credentials/contract and insurer validation remain external blockers. The configured gateway contract is not a vendor-specific certified API. Multiple patient-entered coverage profiles do not adjudicate coordination of benefits.
