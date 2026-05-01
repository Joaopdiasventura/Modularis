# Eventos e RabbitMQ

English: [events-and-rabbitmq.md](./events-and-rabbitmq.md)

RabbitMQ é o backbone compartilhado para comandos, eventos e respostas assíncronas entre serviços.

## Exchanges

- `modularis.commands`
- `modularis.events`
- `modularis.responses`

## Comandos principais

- `onboarding.account.create`
- `identity.user.create`
- `identity.user.compensate`
- `payment.intent.create`

## Eventos principais

- `payment.callback.confirmed`
- `payment.process.requested`
- `payment.delivery.requested`
- `payment.status-updated`
- `payment.confirmed`
- `membership.premium-activated`
- `user.premium-updated`

## Padrão de resposta assíncrona

- Request/response via RabbitMQ é usado quando a orquestração precisa de confirmação explícita do downstream.
- Gateway e onboarding dependem de metadados de correlação em vez de HTTP síncrono direto entre serviços.

## Regras de integração

- A correlação precisa sobreviver a retries e replay.
- A idempotência é escopada ao negócio, não à entrega da fila.
- Os serviços publicam eventos para transições de ownership, não para espelhar CRUD genérico.

## Referência canônica

- AsyncAPI: [../../contracts/asyncapi/modularis.yaml](../../contracts/asyncapi/modularis.yaml)
