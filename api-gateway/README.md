# API Gateway

Portuguese: [README.pt-BR.md](./README.pt-BR.md)

Public NestJS edge for the Modularis ecosystem. This service owns the HTTP entrypoint, auth cookie issuance, SSE delivery, and the translation of synchronous account creation into the asynchronous onboarding workflow.

## Purpose

`api-gateway` is the only user-facing write edge in the local ecosystem. It validates incoming HTTP requests, issues the auth cookie used by the demo flow, waits for asynchronous onboarding responses over RabbitMQ, and streams user-scoped events back through SSE.

## Responsibilities

- Expose `POST /accounts` and publish `onboarding.account.create`.
- Expose `GET /events` and stream authenticated SSE frames.
- Expose `GET /health/live` and `GET /health/ready`.
- Sign JWTs and write the auth cookie used by the browser flow.
- Translate async onboarding, payment, and membership updates into HTTP or SSE responses.

## Stack

- NestJS 11
- TypeScript
- RabbitMQ
- JWT + cookie-based auth
- Server-Sent Events
- Jest + Supertest

## Main flows

1. Accept `POST /accounts`, validate the DTO and `Idempotency-Key`, publish the onboarding command, wait for the async response, then issue the auth cookie.
2. Accept `GET /events`, authenticate the caller, and stream user-specific `payment.status-updated` and `user.premium-updated` events.
3. Surface fast liveness and readiness checks so the local stack can detect HTTP edge failures independently from downstream services.

## Inputs and outputs

### Inputs

- HTTP routes exposed by this service:
  - `POST /accounts`
  - `GET /events`
  - `GET /health/live`
  - `GET /health/ready`
- RabbitMQ responses from the response exchange.
- RabbitMQ domain events:
  - `payment.status-updated`
  - `user.premium-updated`

### Outputs

- RabbitMQ command: `onboarding.account.create`
- HTTP `201` responses with `Set-Cookie` and `Idempotency-Replayed`
- SSE frames scoped to the authenticated user

### Published paths through nginx

- `POST /api/accounts`
- `GET /api/events`
- `GET /api/health/live`
- `GET /api/health/ready`

## Local run

This service can run alone, but it expects RabbitMQ plus a responder for onboarding RPC traffic. Use `../platform/infra/docker/api-gateway.env` as the reference env file.

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

- `PORT`: HTTP port for the Nest app. Defaults to `3000`.
- `MODULARIS_ALLOWED_ORIGINS`: comma-separated CORS allowlist.
- `MODULARIS_RABBITMQ_URL`: RabbitMQ connection string.
- `MODULARIS_JWT_SECRET`: signing key for the auth cookie token.
- `MODULARIS_AUTH_COOKIE_NAME`: cookie name written after account creation.
- `MODULARIS_RPC_TIMEOUT_MS`: timeout while waiting for onboarding RPC responses.

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
    account/
      dto/
      types/
      __test__/
    event-stream/
      types/
  shared/
    filters/
    http/
    logging/
    middleware/
    modules/
      auth/
      health/
      messaging/
    utils/
test/
```

## References

- Ecosystem hub: [../platform/README.md](../platform/README.md)
- HTTP, auth, and SSE edge: [../platform/docs/communication/http-and-auth.md](../platform/docs/communication/http-and-auth.md)
- Async contracts: [../platform/contracts/asyncapi/modularis.yaml](../platform/contracts/asyncapi/modularis.yaml)
