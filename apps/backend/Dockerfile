FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY src src
RUN mvn -B -DskipTests package
FROM eclipse-temurin:21-jre-noble
WORKDIR /app
RUN groupadd --system passport && useradd --system --gid passport passport && mkdir data && chown passport:passport data
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv && rm -rf /var/lib/apt/lists/*
COPY photo-check/requirements.txt photo-check/requirements.txt
RUN python3 -m venv /app/photo-check/.venv && /app/photo-check/.venv/bin/pip install --no-cache-dir -r /app/photo-check/requirements.txt
COPY photo-check/check.py photo-check/check.py
COPY photo-check/models photo-check/models
COPY photo-check/LICENSE-yunet.txt photo-check/LICENSE-yunet.txt
COPY --from=build /build/target/health-passport-api-0.1.0.jar app.jar
USER passport
ENV BIND_ADDRESS=0.0.0.0
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
