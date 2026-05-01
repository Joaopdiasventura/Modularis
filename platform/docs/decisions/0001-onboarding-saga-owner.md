# ADR 0001: Onboarding Service Owns Account Creation

Portuguese: [0001-onboarding-saga-owner.pt-BR.md](./0001-onboarding-saga-owner.pt-BR.md)

## Status

Accepted

## Context

The previous public flow split orchestration between the HTTP gateway and downstream services. A single `POST /api/accounts` could create a user and then fail before the payment intent existed, leaving an orphan identity with no persisted saga state, no deterministic retry boundary and no compensation owner.

## Decision

- `api-gateway` delegates account creation exclusively to `onboarding.account.create`.
- `onboarding-service` stores the canonical saga and the top-level idempotency ledger.
- The saga advances through explicit states:
  - `STARTED`
  - `USER_CREATED`
  - `PAYMENT_CREATED`
  - `COMPLETED`
  - `FAILED`
  - `COMPENSATED`
- Each downstream command uses a deterministic child idempotency key derived from the root request.
- Permanent payment failure compensates the user through `identity.user.compensate`.

## Consequences

- Orchestration ownership is unambiguous.
- Retry after timeout or crash is deterministic.
- Partial success is visible and recoverable from persisted saga state.
- The gateway becomes a thin edge service again.
- The onboarding service now owns more complexity and must remain highly observable.
