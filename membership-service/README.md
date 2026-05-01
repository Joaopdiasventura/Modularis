# Membership Service

Portuguese: [README.pt-BR.md](./README.pt-BR.md)

Spring Boot premium entitlement core. This service consumes payment confirmations, performs idempotent premium activation, and emits the events that tell the rest of the ecosystem the user is now premium.

## Purpose

`membership-service` owns premium entitlement state. It is intentionally downstream from payments so that premium activation is derived from a confirmed payment event instead of being inferred optimistically at the edge.

## Responsibilities

- Consume `payment.confirmed`.
- Activate premium membership idempotently.
- Publish `membership.premium-activated`.
- Publish `user.premium-updated`.
- Expose `GET /actuator/health/liveness` and `GET /actuator/health/readiness`.

## Stack

- Java 25
- Spring Boot 4
- Spring AMQP
- Spring Data JPA + Flyway
- PostgreSQL
- JUnit + Testcontainers

## Main flows

1. Receive `payment.confirmed` from the event exchange.
2. Use the inbox layer to deduplicate repeated deliveries.
3. Persist premium activation in PostgreSQL.
4. Publish both the membership-specific event and the user-facing premium update event.

## Inputs and outputs

### Inputs

- RabbitMQ event: `payment.confirmed`
- PostgreSQL for entitlement state, inbox, and outbox persistence
- Actuator probes:
  - `GET /actuator/health/liveness`
  - `GET /actuator/health/readiness`

### Outputs

- RabbitMQ events:
  - `membership.premium-activated`
  - `user.premium-updated`

### Published paths through nginx

- `GET /internal/membership/actuator/health/liveness`
- `GET /internal/membership/actuator/health/readiness`

## Local run

This service can run in isolation as long as PostgreSQL and RabbitMQ are available. Use `../platform/infra/docker/membership-service.env` as the reference env file.

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
- Integration coverage uses Testcontainers for PostgreSQL.

## Project structure

```text
src/main/java/com/modularis/membership/
  MembershipServiceApplication.java
  config/
  core/membership/
    application/
    domain/
    messaging/
    persistence/
  shared/
    errors/
    inbox/
    messaging/
    outbox/
src/main/resources/
  application.yml
  db/migration/
src/test/java/com/modularis/membership/
```

## References

- Ecosystem hub: [../platform/README.md](../platform/README.md)
- Service ownership map: [../platform/docs/architecture/service-map.md](../platform/docs/architecture/service-map.md)
- RabbitMQ and event flow: [../platform/docs/communication/events-and-rabbitmq.md](../platform/docs/communication/events-and-rabbitmq.md)
