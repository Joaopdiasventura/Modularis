# Modularis

English: [README.md](./README.md)

Modularis é um ecossistema de microsserviços poliglota usado para demonstrar onboarding distribuído, confirmação de pagamento, ativação de entitlement e validação operacional sobre fronteiras reais entre serviços.

## Visão geral

- Borda pública: NestJS
- Orquestração de saga: NestJS + PostgreSQL
- Núcleos de identidade e membership: Spring Boot + PostgreSQL
- Pagamentos e webhook: Go, MongoDB, PostgreSQL
- Backbone assíncrono: RabbitMQ
- Superfície local integrada: Docker Compose + nginx + demo HTML

## Arquitetura em uma imagem

```mermaid
flowchart LR
  subgraph Experience["Camada de Experiência"]
    Browser["Navegador / operador"]
    Demo["Demo HTML<br/>console manual"]
  end

  subgraph Edge["Borda Pública"]
    Nginx["nginx reverse proxy"]
    Gateway["api-gateway<br/>NestJS"]
    Webhook["webhook-service<br/>Go"]
  end

  subgraph Messaging["Backbone Assíncrono"]
    Rabbit["RabbitMQ<br/>commands, events, responses"]
  end

  subgraph Core["Serviços de Negócio"]
    Onboarding["onboarding-service<br/>NestJS saga"]
    Identity["identity-service<br/>Spring Boot"]
    Payment["payment-service<br/>Go"]
    Membership["membership-service<br/>Spring Boot"]
  end

  subgraph Data["Camada de Dados"]
    Postgres[("PostgreSQL<br/>onboarding, identity,<br/>membership, webhook")]
    Mongo[("MongoDB<br/>payments")]
  end

  subgraph External["Integrações Externas"]
    Provider["provedor de pagamento"]
  end

  subgraph Operations["Operação"]
    Checks["health probes<br/>smoke tests"]
    Contracts["platform docs<br/>AsyncAPI"]
  end

  Browser --> Demo
  Demo --> Nginx
  Nginx --> Gateway
  Nginx --> Webhook

  Gateway -->|auth cookie, resposta HTTP, SSE| Demo
  Gateway -->|publish onboarding.account.create| Rabbit
  Rabbit -->|consume command| Onboarding
  Onboarding -->|identity.user.create| Rabbit
  Rabbit --> Identity
  Onboarding -->|payment.intent.create| Rabbit
  Rabbit --> Payment
  Identity -->|async response| Rabbit
  Payment -->|response + status events| Rabbit
  Rabbit -->|RPC response| Gateway
  Rabbit -->|payment.confirmed| Membership
  Rabbit -->|payment.status-updated<br/>user.premium-updated| Gateway

  Provider -->|signed webhook| Nginx
  Webhook -->|verify + relay| Rabbit
  Rabbit -->|payment.callback.confirmed| Payment

  Onboarding --> Postgres
  Identity --> Postgres
  Membership --> Postgres
  Webhook --> Postgres
  Payment --> Mongo

  Checks -.-> Nginx
  Checks -.-> Gateway
  Contracts -.-> Rabbit
```

O ecossistema foi separado de forma intencional entre uma borda pública fina, um backbone assíncrono e serviços de negócio isolados. A demo conversa com o nginx, o nginx encaminha o tráfego público para o gateway e para o ingresso de webhook, e o RabbitMQ carrega a coordenação de onboarding e pagamento por trás da camada HTTP.

## Notas de arquitetura

- RabbitMQ mantém o HTTP rápido e fino enquanto a saga de onboarding, as transições de pagamento e a ativação premium acontecem de forma assíncrona entre serviços.
- A separação segue ownership claro: gateway cuida do acesso público, onboarding da orquestração, identity dos usuários, payment do estado de pagamento, membership do entitlement premium e webhook do ingresso externo assinado.
- O principal trade-off é a complexidade operacional: serviços poliglotas e request/response assíncrono adicionam mais partes móveis, mas deixam as responsabilidades explícitas e mais fáceis de evoluir de forma independente.
- A camada `platform` concentra health probes, smoke tests, contratos AsyncAPI e uma demo sem build para validar o ecossistema inteiro localmente sem depender de outro frontend.

## Execução rápida

```sh
docker compose up --build -d
```

Nenhum wrapper de shell é necessário. O caminho documentado usa Docker Compose e as toolchains nativas que cada serviço já exige.

## Mapa da documentação

- Hub do ecossistema: [platform/README.pt-BR.md](./platform/README.pt-BR.md)
- Arquitetura: [platform/docs/architecture/overview.pt-BR.md](./platform/docs/architecture/overview.pt-BR.md)
- Comunicação e eventos: [platform/docs/communication/events-and-rabbitmq.pt-BR.md](./platform/docs/communication/events-and-rabbitmq.pt-BR.md)
- Operação local: [platform/docs/operations/local-development.pt-BR.md](./platform/docs/operations/local-development.pt-BR.md)
- Contrato assíncrono: [platform/contracts/asyncapi/modularis.yaml](./platform/contracts/asyncapi/modularis.yaml)

## Serviços

- [api-gateway](./api-gateway/README.pt-BR.md)
- [onboarding-service](./onboarding-service/README.pt-BR.md)
- [identity-service](./identity-service/README.pt-BR.md)
- [membership-service](./membership-service/README.pt-BR.md)
- [payment-service](./payment-service/README.pt-BR.md)
- [webhook-service](./webhook-service/README.pt-BR.md)
