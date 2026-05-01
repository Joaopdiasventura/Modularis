# Service Map

Portuguese: [service-map.pt-BR.md](./service-map.pt-BR.md)

This page is the ownership map for the current ecosystem.

## Ownership by service

### `api-gateway`

- Owns the public HTTP edge.
- Issues auth cookies and accepts bearer tokens.
- Streams user events through SSE.
- Does not own distributed business orchestration.

### `onboarding-service`

- Owns account-creation orchestration.
- Persists the onboarding saga and top-level idempotency state.
- Decides retries, continuation, and compensation.

### `identity-service`

- Owns user identity persistence and uniqueness.
- Handles `identity.user.create` and `identity.user.compensate`.
- Does not own premium state.

### `payment-service`

- Owns payment intent lifecycle and confirmation state transitions.
- Publishes payment status changes and final confirmation events.

### `membership-service`

- Owns premium entitlement activation.
- Consumes confirmed payments and publishes user premium updates.

### `webhook-service`

- Owns public signed PSP callback ingestion.
- Persists deduplicated webhook receipts before relay.

## Data ownership

- `onboarding-service` -> PostgreSQL `modularis_onboarding`
- `identity-service` -> PostgreSQL `modularis_identity`
- `membership-service` -> PostgreSQL `modularis_membership`
- `payment-service` -> MongoDB `modularis_payments`
- `webhook-service` -> PostgreSQL `modularis_webhook`

## Shared infrastructure

- RabbitMQ for commands, events, and responses
- nginx for local publication and reverse proxying
- Docker Compose for the integrated local stack
