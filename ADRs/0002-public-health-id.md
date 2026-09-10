# ADR 0002: Random public Health ID

The length decision below is superseded by ADR 0011 at the user’s request.

Status: Accepted.

## Decision
Generate a permanent public identifier from at least 128 bits of cryptographic randomness, distinct from internal database UUIDs. Do not derive from contact or demographic data. UUIDv7/ULID carry time information and are unsuitable for a strictly random public identifier requirement without a separate random public ID.

## Consequences
Database uniqueness handles collisions; retries must be bounded. An identifier enables lookup/request only. Duplicate identity reconciliation is a separate reviewed workflow.
