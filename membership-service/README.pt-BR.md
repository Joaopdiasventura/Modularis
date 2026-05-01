# Membership Service

English: [README.md](./README.md)

Serviço Spring Boot responsável pelo núcleo de entitlement premium. Ele consome confirmações de pagamento, executa a ativação premium de forma idempotente e emite os eventos que sinalizam para o restante do ecossistema que o usuário agora é premium.

## Purpose

`membership-service` é o dono do estado de entitlement premium. O serviço fica propositalmente a jusante de pagamentos para que a ativação premium seja derivada de um evento de pagamento confirmado, e não inferida de forma otimista na borda.

## Responsibilities

- Consumir `payment.confirmed`.
- Ativar membership premium de forma idempotente.
- Publicar `membership.premium-activated`.
- Publicar `user.premium-updated`.
- Expor `GET /actuator/health/liveness` e `GET /actuator/health/readiness`.

## Stack

- Java 25
- Spring Boot 4
- Spring AMQP
- Spring Data JPA + Flyway
- PostgreSQL
- JUnit + Testcontainers

## Main flows

1. Receber `payment.confirmed` pela event exchange.
2. Usar a camada de inbox para deduplicar entregas repetidas.
3. Persistir a ativação premium no PostgreSQL.
4. Publicar tanto o evento específico de membership quanto o evento de premium voltado ao usuário.

## Inputs and outputs

### Inputs

- Evento RabbitMQ: `payment.confirmed`
- PostgreSQL para persistência de entitlement, inbox e outbox
- Actuator probes:
  - `GET /actuator/health/liveness`
  - `GET /actuator/health/readiness`

### Outputs

- Eventos RabbitMQ:
  - `membership.premium-activated`
  - `user.premium-updated`

### Published paths through nginx

- `GET /internal/membership/actuator/health/liveness`
- `GET /internal/membership/actuator/health/readiness`

## Local run

O serviço roda isoladamente desde que PostgreSQL e RabbitMQ estejam disponíveis. Use `../platform/infra/docker/membership-service.env` como referência de ambiente.

Os exemplos abaixo usam o Gradle Wrapper em shell Unix-like. Em shells nativos do Windows, use `gradlew.bat` com as mesmas tasks.

```sh
./gradlew bootRun
```

Comandos de validação mais comuns:

```sh
./gradlew test
./gradlew build
```

## Important configuration

- `PORT`: porta HTTP do Spring Boot. O padrão é `8080`.
- `SPRING_DATASOURCE_URL`: JDBC URL do PostgreSQL.
- `SPRING_DATASOURCE_USERNAME`: usuário do banco.
- `SPRING_DATASOURCE_PASSWORD`: senha do banco.
- `SPRING_RABBITMQ_HOST`: host do RabbitMQ.
- `SPRING_RABBITMQ_PORT`: porta do RabbitMQ.
- `SPRING_RABBITMQ_USERNAME`: usuário do RabbitMQ.
- `SPRING_RABBITMQ_PASSWORD`: senha do RabbitMQ.

## Tests

- Testes unitários e de integração: `./gradlew test`
- Validação de build: `./gradlew build`
- A cobertura integrada usa Testcontainers para PostgreSQL.

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

- Hub do ecossistema: [../platform/README.pt-BR.md](../platform/README.pt-BR.md)
- Mapa de ownership: [../platform/docs/architecture/service-map.pt-BR.md](../platform/docs/architecture/service-map.pt-BR.md)
- RabbitMQ e fluxo de eventos: [../platform/docs/communication/events-and-rabbitmq.pt-BR.md](../platform/docs/communication/events-and-rabbitmq.pt-BR.md)
