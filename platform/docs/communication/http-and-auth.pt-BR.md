# HTTP, Auth e Fluxos de Borda

English: [http-and-auth.md](./http-and-auth.md)

Esta página descreve a superfície HTTP do ecossistema e os mecanismos de auth usados por operadores locais e pelo console de demo.

## Rotas públicas

- `POST /api/accounts`
- `GET /api/events`
- `POST /webhooks/payments`
- `GET /api/docs`
- `GET /api/docs/pt-br`

## Modelo de auth

- O cookie de auth do navegador é emitido pelo `api-gateway` após a criação bem-sucedida da conta.
- Consumidores manuais ou externos também podem usar bearer JWT no `GET /api/events`.
- O console de demo suporta os dois modos porque a validação de SSE normalmente precisa de targeting explícito por usuário.

## SSE

- Rota: `GET /api/events`
- Escopo: apenas o usuário autenticado atual
- Famílias de eventos esperadas:
  - `payment.status-updated`
  - `user.premium-updated`

## Ingresso de webhook

- Rota: `POST /webhooks/payments`
- Assinatura: HMAC sobre o body bruto exato
- Caminho aceito de maior interesse: callback confirmado de pagamento
- Replays são deduplicados antes do relay downstream

## Rotas internas proxied

O nginx também expõe endpoints internos de health para diagnóstico local:

- `/internal/onboarding/...`
- `/internal/identity/...`
- `/internal/membership/...`
- `/internal/payment/...`
- `/webhooks/health/...`
- `/api/health/...`

Essas rotas servem para operação local e validação documental, não para uso público do produto.
