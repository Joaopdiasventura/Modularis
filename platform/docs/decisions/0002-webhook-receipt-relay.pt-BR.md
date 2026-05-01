# ADR 0002: Recibos de Webhook São Persistidos Antes da Publicação

English: [0002-webhook-receipt-relay.md](./0002-webhook-receipt-relay.md)

## Status

Accepted

## Contexto

A borda anterior de webhook publicava diretamente no RabbitMQ a partir da thread da requisição HTTP. Replays do PSP eram aceitos repetidamente e o caminho de publish não tinha recibo durável, então uma falha no broker ou crash do processo podia perder um callback válido ou publicar a mesma confirmação lógica mais de uma vez.

## Decisão

- `webhook-service` persiste um recibo chaveado por `CONFIRMED:<paymentReference>` antes de qualquer tentativa de publish.
- Callbacks `CONFIRMED` duplicados retornam resposta explícita de duplicidade e não criam nova confirmação lógica.
- Um loop de relay reivindica recibos pendentes, publica com publisher confirms do RabbitMQ e marca o recibo como publicado.
- Falhas de publish continuam duráveis e são reprocessadas com backoff.

## Consequências

- A proteção contra replay passa a existir na fronteira HTTP, não apenas downstream.
- Publish deixa de ser a fonte de verdade da ingestão do webhook.
- Indisponibilidade temporária do broker não obriga o PSP a causar efeitos de negócio duplicados.
- O webhook passa a depender de PostgreSQL e de um pequeno loop de relay.
