# 0015 — Feature boundaries and explicit composition

Date: 2026-09-26. Status: accepted for the current implementation.

## Context

The public demo mixed event handling, role rendering and workflow state in large files. The clinician HTTP controller mixed SQL, appointment policy, draft formatting and session concerns. Web and native transports duplicated request mechanics, and their shared form definitions were difficult to navigate during handover.

## Decision

Use focused service/repository/policy/value-object boundaries for clinician workflows; explicit constructor injection for dependencies; shared transport with platform-specific CSRF/decoding strategies; feature-grouped form factories behind stable facade exports; and reusable functional patient presentation components.

The static demo uses a state-owning model, DOM controller, navigation object, pure views and an explicit command registry. A transaction draft publishes changes only on successful command completion. These simulated controls do not become authentication or persistence for Pages.

Keep React hooks and functional components. Use classes where lifecycle, encapsulated state or service identity makes them useful. Do not add inheritance hierarchies, a service locator, a new framework or an interface for every class.

## Consequences

A coworker can locate a workflow and its persistence separately, test pure decisions without HTTP, and extend shared forms without editing two clients. Public function signatures, routes, request shapes, status errors, consent/version checks, retries and transaction/locking boundaries remain compatible. New tests and lint rules protect the extracted boundaries.

The shared transport deliberately retains different browser and native conventions. The clinician service still uses the existing core for session/consent and encounter creation. Legacy map-shaped data and other large API modules remain; extraction should continue by use case with regression evidence, not by line-count targets. See [architecture guide](../docs/CODE_ARCHITECTURE.md) and [verification report](../docs/REFACTOR_VERIFICATION.md).
