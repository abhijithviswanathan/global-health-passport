# ADR 0006: Domain model with FHIR boundary

Status: Accepted.

## Decision
Keep domain storage separate from exchange representation. Begin with explicit R4 resource mapping; validate supported profiles and operations. Do not advertise a full FHIR server or R4B compatibility from a JSON exporter.

## Consequences
Mapping requires provenance and coding fidelity. Authorized vendor adapters, SMART and licensed terminology remain additional integration work.
