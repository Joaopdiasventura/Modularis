# Observability

Portuguese: [observability.pt-BR.md](./observability.pt-BR.md)

## What is observable today

- Docker health checks for every container in the integrated stack
- Public and proxied health routes through nginx
- RabbitMQ management UI
- Manual API demo for operator-driven flow validation
- Service-local logs from each runtime

## Primary signals

- Health endpoints for liveness and readiness
- RabbitMQ queue depth and broker availability
- Payment confirmation and premium propagation through SSE
- Durable webhook receipt state in the webhook boundary

## Local operator tools

- `docker compose ps`
- `docker compose logs -f`
- `curl` against the published health routes
- `node ./platform/scripts/demo/validate-manual-api-tests.mjs`

## What is intentionally not here

- No centralized tracing stack
- No metrics backend bundled in Compose
- No log aggregation layer in this repository

The current observability model is lightweight and local-first.
