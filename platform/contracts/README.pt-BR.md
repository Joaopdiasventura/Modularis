# Contratos

English: [README.md](./README.md)

Este diretório guarda os contratos compartilhados canônicos do ecossistema Modularis.

## Fonte de verdade atual

- Contrato assíncrono: [asyncapi/modularis.yaml](./asyncapi/modularis.yaml)

## Politica de contratos

- Formatos de mensagem e canais RabbitMQ são documentados centralmente no AsyncAPI.
- O comportamento HTTP público é documentado nos READMEs dos serviços e na documentação de comunicação do `platform`, porque o ecossistema atual não mantém um bundle OpenAPI gerado dentro deste repositório.
- Pastas compartilhadas de JSON Schema ficam ausentes até existir um artefato real que precise ser versionado independentemente.

## Por que `http/` e `schemas/` não existem

- Diretórios vazios criam a falsa expectativa de artefatos mantidos.
- O repositório já possui fontes de verdade claras:
  - código para DTOs HTTP e payloads de mensagens
  - AsyncAPI para a topologia assíncrona
  - docs do `platform` para orientar comportamento e integração

## Documentação relacionada

- [../docs/communication/http-and-auth.pt-BR.md](../docs/communication/http-and-auth.pt-BR.md)
- [../docs/communication/events-and-rabbitmq.pt-BR.md](../docs/communication/events-and-rabbitmq.pt-BR.md)
