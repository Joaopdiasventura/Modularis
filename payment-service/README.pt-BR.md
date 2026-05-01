# Payment Service

English: [README.md](./README.md)

Serviço Go responsável pelo workflow de pagamentos. Ele cria intenções de pagamento, avança o estado do agregado em etapas assíncronas, publica mudanças de status e emite o evento final de confirmação consumido por membership.

## Purpose

`payment-service` é o dono do ciclo de vida de pagamentos. O serviço recebe a solicitação criada durante o onboarding, persiste o agregado em MongoDB, reage a callbacks e eventos internos de entrega, e publica as transições de pagamento usadas pelo gateway e pelos serviços downstream.

## Responsibilities

- Consumir `payment.intent.create`.
- Consumir `payment.process.requested`.
- Consumir `payment.callback.confirmed`.
- Consumir `payment.delivery.requested`.
- Publicar `payment.status-updated`.
- Publicar `payment.confirmed`.
- Expor `GET /health/live` e `GET /health/ready`.

## Stack

- Go 1.26 toolchain
- MongoDB
- RabbitMQ
- HTTP da standard library
- Testes nativos de Go

## Main flows

1. Receber `payment.intent.create`, validar valor e moeda, criar o agregado de pagamento e publicar a resposta de volta para onboarding.
2. Receber `payment.process.requested` e mover o pagamento para estado de processamento.
3. Receber `payment.callback.confirmed` e atualizar o agregado para confirmado.
4. Receber `payment.delivery.requested` e publicar `payment.confirmed` quando o workflow atingir sua etapa de entrega.
5. Emitir `payment.status-updated` sempre que o estado externo relevante do pagamento mudar.

## Inputs and outputs

### Inputs

- Tráfego RabbitMQ:
  - `payment.intent.create`
  - `payment.process.requested`
  - `payment.callback.confirmed`
  - `payment.delivery.requested`
- MongoDB para persistência dos pagamentos
- Health probes:
  - `GET /health/live`
  - `GET /health/ready`

### Outputs

- Resposta RabbitMQ: `payment.intent.create.response`
- Eventos RabbitMQ:
  - `payment.status-updated`
  - `payment.confirmed`
  - follow-ups internos de workflow, como `payment.process.requested` e `payment.delivery.requested`

### Published paths through nginx

- `GET /internal/payment/health/live`
- `GET /internal/payment/health/ready`

## Local run

O serviço roda isoladamente se MongoDB e RabbitMQ estiverem disponíveis. Use `../platform/infra/docker/payment-service.env` como referência de ambiente.

```sh
go run ./cmd/payment-service
```

Comandos de validação mais comuns:

```sh
go test ./...
go build ./...
```

## Important configuration

- `PORT`: porta HTTP dos health checks. O padrão é `8080`.
- `MODULARIS_RABBITMQ_URL`: string de conexão com o RabbitMQ.
- `MODULARIS_MONGO_URI`: string de conexão do MongoDB.
- `MODULARIS_MONGO_DATABASE`: nome do banco no Mongo.
- `MODULARIS_ALLOWED_CURRENCIES`: allowlist de moedas separada por vírgula.
- `MODULARIS_PAYMENT_EXPIRATION`: janela de expiração do pagamento.
- `MODULARIS_PAYMENT_PROCESSING_ATTEMPTS`: quantidade de retries de publicação nas etapas internas.
- `MODULARIS_PAYMENT_SIMULATION_*`: parâmetros de simulação usados pela stack de demo.

## Tests

- Cobertura unitária e de integração: `go test ./...`
- Validação de build: `go build ./...`

## Project structure

```text
cmd/
  payment-service/
internal/
  config/
  core/
    payment/
  infrastructure/
    gateway/
    mongo/
    rabbit/
  shared/
    http/
    messaging/
  testsupport/
```

## References

- Hub do ecossistema: [../platform/README.pt-BR.md](../platform/README.pt-BR.md)
- RabbitMQ e fluxo de eventos: [../platform/docs/communication/events-and-rabbitmq.pt-BR.md](../platform/docs/communication/events-and-rabbitmq.pt-BR.md)
- Demo manual da API: [../platform/docs/demos/manual-api/README.pt-BR.md](../platform/docs/demos/manual-api/README.pt-BR.md)
