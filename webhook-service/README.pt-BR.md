# Webhook Service

English: [README.md](./README.md)

Serviço Go de ingestão de callbacks de pagamento. Ele valida a requisição assinada, armazena um recibo deduplicado e encaminha o evento de pagamento confirmado para o RabbitMQ.

## Purpose

`webhook-service` remove o tratamento de callbacks externos do write model de pagamento. O serviço é responsável por validação de assinatura, tolerância de timestamp, deduplicação de recibos e relay durável para que a ingestão continue segura mesmo quando a publicação falha temporariamente.

## Responsibilities

- Expor `POST /webhooks/payments`.
- Expor `GET /health/live` e `GET /health/ready`.
- Validar HMAC sobre o corpo bruto exato da requisição.
- Persistir recibos de webhook antes da publicação.
- Reexecutar o relay de recibos pendentes até a publicação ter sucesso.
- Publicar `payment.callback.confirmed`.

## Stack

- Go 1.26 toolchain
- PostgreSQL
- RabbitMQ
- HTTP da standard library
- Testes nativos de Go

## Main flows

1. Receber um callback assinado em `POST /webhooks/payments`.
2. Verificar assinatura, tolerância de timestamp, formato do payload e status suportado.
3. Persistir um recibo para deduplicar entregas repetidas.
4. Publicar `payment.callback.confirmed` e repetir o relay a partir dos recibos armazenados quando o broker estiver indisponível temporariamente.

## Inputs and outputs

### Inputs

- Rotas HTTP expostas pelo serviço:
  - `POST /webhooks/payments`
  - `GET /health/live`
  - `GET /health/ready`
- PostgreSQL para armazenamento de recibos e controle de relay
- Headers assinados de callback e payloads JSON brutos

### Outputs

- Evento RabbitMQ: `payment.callback.confirmed`
- Respostas de health para a orquestracao local

### Published paths through nginx

- `POST /webhooks/payments`
- `GET /webhooks/health/live`
- `GET /webhooks/health/ready`

## Local run

O serviço roda isoladamente se PostgreSQL e RabbitMQ estiverem disponíveis. Use `../platform/infra/docker/webhook-service.env` como referência de ambiente.

```sh
go run ./cmd/webhook-service
```

Comandos de validação mais comuns:

```sh
go test ./...
go build ./...
```

## Important configuration

- `PORT`: porta HTTP. O padrão é `8081`.
- `MODULARIS_RABBITMQ_URL`: string de conexão com o RabbitMQ.
- `MODULARIS_POSTGRES_URL`: string de conexão do PostgreSQL para armazenamento dos recibos.
- `MODULARIS_POSTGRES_CONNECTION_TIMEOUT`: timeout de conexão com o banco.
- `MODULARIS_WEBHOOK_HEADER`: header que carrega a assinatura do callback.
- `MODULARIS_WEBHOOK_SECRET`: segredo compartilhado usado na validação HMAC.
- `MODULARIS_WEBHOOK_TOLERANCE_MS`: desvio máximo aceito para o timestamp do callback.
- `MODULARIS_WEBHOOK_ROUTING_KEY`: routing key publicada após a validação.
- `MODULARIS_WEBHOOK_RELAY_*`: controles de lote, lease e ritmo do relay.
- `MODULARIS_WEBHOOK_MAX_BODY_BYTES`: limite do corpo da requisição.

## Tests

- Cobertura unitária e de integração: `go test ./...`
- Validação de build: `go build ./...`

## Project structure

```text
cmd/
  webhook-service/
internal/
  config/
  core/
    webhook/
  infrastructure/
    postgres/
    rabbit/
  shared/
    http/
    messaging/
```

## References

- Hub do ecossistema: [../platform/README.pt-BR.md](../platform/README.pt-BR.md)
- Borda HTTP, auth e webhook: [../platform/docs/communication/http-and-auth.pt-BR.md](../platform/docs/communication/http-and-auth.pt-BR.md)
- Registro de decisão do relay: [../platform/docs/decisions/0002-webhook-receipt-relay.pt-BR.md](../platform/docs/decisions/0002-webhook-receipt-relay.pt-BR.md)
