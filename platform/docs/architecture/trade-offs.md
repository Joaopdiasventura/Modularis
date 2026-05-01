# Trade-offs

Portuguese: [trade-offs.pt-BR.md](./trade-offs.pt-BR.md)

## Polyglot services

- Benefit: each service uses a stack aligned with its job.
- Cost: local tooling, onboarding, and CI need more discipline.

## RabbitMQ-first integration

- Benefit: ownership boundaries stay explicit and orchestration stays off the HTTP edge.
- Cost: correlation, replay handling, dead-letter behavior, and contract drift need deliberate control.

## Persisted saga for onboarding

- Benefit: retries, continuation, and compensation become deterministic.
- Cost: onboarding carries more state-machine complexity than a simple request handler.

## Durable webhook receipt relay

- Benefit: valid payment callbacks are not lost when publish fails temporarily.
- Cost: webhook ingress depends on PostgreSQL and a relay loop instead of staying stateless.

## Demo published from nginx

- Benefit: zero frontend build pipeline for the showcase surface.
- Cost: the demo is intentionally operational and less componentized than a dedicated frontend app.
