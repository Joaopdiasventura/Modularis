# Decisões Arquiteturais

English: [README.md](./README.md)

Os ADRs deste diretório registram decisões que mudaram materialmente o ownership ou o comportamento operacional do ecossistema atual.

## ADRs atuais

- [0001-onboarding-saga-owner.pt-BR.md](./0001-onboarding-saga-owner.pt-BR.md)
  - move o ownership da criação de conta para `onboarding-service`
- [0002-webhook-receipt-relay.pt-BR.md](./0002-webhook-receipt-relay.pt-BR.md)
  - persiste recibos assinados de webhook antes do publish
