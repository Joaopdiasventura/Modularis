# Architectural Decisions

Portuguese: [README.pt-BR.md](./README.pt-BR.md)

The ADRs in this directory capture decisions that materially changed ownership or operational behavior in the current ecosystem.

## Current ADRs

- [0001-onboarding-saga-owner.md](./0001-onboarding-saga-owner.md)
  - moves account creation ownership to `onboarding-service`
- [0002-webhook-receipt-relay.md](./0002-webhook-receipt-relay.md)
  - persists signed webhook receipts before publish
