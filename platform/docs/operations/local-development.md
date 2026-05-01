# Local Development

Portuguese: [local-development.pt-BR.md](./local-development.pt-BR.md)

## Prerequisites

- Docker Desktop or a compatible Docker engine
- Local toolchains only when you want to run a service outside Compose:
  - Node.js for NestJS services
  - Java 25 for Spring Boot services
  - Go 1.26.x for Go services

## Start the stack

Direct command:

```sh
docker compose up --build -d
```

Common lifecycle commands:

```sh
docker compose up -d
docker compose down
docker compose down -v --remove-orphans
```

## Useful direct checks

- `docker compose ps`
- `docker compose logs -f`
- `curl -fsS http://localhost/api/health/live`
- `curl -fsS http://localhost/webhooks/health/ready`
- `node ./platform/scripts/demo/validate-manual-api-tests.mjs`

## Environment layout

Shared env files live in `platform/infra/docker`.

- `common.env` for shared defaults
- one `*.env` file per service for local stack wiring

## Running services in isolation

Each service can still be run without the integrated wrappers:

- NestJS services use `npm run start:dev`
- Spring Boot services use `./gradlew bootRun` or `gradlew.bat bootRun`, depending on the shell
- Go services use `go run ./cmd/...`
