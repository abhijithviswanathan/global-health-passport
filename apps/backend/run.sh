#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ -f target/health-passport-api-0.1.0.jar ]; then exec java -jar target/health-passport-api-0.1.0.jar; fi
exec ./mvnw spring-boot:run
