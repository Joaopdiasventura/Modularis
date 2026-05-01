# Modularis Platform

English: [README.md](./README.md)

`platform` é o hub oficial de documentação e orquestração do ecossistema Modularis. Ele concentra a stack integrada local, a camada nginx, o console de demo e a documentação arquitetural compartilhada entre os serviços.

## O que existe aqui

- `compose.yaml` na raiz sobe a stack local completa.
- `platform/infra` concentra nginx e os arquivos de ambiente compartilhados.
- `platform/contracts` guarda o contrato assíncrono canônico.
- `platform/docs` é a base principal de arquitetura e operação.
- `platform/scripts/demo` contém o código-fonte e a validação do console manual.
- O caminho documentado permanece direto: Docker Compose, Node, Go e Gradle.

## Subir o ecossistema

Direto pela raiz:

```sh
docker compose up --build -d
```

Para parar ou resetar a stack local:

```sh
docker compose down
docker compose down -v --remove-orphans
```

As rotas publicadas da demo permanecem:

- `http://localhost/api/docs`
- `http://localhost/api/docs/pt-br`

## Índice da documentação

- Visão geral da arquitetura: [docs/architecture/overview.pt-BR.md](./docs/architecture/overview.pt-BR.md)
- Mapa de ownership dos serviços: [docs/architecture/service-map.pt-BR.md](./docs/architecture/service-map.pt-BR.md)
- Trade-offs: [docs/architecture/trade-offs.pt-BR.md](./docs/architecture/trade-offs.pt-BR.md)
- HTTP, auth, SSE e webhook: [docs/communication/http-and-auth.pt-BR.md](./docs/communication/http-and-auth.pt-BR.md)
- RabbitMQ e fluxo de eventos: [docs/communication/events-and-rabbitmq.pt-BR.md](./docs/communication/events-and-rabbitmq.pt-BR.md)
- Desenvolvimento local: [docs/operations/local-development.pt-BR.md](./docs/operations/local-development.pt-BR.md)
- Observabilidade: [docs/operations/observability.pt-BR.md](./docs/operations/observability.pt-BR.md)
- Testes e validação: [docs/operations/testing-and-validation.pt-BR.md](./docs/operations/testing-and-validation.pt-BR.md)
- Troubleshooting: [docs/operations/troubleshooting.pt-BR.md](./docs/operations/troubleshooting.pt-BR.md)
- Decisões arquiteturais: [docs/decisions/README.pt-BR.md](./docs/decisions/README.pt-BR.md)
- Política de contratos assíncronos: [contracts/README.pt-BR.md](./contracts/README.pt-BR.md)
- Demo manual da API: [docs/demos/manual-api/README.pt-BR.md](./docs/demos/manual-api/README.pt-BR.md)

## Modelo de uso

- README raiz: introdução do projeto e quick start
- `platform`: arquitetura do ecossistema, operação, trade-offs e demos
- READMEs dos serviços: documentação isolada de cada serviço com execução local e fronteiras de integração
