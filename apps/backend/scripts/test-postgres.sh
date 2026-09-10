#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
: "${TEST_DATABASE_URL:?Set a JDBC PostgreSQL URL for a fresh, disposable test database}"
: "${TEST_DATABASE_PASSWORD:?Set the disposable test database password}"
case "$TEST_DATABASE_URL" in jdbc:postgresql:*) ;; *) echo 'A real PostgreSQL JDBC URL is required' >&2; exit 1 ;; esac
exec ./mvnw -B -Dtest=PostgresWorkflowTest test
