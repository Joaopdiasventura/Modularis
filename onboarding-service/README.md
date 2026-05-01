# Onboarding Service

Portuguese: [README.pt-BR.md](./README.pt-BR.md)

NestJS saga coordinator for public account creation. This service consumes the onboarding command, persists top-level idempotency, orchestrates identity and payment RPC calls, and publishes the final onboarding response.

## Purpose

`onboarding-service` owns the distributed account-creation workflow. It keeps the gateway thin, centralizes retry and replay handling, and coordinates compensating behavior when downstream payment creation fails permanently after the identity step succeeded.

## Responsibilities

- Consume `onboarding.account.create`.
- Persist onboarding idempotency and saga state in Postgres.
- Call `identity.user.create`.
- Call `payment.intent.create`.
- Call `identity.user.compensate` when payment creation fails permanently.
- Publish `onboarding.account.create.response`.
- Expose `GET /health/live` and `GET /health/ready`.

## Stack

- NestJS 11
- TypeScript
- PostgreSQL
- RabbitMQ
- Jest + Supertest

## Main flows

1. Accept the onboarding command from RabbitMQ and persist the request hash and replay state.
2. Create the identity record through RPC and capture the resulting user id.
3. Create the payment intent through RPC and publish a success response back to the gateway.
4. If payment creation fails permanently after identity creation, issue `identity.user.compensate` before publishing the error response.

## Inputs and outputs

### Inputs

- RabbitMQ command: `onboarding.account.create`
- Postgres tables for idempotency, state transitions, and replay safety
- Health probes:
  - `GET /health/live`
  - `GET /health/ready`

### Outputs

- RabbitMQ RPC commands:
  - `identity.user.create`
  - `payment.intent.create`
  - `identity.user.compensate`
- RabbitMQ response: `onboarding.account.create.response`

### Published paths through nginx

- `GET /internal/onboarding/health/live`
- `GET /internal/onboarding/health/ready`

## Local run

This service can run by itself if Postgres and RabbitMQ are available. Use `../platform/infra/docker/onboarding-service.env` as the reference env file.

```sh
npm install
npm run start:dev
```

Common validation commands:

```sh
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e
```

## Important configuration

- `PORT`: HTTP port for health probes. Defaults to `3000`.
- `MODULARIS_RABBITMQ_URL`: RabbitMQ connection string.
- `MODULARIS_POSTGRES_URL`: PostgreSQL connection string for saga persistence.
- `MODULARIS_POSTGRES_CONNECTION_TIMEOUT_MS`: database connect timeout.
- `MODULARIS_ONBOARDING_COMMAND_QUEUE`: queue name bound to `onboarding.account.create`.
- `MODULARIS_RPC_TIMEOUT_MS`: timeout for downstream RPC calls.

## Tests

- Unit and integration tests: `npm test -- --runInBand`
- E2E coverage: `npm run test:e2e`
- Build and lint validation:

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

- Ecosystem hub: [../platform/README.md](../platform/README.md)
- Service ownership map: [../platform/docs/architecture/service-map.md](../platform/docs/architecture/service-map.md)
- RabbitMQ and event flow: [../platform/docs/communication/events-and-rabbitmq.md](../platform/docs/communication/events-and-rabbitmq.md)
