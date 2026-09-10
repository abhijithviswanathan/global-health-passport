# ADR 0003: PostgreSQL and development H2

Status: Accepted for foundation.

## Decision
Use PostgreSQL for transactional deployment and Flyway migrations. Permit H2 only for synthetic local/test convenience. Defer Redis, dedicated search, vector stores and Kubernetes until measured need.

## Consequences
H2 compatibility mode is not PostgreSQL evidence. Production concurrency, migrations, backup/restore and least-privilege testing remain necessary.
