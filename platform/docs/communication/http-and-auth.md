# HTTP, Auth, and Edge Flows

Portuguese: [http-and-auth.pt-BR.md](./http-and-auth.pt-BR.md)

This page describes the HTTP-facing surface of the ecosystem and the auth mechanisms used by local operators and the demo console.

## Public routes

- `POST /api/accounts`
- `GET /api/events`
- `POST /webhooks/payments`
- `GET /api/docs`
- `GET /api/docs/pt-br`

## Auth model

- Browser auth cookie is issued by `api-gateway` after successful account creation.
- Manual or external consumers can also use a bearer JWT for `GET /api/events`.
- The demo console supports both modes because SSE validation often needs explicit user targeting.

## SSE

- Route: `GET /api/events`
- Scope: authenticated current user only
- Expected event families:
  - `payment.status-updated`
  - `user.premium-updated`

## Webhook ingress

- Route: `POST /webhooks/payments`
- Signature: HMAC over the exact raw body
- Accepted path of interest: confirmed payment callback
- Replays are deduplicated before downstream relay

## Internal proxied routes

nginx also exposes internal health endpoints for local diagnostics:

- `/internal/onboarding/...`
- `/internal/identity/...`
- `/internal/membership/...`
- `/internal/payment/...`
- `/webhooks/health/...`
- `/api/health/...`

These routes are for local operations and documentation validation, not for public product use.
