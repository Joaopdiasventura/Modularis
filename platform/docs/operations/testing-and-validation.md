# Testing and Validation

Portuguese: [testing-and-validation.pt-BR.md](./testing-and-validation.pt-BR.md)

## Service-level checks

- `api-gateway`
  - `npm run build`
  - `npm run lint`
  - `npm test -- --runInBand`
  - `npm run test:e2e`
- `onboarding-service`
  - `npm run build`
  - `npm run lint`
  - `npm test -- --runInBand`
  - `npm run test:e2e`
- `identity-service`
  - `./gradlew test`
  - `./gradlew build`
- `membership-service`
  - `./gradlew test`
  - `./gradlew build`
- `payment-service`
  - `go test ./...`
  - `go build ./...`
- `webhook-service`
  - `go test ./...`
  - `go build ./...`

## Integrated checks

- Health routes:
  - `curl -fsS http://localhost/api/health/live`
  - `curl -fsS http://localhost/api/health/ready`
  - `curl -fsS http://localhost/webhooks/health/live`
  - `curl -fsS http://localhost/webhooks/health/ready`
- Demo generation: `node ./platform/scripts/demo/generate-manual-api-tests.mjs`
- Demo validation: `node ./platform/scripts/demo/validate-manual-api-tests.mjs`
- Browser smoke flow: open `http://localhost/api/docs` and exercise create account, replay, SSE, and webhook confirmation

On native Windows shells, replace `./gradlew` with `gradlew.bat`.

## Demo publication checks

- `http://localhost/api/docs`
- `http://localhost/api/docs/pt-br`

## Current known caveat

The integrated validator still exposes a backend issue in the unsupported-currency scenario:

- expected: `400 Unsupported currency`
- current: `502` from the onboarding flow

That mismatch is real runtime behavior and should not be documented away.
