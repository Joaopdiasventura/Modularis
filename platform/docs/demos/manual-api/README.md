# Manual API Demo

Portuguese: [README.pt-BR.md](./README.pt-BR.md)

This demo is the lightweight HTML surface used to exercise the real local stack without introducing a separate frontend framework.

## Published routes

- `/api/docs`
- `/api/docs/pt-br`

## Files

- `manual-api-tests.html`
- `manual-api-tests.pt-BR.html`

## Source and validation

The source of truth lives in `platform/scripts/demo`.

```sh
node ./platform/scripts/demo/generate-manual-api-tests.mjs
node ./platform/scripts/demo/validate-manual-api-tests.mjs
```

## Purpose

- manual flow validation
- demo of the public edge
- smoke-friendly showcase for recruiters and engineers

The console is intentionally operational, not a product UI.
