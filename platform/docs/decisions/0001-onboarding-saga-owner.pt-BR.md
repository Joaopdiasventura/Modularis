# ADR 0001: Onboarding Service é Dona da Criação de Conta

English: [0001-onboarding-saga-owner.md](./0001-onboarding-saga-owner.md)

## Status

Accepted

## Contexto

O fluxo público anterior dividia a orquestração entre o gateway HTTP e os serviços downstream. Um único `POST /api/accounts` podia criar um usuário e falhar antes da intent de pagamento existir, deixando uma identidade órfã, sem saga persistida, sem fronteira determinística de retry e sem dono claro para a compensação.

## Decisão

- `api-gateway` delega a criação de conta exclusivamente para `onboarding.account.create`.
- `onboarding-service` armazena a saga canônica e o ledger de idempotência de topo.
- A saga avança por estados explícitos:
  - `STARTED`
  - `USER_CREATED`
  - `PAYMENT_CREATED`
  - `COMPLETED`
  - `FAILED`
  - `COMPENSATED`
- Cada comando downstream usa uma child idempotency key determinística derivada da requisição raiz.
- Falha permanente no pagamento aciona compensação do usuário por `identity.user.compensate`.

## Consequências

- O ownership da orquestração fica inequívoco.
- O retry após timeout ou crash passa a ser determinístico.
- Sucesso parcial fica visível e recuperável a partir do estado persistido.
- O gateway volta a ser uma borda fina.
- O onboarding passa a carregar mais complexidade e precisa continuar altamente observável.
