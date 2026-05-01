# Onboarding Service

English: [README.md](./README.md)

Serviço NestJS que coordena a saga de criação de conta. Ele consome o comando de onboarding, persiste a idempotência de topo, orquestra chamadas RPC para identity e payment e publica a resposta final do fluxo.

## Purpose

`onboarding-service` é o dono do workflow distribuído de criação de conta. Ele mantém o gateway fino, centraliza retries e replay, e também executa a compensação quando a criação do pagamento falha de forma permanente depois que a identidade já foi criada.

## Responsibilities

- Consumir `onboarding.account.create`.
- Persistir idempotência e estado da saga em Postgres.
- Chamar `identity.user.create`.
- Chamar `payment.intent.create`.
- Chamar `identity.user.compensate` quando a criação do pagamento falha de forma permanente.
- Publicar `onboarding.account.create.response`.
- Expor `GET /health/live` e `GET /health/ready`.

## Stack

- NestJS 11
- TypeScript
- PostgreSQL
- RabbitMQ
- Jest + Supertest

## Main flows

1. Receber o comando de onboarding no RabbitMQ e persistir hash da requisição e estado de replay.
2. Criar a identidade via RPC e capturar o `userId` retornado.
3. Criar a intenção de pagamento via RPC e publicar a resposta de sucesso para o gateway.
4. Se a criação do pagamento falhar de forma permanente após a criação da identidade, emitir `identity.user.compensate` antes de publicar o erro final.

## Inputs and outputs

### Inputs

- Comando RabbitMQ: `onboarding.account.create`
- Tabelas Postgres para idempotência, transições de estado e proteção contra replay
- Health probes:
  - `GET /health/live`
  - `GET /health/ready`

### Outputs

- Comandos RPC RabbitMQ:
  - `identity.user.create`
  - `payment.intent.create`
  - `identity.user.compensate`
- Resposta RabbitMQ: `onboarding.account.create.response`

### Published paths through nginx

- `GET /internal/onboarding/health/live`
- `GET /internal/onboarding/health/ready`

## Local run

O serviço roda isoladamente se Postgres e RabbitMQ estiverem disponíveis. Use `../platform/infra/docker/onboarding-service.env` como referência de ambiente.

```sh
npm install
npm run start:dev
```

Comandos de validação mais comuns:

```sh
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e
```

## Important configuration

- `PORT`: porta HTTP dos health checks. O padrão é `3000`.
- `MODULARIS_RABBITMQ_URL`: string de conexão com o RabbitMQ.
- `MODULARIS_POSTGRES_URL`: string de conexão do PostgreSQL para persistência da saga.
- `MODULARIS_POSTGRES_CONNECTION_TIMEOUT_MS`: timeout de conexão com o banco.
- `MODULARIS_ONBOARDING_COMMAND_QUEUE`: nome da fila ligada a `onboarding.account.create`.
- `MODULARIS_RPC_TIMEOUT_MS`: timeout das chamadas RPC downstream.

## Tests

- Testes unitários e de integração: `npm test -- --runInBand`
- Cobertura E2E: `npm run test:e2e`
- Validação de build e lint:

```sh
npm run build
npm run lint
```

## Project structure

```text
src/
  config/
  core/
    onboarding/
      dto/
      types/
      __test__/
  shared/
    filters/
    http/
    logging/
    middleware/
    modules/
      database/
      health/
      messaging/
    utils/
test/
```

## References

- Hub do ecossistema: [../platform/README.pt-BR.md](../platform/README.pt-BR.md)
- Mapa de ownership: [../platform/docs/architecture/service-map.pt-BR.md](../platform/docs/architecture/service-map.pt-BR.md)
- RabbitMQ e fluxo de eventos: [../platform/docs/communication/events-and-rabbitmq.pt-BR.md](../platform/docs/communication/events-and-rabbitmq.pt-BR.md)
