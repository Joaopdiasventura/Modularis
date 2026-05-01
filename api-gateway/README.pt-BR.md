# API Gateway

English: [README.md](./README.md)

Serviço NestJS de borda pública do ecossistema Modularis. Ele concentra a entrada HTTP, a emissão do cookie de autenticação, a entrega de SSE e a tradução da criação de conta síncrona para o workflow assíncrono de onboarding.

## Purpose

`api-gateway` é a única porta pública de escrita do ecossistema local. O serviço valida requisições HTTP, gera o cookie usado na demo, espera respostas assíncronas do onboarding via RabbitMQ e entrega eventos do usuário pelo stream SSE.

## Responsibilities

- Expor `POST /accounts` e publicar `onboarding.account.create`.
- Expor `GET /events` e transmitir SSE autenticado.
- Expor `GET /health/live` e `GET /health/ready`.
- Assinar JWTs e gravar o cookie de autenticação usado pelo fluxo web.
- Traduzir atualizações assíncronas de onboarding, pagamento e membership para respostas HTTP ou SSE.

## Stack

- NestJS 11
- TypeScript
- RabbitMQ
- JWT + autenticação por cookie
- Server-Sent Events
- Jest + Supertest

## Main flows

1. Receber `POST /accounts`, validar DTO e `Idempotency-Key`, publicar o comando de onboarding, aguardar a resposta assíncrona e emitir o cookie de autenticação.
2. Receber `GET /events`, autenticar o usuário e transmitir eventos `payment.status-updated` e `user.premium-updated` filtrados por usuário.
3. Expor sondas de liveness e readiness para que a stack local detecte falhas da borda HTTP sem depender do restante do sistema.

## Inputs and outputs

### Inputs

- Rotas HTTP expostas pelo serviço:
  - `POST /accounts`
  - `GET /events`
  - `GET /health/live`
  - `GET /health/ready`
- Respostas RabbitMQ vindas da response exchange.
- Eventos RabbitMQ de domínio:
  - `payment.status-updated`
  - `user.premium-updated`

### Outputs

- Comando RabbitMQ: `onboarding.account.create`
- Respostas HTTP `201` com `Set-Cookie` e `Idempotency-Replayed`
- Frames SSE limitados ao usuário autenticado

### Published paths through nginx

- `POST /api/accounts`
- `GET /api/events`
- `GET /api/health/live`
- `GET /api/health/ready`

## Local run

O serviço pode rodar isoladamente, mas depende de RabbitMQ e de um responder para o tráfego RPC de onboarding. Use `../platform/infra/docker/api-gateway.env` como referência de ambiente.

```sh
npm install
npm run start:dev
```

Comandos de validação mais comuns:

```sh
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e
```

## Important configuration

- `PORT`: porta HTTP da aplicação. O padrão é `3000`.
- `MODULARIS_ALLOWED_ORIGINS`: allowlist de CORS separada por virgula.
- `MODULARIS_RABBITMQ_URL`: string de conexão com o RabbitMQ.
- `MODULARIS_JWT_SECRET`: chave usada para assinar o token do cookie.
- `MODULARIS_AUTH_COOKIE_NAME`: nome do cookie emitido após a criação de conta.
- `MODULARIS_RPC_TIMEOUT_MS`: timeout de espera pelas respostas RPC do onboarding.

## Tests

- Testes unitários e de integração: `npm test -- --runInBand`
- Cobertura E2E: `npm run test:e2e`
- Validação de build e lint:

```sh
npm run build
npm run lint
```

## Project structure

```text
src/
  config/
  core/
    account/
      dto/
      types/
      __test__/
    event-stream/
      types/
  shared/
    filters/
    http/
    logging/
    middleware/
    modules/
      auth/
      health/
      messaging/
    utils/
test/
```

## References

- Hub do ecossistema: [../platform/README.pt-BR.md](../platform/README.pt-BR.md)
- Borda HTTP, auth e SSE: [../platform/docs/communication/http-and-auth.pt-BR.md](../platform/docs/communication/http-and-auth.pt-BR.md)
- Contratos assíncronos: [../platform/contracts/asyncapi/modularis.yaml](../platform/contracts/asyncapi/modularis.yaml)
