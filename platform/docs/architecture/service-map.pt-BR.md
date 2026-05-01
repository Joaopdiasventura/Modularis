# Mapa de Serviços

English: [service-map.md](./service-map.md)

Esta página é o mapa de ownership do ecossistema atual.

## Ownership por serviço

### `api-gateway`

- Dona da borda HTTP pública.
- Emite cookies de auth e aceita bearer token.
- Entrega eventos do usuário via SSE.
- Não possui a orquestração distribuída do negócio.

### `onboarding-service`

- Dona da orquestração de criação de conta.
- Persiste a saga de onboarding e a idempotência de topo.
- Decide retries, continuação e compensação.

### `identity-service`

- Dona da persistência de identidade e da unicidade de usuário.
- Trata `identity.user.create` e `identity.user.compensate`.
- Não possui o estado premium.

### `payment-service`

- Dona do ciclo de vida da intent e das transições de confirmação do pagamento.
- Publica mudanças de status e eventos finais de confirmação.

### `membership-service`

- Dona da ativacao do entitlement premium.
- Consome pagamentos confirmados e publica atualizações premium do usuário.

### `webhook-service`

- Dona do ingresso público de callbacks assinados do PSP.
- Persiste recibos deduplicados antes do relay.

## Ownership de dados

- `onboarding-service` -> PostgreSQL `modularis_onboarding`
- `identity-service` -> PostgreSQL `modularis_identity`
- `membership-service` -> PostgreSQL `modularis_membership`
- `payment-service` -> MongoDB `modularis_payments`
- `webhook-service` -> PostgreSQL `modularis_webhook`

## Infraestrutura compartilhada

- RabbitMQ para comandos, eventos e respostas
- nginx para publicação local e reverse proxy
- Docker Compose para a stack local integrada
