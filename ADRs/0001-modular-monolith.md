# ADR 0001: Modular monolith

Status: Accepted for synthetic foundation.

## Decision
Use Java 21 and Spring Boot as the primary backend with explicit domain boundaries. Compare .NET (equally capable, different ecosystem) and NestJS (shared TypeScript, different clinical interoperability ecosystem). Java offers mature transactional tooling and a path to FHIR libraries. Team expertise remains an open operational consideration.

## Consequences
One process simplifies consistency, debugging and deployment. It does not provide strong domain isolation; separate identities/stores and services remain necessary for high-risk boundaries.
