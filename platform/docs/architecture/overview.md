# Architecture Overview

Portuguese: [overview.pt-BR.md](./overview.pt-BR.md)

Modularis is organized as a small distributed system with one public edge, one orchestration boundary, and separate ownership for identity, payment, membership, and signed webhook ingress.

## System shape

```text
browser -> nginx -> api-gateway -> RabbitMQ
                               -> onboarding-service
                               -> identity-service
                               -> payment-service
webhook caller -> nginx -> webhook-service -> RabbitMQ -> payment-service
payment-service -> membership-service -> api-gateway SSE
```

## Primary flow

1. `api-gateway` receives `POST /api/accounts`.
2. The gateway publishes `onboarding.account.create`.
3. `onboarding-service` persists the saga and orchestrates identity and payment creation.
4. `webhook-service` receives signed PSP callbacks and relays `payment.callback.confirmed`.
5. `payment-service` confirms the payment and publishes `payment.confirmed` plus `payment.status-updated`.
6. `membership-service` activates premium entitlement and publishes `user.premium-updated`.
7. `api-gateway` fans user-scoped events out through SSE.

## Design intent

- Keep the gateway thin.
- Make cross-service orchestration explicit and recoverable.
- Let each service own one durable business boundary.
- Prefer event-driven integration over direct cross-service HTTP.

## Core guarantees

- Account creation is saga-backed and resumable.
- Payment confirmation is idempotent on business identity, not transport retries.
- Signed webhook callbacks are durable before relay.
- Premium entitlement is owned only by `membership-service`.

## Next reads

- Service ownership: [service-map.md](./service-map.md)
- HTTP and auth edge: [../communication/http-and-auth.md](../communication/http-and-auth.md)
- RabbitMQ and events: [../communication/events-and-rabbitmq.md](../communication/events-and-rabbitmq.md)
