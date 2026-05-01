FROM eclipse-temurin:25-jdk AS build

WORKDIR /workspace

COPY gradlew .
COPY gradlew.bat .
COPY build.gradle .
COPY settings.gradle .
COPY gradle ./gradle
COPY src ./src

RUN sed -i 's/\r$//' gradlew && chmod +x gradlew && ./gradlew bootJar --no-daemon

FROM eclipse-temurin:25-jre

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /workspace/build/libs/user-service-0.0.1-SNAPSHOT.jar /app/app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
