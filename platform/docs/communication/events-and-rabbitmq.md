# Events and RabbitMQ

Portuguese: [events-and-rabbitmq.pt-BR.md](./events-and-rabbitmq.pt-BR.md)

RabbitMQ is the shared integration backbone for cross-service commands, events, and async responses.

## Exchanges

- `modularis.commands`
- `modularis.events`
- `modularis.responses`

## Key commands

- `onboarding.account.create`
- `identity.user.create`
- `identity.user.compensate`
- `payment.intent.create`

## Key events

- `payment.callback.confirmed`
- `payment.process.requested`
- `payment.delivery.requested`
- `payment.status-updated`
- `payment.confirmed`
- `membership.premium-activated`
- `user.premium-updated`

## Async response pattern

- Request/response over RabbitMQ is used where orchestration needs explicit downstream acknowledgement.
- The gateway and onboarding boundary rely on correlation metadata instead of synchronous direct HTTP between services.

## Integration rules

- Correlation must survive retries and replay.
- Idempotency is business-scoped, not queue-delivery-scoped.
- Services publish events for ownership transitions, not for generic CRUD mirroring.

## Canonical reference

- AsyncAPI: [../../contracts/asyncapi/modularis.yaml](../../contracts/asyncapi/modularis.yaml)
