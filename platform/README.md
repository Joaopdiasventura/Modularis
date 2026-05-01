# Modularis Platform

Portuguese: [README.pt-BR.md](./README.pt-BR.md)

`platform` is the documentation and orchestration hub for the Modularis ecosystem. It owns the local integrated stack, the nginx publication layer, the demo console, and the architecture-level documentation shared across all services.

## What lives here

- `compose.yaml` at the repository root starts the full local stack.
- `platform/infra` contains nginx and shared environment files.
- `platform/contracts` stores the canonical async contract.
- `platform/docs` is the main architecture and operations knowledge base.
- `platform/scripts/demo` owns the manual API console source and validation tooling.
- The documented runtime path stays direct: Docker Compose, Node, Go, and Gradle.

## Start the ecosystem

Directly from the root:

```sh
docker compose up --build -d
```

Stop or reset the local stack with direct Docker commands:

```sh
docker compose down
docker compose down -v --remove-orphans
```

Published demo routes stay stable:

- `http://localhost/api/docs`
- `http://localhost/api/docs/pt-br`

## Documentation index

- Architecture overview: [docs/architecture/overview.md](./docs/architecture/overview.md)
- Service ownership map: [docs/architecture/service-map.md](./docs/architecture/service-map.md)
- Trade-offs: [docs/architecture/trade-offs.md](./docs/architecture/trade-offs.md)
- HTTP, auth, SSE, webhook edge: [docs/communication/http-and-auth.md](./docs/communication/http-and-auth.md)
- RabbitMQ and event flow: [docs/communication/events-and-rabbitmq.md](./docs/communication/events-and-rabbitmq.md)
- Local development: [docs/operations/local-development.md](./docs/operations/local-development.md)
- Observability: [docs/operations/observability.md](./docs/operations/observability.md)
- Testing and validation: [docs/operations/testing-and-validation.md](./docs/operations/testing-and-validation.md)
- Troubleshooting: [docs/operations/troubleshooting.md](./docs/operations/troubleshooting.md)
- Architectural decisions: [docs/decisions/README.md](./docs/decisions/README.md)
- Async contract policy: [contracts/README.md](./contracts/README.md)
- Manual API demo: [docs/demos/manual-api/README.md](./docs/demos/manual-api/README.md)

## Usage model

- Root README: project introduction and quick start
- `platform`: ecosystem-level architecture, operations, trade-offs, and demos
- Service READMEs: isolated service documentation with local run and integration boundaries
