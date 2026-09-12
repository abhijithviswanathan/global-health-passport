# ADR 0013 — Extend clinical records with operational workflows

Decision: keep clinical records/revisions as the legal-documentation core; add structured order, nursing, specimen, handoff and task metadata around them. Operational messages/tasks remain distinct until explicitly reviewed/promoted. Lab identity checks and radiologist attestation are server-enforced. Use optimistic versions and existing transactions/locks.

Use generic organization events with SSE for web and a bounded native cursor fallback. Revalidate membership/session on delivery; fetch clinical details only through authorized APIs. Retain existing care notification behavior and avoid claiming push or clinical paging guarantees.

Consequences: a single-process event/synchronization design is appropriate for this local pilot; durable workers, distributed locks/sessions, independent audit retention and urgent-alert delivery require deployment validation. FHIR stays a projection layer, avoiding a domain rewrite. Imaging UIDs represent metadata; PACS pixels and certificate signatures are separate integrations.
