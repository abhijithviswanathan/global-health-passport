# ADR 0007: Gate clinical AI and separate learning data

Status: Accepted.

## Decision
Keep real-data secondary-use ingestion and clinical AI disabled until privacy, legal and clinical approval. Synthetic examples may demonstrate interaction with explicit labels. Never silently write generated clinical content.

## Consequences
No external model or vector index receives PHI by default. Re-identification assessment, retrieval authorization and source-linked evaluation are mandatory.
