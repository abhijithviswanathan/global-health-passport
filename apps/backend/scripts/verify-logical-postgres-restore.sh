#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
: "${SOURCE_DATABASE_URL:?Set the disposable source JDBC URL}"
: "${TARGET_DATABASE_URL:?Set a different, existing, empty disposable target JDBC URL}"
: "${TEST_DATABASE_PASSWORD:?Set the disposable database password}"
if [ "$SOURCE_DATABASE_URL" = "$TARGET_DATABASE_URL" ]; then echo 'Source and target must differ' >&2; exit 1; fi
mkdir -p target/restore-libs
unzip -j -o -q target/health-passport-api-0.1.0.jar 'BOOT-INF/lib/*' -d target/restore-libs
exec java -cp 'target/restore-libs/*' scripts/LogicalPostgresRestore.java
