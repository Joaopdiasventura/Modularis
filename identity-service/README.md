# Identity Service

Portuguese: [README.pt-BR.md](./README.pt-BR.md)

Spring Boot identity core for user creation and compensation. This service owns relational identity persistence, uniqueness checks, and asynchronous responses for the onboarding workflow.

## Purpose

`identity-service` is the source of truth for user identity records. It creates users when onboarding requests arrive, enforces uniqueness rules close to the database, and exposes a compensation path so the distributed workflow can roll back identity creation if a later step fails permanently.

## Responsibilities

- Consume `identity.user.create`.
- Consume `identity.user.compensate`.
- Persist identity records and outbox messages in PostgreSQL.
- Publish `identity.user.create.response`.
- Publish `identity.user.compensate.response`.
- Expose `GET /actuator/health/liveness` and `GET /actuator/health/readiness`.

## Stack

- Java 25
- Spring Boot 4
- Spring AMQP
- Spring Data JPA + Flyway
- PostgreSQL
- JUnit + Testcontainers

## Main flows

1. Receive `identity.user.create`, validate the payload, enforce uniqueness, persist the user, and publish the async response.
2. Receive `identity.user.compensate`, delete or roll back the previously created identity, and publish the compensation response.
3. Flush outbox messages so the write model and async publication remain transactionally aligned.

## Inputs and outputs

### Inputs

- RabbitMQ commands:
  - `identity.user.create`
  - `identity.user.compensate`
- PostgreSQL for identity persistence and outbox storage
- Actuator probes:
  - `GET /actuator/health/liveness`
  - `GET /actuator/health/readiness`

### Outputs

- RabbitMQ responses:
  - `identity.user.create.response`
  - `identity.user.compensate.response`

### Published paths through nginx

- `GET /internal/identity/actuator/health/liveness`
- `GET /internal/identity/actuator/health/readiness`

## Local run

This service can run in isolation as long as PostgreSQL and RabbitMQ are available. Use `../platform/infra/docker/identity-service.env` as the reference env file.

Examples below use the Gradle wrapper in a Unix-like shell. On native Windows shells, use `gradlew.bat` with the same tasks.

```sh
./gradlew bootRun
```

Common validation commands:

```sh
./gradlew test
./gradlew build
```

## Important configuration

- `PORT`: HTTP port for the Spring Boot app. Defaults to `8080`.
- `SPRING_DATASOURCE_URL`: PostgreSQL JDBC URL.
- `SPRING_DATASOURCE_USERNAME`: database username.
- `SPRING_DATASOURCE_PASSWORD`: database password.
- `SPRING_RABBITMQ_HOST`: RabbitMQ host.
- `SPRING_RABBITMQ_PORT`: RabbitMQ port.
- `SPRING_RABBITMQ_USERNAME`: RabbitMQ username.
- `SPRING_RABBITMQ_PASSWORD`: RabbitMQ password.

## Tests

- Unit and integration tests: `./gradlew test`
- Build validation: `./gradlew build`
- Integration tests rely on Testcontainers for PostgreSQL.

## Project structure

```text
src/main/java/com/modularis/identity/
  IdentityServiceApplication.java
  config/
  core/identity/
    application/
    domain/
    messaging/
    persistence/
  shared/
    errors/
    messaging/
    outbox/
src/main/resources/
  application.yml
  db/migration/
src/test/java/com/modularis/identity/
```

## References

- Ecosystem hub: [../platform/README.md](../platform/README.md)
- Service ownership map: [../platform/docs/architecture/service-map.md](../platform/docs/architecture/service-map.md)
- Async contracts: [../platform/contracts/asyncapi/modularis.yaml](../platform/contracts/asyncapi/modularis.yaml)
