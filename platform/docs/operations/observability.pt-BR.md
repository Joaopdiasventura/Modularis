# Observabilidade

English: [observability.md](./observability.md)

## O que é observável hoje

- Health checks do Docker para todos os containers da stack integrada
- Rotas públicas e proxied de health via nginx
- UI de management do RabbitMQ
- Demo manual da API para validação de fluxo orientada por operador
- Logs locais de cada runtime

## Sinais principais

- Endpoints de liveness e readiness
- Profundidade de fila e disponibilidade do broker RabbitMQ
- Confirmação de pagamento e propagação premium via SSE
- Estado durável de recibo na borda de webhook

## Ferramentas locais do operador

- `docker compose ps`
- `docker compose logs -f`
- `curl` nas rotas publicadas de health
- `node ./platform/scripts/demo/validate-manual-api-tests.mjs`

## O que intencionalmente não existe aqui

- Sem stack centralizada de tracing
- Sem backend de métricas empacotado no Compose
- Sem camada de agregação de logs neste repositório

O modelo atual de observabilidade é leve e orientado à operação local.
