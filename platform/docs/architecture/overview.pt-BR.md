# Visão Geral da Arquitetura

English: [overview.md](./overview.md)

Modularis é organizado como um sistema distribuído pequeno, com uma borda pública, uma fronteira de orquestração e ownership separado para identidade, pagamento, membership e ingresso assinado de webhook.

## Forma do sistema

```text
browser -> nginx -> api-gateway -> RabbitMQ
                               -> onboarding-service
                               -> identity-service
                               -> payment-service
webhook caller -> nginx -> webhook-service -> RabbitMQ -> payment-service
payment-service -> membership-service -> api-gateway SSE
```

## Fluxo principal

1. `api-gateway` recebe `POST /api/accounts`.
2. O gateway publica `onboarding.account.create`.
3. `onboarding-service` persiste a saga e orquestra identidade e pagamento.
4. `webhook-service` recebe callbacks assinados do PSP e relaya `payment.callback.confirmed`.
5. `payment-service` confirma o pagamento e publica `payment.confirmed` e `payment.status-updated`.
6. `membership-service` ativa o premium e publica `user.premium-updated`.
7. `api-gateway` entrega eventos do usuário via SSE.

## Intenção de design

- Manter o gateway fino.
- Tornar a orquestração entre serviços explícita e recuperável.
- Dar a cada serviço ownership de uma fronteira de negócio durável.
- Preferir integração orientada a eventos em vez de HTTP direto entre serviços.

## Garantias centrais

- Criação de conta com saga persistida e retomável.
- Confirmação de pagamento idempotente na identidade de negócio, não no retry de transporte.
- Callback assinado durável antes do relay.
- Entitlement premium pertencente apenas ao `membership-service`.

## Leituras seguintes

- Ownership dos serviços: [service-map.pt-BR.md](./service-map.pt-BR.md)
- Borda HTTP e auth: [../communication/http-and-auth.pt-BR.md](../communication/http-and-auth.pt-BR.md)
- RabbitMQ e eventos: [../communication/events-and-rabbitmq.pt-BR.md](../communication/events-and-rabbitmq.pt-BR.md)
