# Identity Service

English: [README.md](./README.md)

Serviço Spring Boot de identidade para criação e compensação de usuários. Ele é o dono da persistência relacional de identidade, das regras de unicidade e das respostas assíncronas usadas pelo onboarding.

## Purpose

`identity-service` é a fonte de verdade dos registros de identidade. O serviço cria usuários quando chegam comandos de onboarding, aplica regras de unicidade perto do banco e expõe um caminho de compensação para que o workflow distribuído consiga desfazer a criação da identidade quando uma etapa posterior falha de forma permanente.

## Responsibilities

- Consumir `identity.user.create`.
- Consumir `identity.user.compensate`.
- Persistir identidades e mensagens de outbox em PostgreSQL.
- Publicar `identity.user.create.response`.
- Publicar `identity.user.compensate.response`.
- Expor `GET /actuator/health/liveness` e `GET /actuator/health/readiness`.

## Stack

- Java 25
- Spring Boot 4
- Spring AMQP
- Spring Data JPA + Flyway
- PostgreSQL
- JUnit + Testcontainers

## Main flows

1. Receber `identity.user.create`, validar o payload, aplicar unicidade, persistir o usuário e publicar a resposta assíncrona.
2. Receber `identity.user.compensate`, remover ou desfazer a identidade criada anteriormente e publicar a resposta de compensação.
3. Escoar as mensagens do outbox para manter escrita transacional e publicação assíncrona alinhadas.

## Inputs and outputs

### Inputs

- Comandos RabbitMQ:
  - `identity.user.create`
  - `identity.user.compensate`
- PostgreSQL para persistência de identidade e armazenamento do outbox
- Actuator probes:
  - `GET /actuator/health/liveness`
  - `GET /actuator/health/readiness`

### Outputs

- Respostas RabbitMQ:
  - `identity.user.create.response`
  - `identity.user.compensate.response`

### Published paths through nginx

- `GET /internal/identity/actuator/health/liveness`
- `GET /internal/identity/actuator/health/readiness`

## Local run

O serviço roda isoladamente desde que PostgreSQL e RabbitMQ estejam disponíveis. Use `../platform/infra/docker/identity-service.env` como referência de ambiente.

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
- Os testes integrados usam Testcontainers para PostgreSQL.

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

- Hub do ecossistema: [../platform/README.pt-BR.md](../platform/README.pt-BR.md)
- Mapa de ownership: [../platform/docs/architecture/service-map.pt-BR.md](../platform/docs/architecture/service-map.pt-BR.md)
- Contratos assíncronos: [../platform/contracts/asyncapi/modularis.yaml](../platform/contracts/asyncapi/modularis.yaml)
