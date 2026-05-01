# Desenvolvimento Local

English: [local-development.md](./local-development.md)

## Pre-requisitos

- Docker Desktop ou engine compatível
- Toolchains locais apenas quando você quiser rodar um serviço fora do Compose:
  - Node.js para os serviços NestJS
  - Java 25 para os serviços Spring Boot
  - Go 1.26.x para os serviços Go

## Subir a stack

Comando direto:

```sh
docker compose up --build -d
```

Comandos comuns de ciclo de vida:

```sh
docker compose up -d
docker compose down
docker compose down -v --remove-orphans
```

## Checks diretos úteis

- `docker compose ps`
- `docker compose logs -f`
- `curl -fsS http://localhost/api/health/live`
- `curl -fsS http://localhost/webhooks/health/ready`
- `node ./platform/scripts/demo/validate-manual-api-tests.mjs`

## Layout de ambiente

Os arquivos de ambiente compartilhados ficam em `platform/infra/docker`.

- `common.env` para defaults compartilhados
- um arquivo `*.env` por serviço para wiring da stack local

## Rodando serviços isoladamente

Cada serviço continua podendo rodar sem wrappers integrados:

- serviços NestJS usam `npm run start:dev`
- serviços Spring Boot usam `./gradlew bootRun` ou `gradlew.bat bootRun`, dependendo do shell
- serviços Go usam `go run ./cmd/...`
