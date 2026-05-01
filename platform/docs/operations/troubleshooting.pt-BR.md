# Troubleshooting

English: [troubleshooting.md](./troubleshooting.md)

## `identity-service` ou `membership-service` falha na subida da stack

- Verifique se o PostgreSQL está healthy.
- Confirme se o `postgres-bootstrap` terminou com sucesso.
- Se o volume local for anterior ao bootstrap multi-banco, resete o estado:

```sh
docker compose down -v --remove-orphans
docker compose up --build -d
```

## `/api/docs` ou `/api/docs/pt-br` retorna `404`

- Regenere os arquivos do demo:

```sh
node ./platform/scripts/demo/generate-manual-api-tests.mjs
```

- Reinicie o nginx ou a stack completa se o bind mount estiver stale.

## Rotas de health falham logo após a subida

- Aguarde os health checks do Docker terminarem.
- Confirme com `docker compose ps` que os serviços estão healthy antes de repetir os checks HTTP.

## O validador integrado falha em moeda não suportada

- Trata-se de uma divergência real de comportamento do backend.
- O validador espera `400`.
- O fluxo atual ainda retorna `502`.

## Smoke tests repetidos continuam batendo em estado antigo

- Resete os volumes locais e recrie a stack:

```sh
docker compose down -v --remove-orphans
docker compose up --build -d
```
