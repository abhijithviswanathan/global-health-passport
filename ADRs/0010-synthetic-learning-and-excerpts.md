# ADR 0010: Curated synthetic retrieval and source excerpts

Status: Implemented; see test evidence for execution.

Implement useful learning interactions without an unvalidated external model or ingestion of clinical records into a research index. Read an immutable bundled fictional corpus, enforce physician access and explicit learning-purpose acknowledgement, filter by overlapping age range/sex/laboratory pattern and rank matched concepts/lexical tokens deterministically. Return matching reasons, fictional treatment/outcome text and a clear non-recommendation notice. Do not retain free-text queries in audit records.

Expose a separate authorized-record excerpt endpoint with source IDs on every item, no clinical inference, no original-record mutation and explicit `aiGenerated:false`. Reuse timeline policy so revocation and category limits are effective.

This does not satisfy the full AI assistant requirement or establish real-data de-identification. Those remain dependent on approved data purpose, privacy review, licensed sources and clinical evaluation. The synthetic corpus is authored for this project and does not reproduce an EHR dataset or identifiable individual.
