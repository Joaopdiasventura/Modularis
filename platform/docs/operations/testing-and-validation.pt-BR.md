# Testes e Validação

English: [testing-and-validation.md](./testing-and-validation.md)

## Checks por serviço

- `api-gateway`
  - `npm run build`
  - `npm run lint`
  - `npm test -- --runInBand`
  - `npm run test:e2e`
- `onboarding-service`
  - `npm run build`
  - `npm run lint`
  - `npm test -- --runInBand`
  - `npm run test:e2e`
- `identity-service`
  - `./gradlew test`
  - `./gradlew build`
- `membership-service`
  - `./gradlew test`
  - `./gradlew build`
- `payment-service`
  - `go test ./...`
  - `go build ./...`
- `webhook-service`
  - `go test ./...`
  - `go build ./...`

## Checks integrados

- Rotas de health:
  - `curl -fsS http://localhost/api/health/live`
  - `curl -fsS http://localhost/api/health/ready`
  - `curl -fsS http://localhost/webhooks/health/live`
  - `curl -fsS http://localhost/webhooks/health/ready`
- Geração da demo: `node ./platform/scripts/demo/generate-manual-api-tests.mjs`
- Validação da demo: `node ./platform/scripts/demo/validate-manual-api-tests.mjs`
- Smoke flow no navegador: abra `http://localhost/api/docs` e execute criação de conta, replay, SSE e confirmação de webhook

Em shells nativos do Windows, troque `./gradlew` por `gradlew.bat`.

## Checks de publicação da demo

- `http://localhost/api/docs`
- `http://localhost/api/docs/pt-br`

## Caveat conhecido no momento

O validador integrado ainda revela um problema real de backend no cenário de moeda não suportada:

- esperado: `400 Unsupported currency`
- atual: `502` vindo do fluxo de onboarding

Essa divergência é comportamento real do runtime e não deve ser mascarada na documentação.
