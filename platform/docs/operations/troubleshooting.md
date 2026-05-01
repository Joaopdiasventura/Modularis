# Troubleshooting

Portuguese: [troubleshooting.pt-BR.md](./troubleshooting.pt-BR.md)

## `identity-service` or `membership-service` fails during stack startup

- Check whether PostgreSQL is healthy.
- Confirm `postgres-bootstrap` completed successfully.
- If the local volume predates the multi-database bootstrap, reset the stack state:

```sh
docker compose down -v --remove-orphans
docker compose up --build -d
```

## `/api/docs` or `/api/docs/pt-br` returns `404`

- Regenerate the demo files:

```sh
node ./platform/scripts/demo/generate-manual-api-tests.mjs
```

- Restart nginx or the full stack if the bind mount is stale.

## Health routes fail intermittently right after startup

- Wait for Docker health checks to finish.
- Confirm `docker compose ps` reports healthy services before retrying the HTTP checks.

## Integrated validator fails on unsupported currency

- This is a known backend behavior mismatch.
- The validator expects `400`.
- The current flow still returns `502`.

## Repeated smoke tests keep hitting stale business state

- Reset local volumes and recreate the stack:

```sh
docker compose down -v --remove-orphans
docker compose up --build -d
```
