# Webhook Service

Portuguese: [README.pt-BR.md](./README.pt-BR.md)

Go ingress service for payment callbacks. It validates the signed request, stores a deduplicated receipt, and relays the confirmed payment event into RabbitMQ.

## Purpose

`webhook-service` keeps external callback handling out of the payment write model. It is responsible for signature verification, timestamp tolerance, receipt deduplication, and durable relay so callback ingestion stays safe even when publication temporarily fails.

## Responsibilities

- Expose `POST /webhooks/payments`.
- Expose `GET /health/live` and `GET /health/ready`.
- Validate HMAC over the exact raw request body.
- Persist webhook receipts before publication.
- Relay queued receipts until publication succeeds.
- Publish `payment.callback.confirmed`.

## Stack

- Go 1.26 toolchain
- PostgreSQL
- RabbitMQ
- Standard library HTTP
- Native Go testing

## Main flows

1. Accept a signed payment callback on `POST /webhooks/payments`.
2. Verify the signature header, timestamp tolerance, payload shape, and supported status.
3. Persist a receipt row so repeated deliveries can be deduplicated.
4. Publish `payment.callback.confirmed` and retry relay from the stored receipts when the broker is temporarily unavailable.

## Inputs and outputs

### Inputs

- HTTP routes exposed by this service:
  - `POST /webhooks/payments`
  - `GET /health/live`
  - `GET /health/ready`
- PostgreSQL for receipt storage and relay bookkeeping
- Signed callback headers and raw JSON payloads

### Outputs

- RabbitMQ event: `payment.callback.confirmed`
- Health responses for local orchestration

### Published paths through nginx

- `POST /webhooks/payments`
- `GET /webhooks/health/live`
- `GET /webhooks/health/ready`

## Local run

This service can run in isolation if PostgreSQL and RabbitMQ are available. Use `../platform/infra/docker/webhook-service.env` as the reference env file.

```sh
go run ./cmd/webhook-service
```

Common validation commands:

```sh
go test ./...
go build ./...
```

## Important configuration

- `PORT`: HTTP port. Defaults to `8081`.
- `MODULARIS_RABBITMQ_URL`: RabbitMQ connection string.
- `MODULARIS_POSTGRES_URL`: PostgreSQL connection string for receipt storage.
- `MODULARIS_POSTGRES_CONNECTION_TIMEOUT`: database connect timeout.
- `MODULARIS_WEBHOOK_HEADER`: header that carries the callback signature.
- `MODULARIS_WEBHOOK_SECRET`: shared secret used for HMAC validation.
- `MODULARIS_WEBHOOK_TOLERANCE_MS`: allowed timestamp skew for callbacks.
- `MODULARIS_WEBHOOK_ROUTING_KEY`: routing key published after validation.
- `MODULARIS_WEBHOOK_RELAY_*`: relay pacing, lease, and batch controls.
- `MODULARIS_WEBHOOK_MAX_BODY_BYTES`: request body limit.

## Tests

- Unit and integration coverage: `go test ./...`
- Build validation: `go build ./...`

## Project structure

```text
cmd/
  webhook-service/
internal/
  config/
  core/
    webhook/
  infrastructure/
    postgres/
    rabbit/
  shared/
    http/
    messaging/
```

## References

- Ecosystem hub: [../platform/README.md](../platform/README.md)
- HTTP, auth, and webhook edge: [../platform/docs/communication/http-and-auth.md](../platform/docs/communication/http-and-auth.md)
- Relay decision record: [../platform/docs/decisions/0002-webhook-receipt-relay.md](../platform/docs/decisions/0002-webhook-receipt-relay.md)
