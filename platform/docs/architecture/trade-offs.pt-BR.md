# Trade-offs

English: [trade-offs.md](./trade-offs.md)

## Serviços poliglotas

- Benefício: cada serviço usa a stack mais alinhada ao próprio trabalho.
- Custo: tooling local, onboarding de engenharia e CI exigem mais disciplina.

## Integracao orientada a RabbitMQ

- Benefício: as fronteiras de ownership ficam explícitas e a orquestração sai da borda HTTP.
- Custo: correlação, replay, dead-letter e drift de contrato precisam de controle deliberado.

## Saga persistida de onboarding

- Benefício: retries, continuação e compensação passam a ser determinísticas.
- Custo: o onboarding carrega mais complexidade de máquina de estados do que um handler simples.

## Relay durável de recibo de webhook

- Benefício: callbacks válidos de pagamento não se perdem quando o publish falha temporariamente.
- Custo: o ingresso de webhook passa a depender de PostgreSQL e de um loop de relay em vez de ser stateless.

## Demo publicada via nginx

- Benefício: superfície de showcase sem pipeline de frontend com build.
- Custo: a demo é intencionalmente operacional e menos componentizada do que um frontend dedicado.
