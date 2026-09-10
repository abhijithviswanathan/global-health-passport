FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY src src
RUN mvn -B -DskipTests package
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system passport && useradd --system --gid passport passport && mkdir data && chown passport:passport data
COPY --from=build /build/target/health-passport-api-0.1.0.jar app.jar
USER passport
ENV BIND_ADDRESS=0.0.0.0
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
