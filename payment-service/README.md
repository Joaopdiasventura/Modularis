# Payment Service

Portuguese: [README.pt-BR.md](./README.pt-BR.md)

Go payment workflow service. It creates payment intents, advances payment state across asynchronous steps, publishes status changes, and emits the final confirmation event consumed by membership.

## Purpose

`payment-service` owns payment lifecycle state. It receives the request created during onboarding, persists the payment aggregate in MongoDB, reacts to callback and delivery events, and publishes the user-visible payment transitions used by the gateway and downstream services.

## Responsibilities

- Consume `payment.intent.create`.
- Consume `payment.process.requested`.
- Consume `payment.callback.confirmed`.
- Consume `payment.delivery.requested`.
- Publish `payment.status-updated`.
- Publish `payment.confirmed`.
- Expose `GET /health/live` and `GET /health/ready`.

## Stack

- Go 1.26 toolchain
- MongoDB
- RabbitMQ
- Standard library HTTP
- Native Go testing

## Main flows

1. Receive `payment.intent.create`, validate amount and currency, create the payment aggregate, and publish the response back to onboarding.
2. Receive `payment.process.requested` and move the payment into processing state.
3. Receive `payment.callback.confirmed` and update the aggregate to confirmed.
4. Receive `payment.delivery.requested` and publish `payment.confirmed` once the workflow reaches its delivery stage.
5. Emit `payment.status-updated` whenever the externally relevant payment state changes.

## Inputs and outputs

### Inputs

- RabbitMQ traffic:
  - `payment.intent.create`
  - `payment.process.requested`
  - `payment.callback.confirmed`
  - `payment.delivery.requested`
- MongoDB for payment persistence
- Health probes:
  - `GET /health/live`
  - `GET /health/ready`

### Outputs

- RabbitMQ response: `payment.intent.create.response`
- RabbitMQ events:
  - `payment.status-updated`
  - `payment.confirmed`
  - internal workflow follow-ups such as `payment.process.requested` and `payment.delivery.requested`

### Published paths through nginx

- `GET /internal/payment/health/live`
- `GET /internal/payment/health/ready`

## Local run

This service can run in isolation if MongoDB and RabbitMQ are available. Use `../platform/infra/docker/payment-service.env` as the reference env file.

```sh
go run ./cmd/payment-service
```

Common validation commands:

```sh
go test ./...
go build ./...
```

## Important configuration

- `PORT`: HTTP port for health probes. Defaults to `8080`.
- `MODULARIS_RABBITMQ_URL`: RabbitMQ connection string.
- `MODULARIS_MONGO_URI`: MongoDB connection string.
- `MODULARIS_MONGO_DATABASE`: Mongo database name.
- `MODULARIS_ALLOWED_CURRENCIES`: comma-separated currency allowlist.
- `MODULARIS_PAYMENT_EXPIRATION`: payment expiration window.
- `MODULARIS_PAYMENT_PROCESSING_ATTEMPTS`: publish retry count for processing and delivery steps.
- `MODULARIS_PAYMENT_SIMULATION_*`: local simulation knobs used by the demo stack.

## Tests

- Unit and integration coverage: `go test ./...`
- Build validation: `go build ./...`

## Project structure

```text
cmd/
  payment-service/
internal/
  config/
  core/
    payment/
  infrastructure/
    gateway/
    mongo/
    rabbit/
  shared/
    http/
    messaging/
  testsupport/
```

## References

- Ecosystem hub: [../platform/README.md](../platform/README.md)
- RabbitMQ and event flow: [../platform/docs/communication/events-and-rabbitmq.md](../platform/docs/communication/events-and-rabbitmq.md)
- Manual API demo: [../platform/docs/demos/manual-api/README.md](../platform/docs/demos/manual-api/README.md)
