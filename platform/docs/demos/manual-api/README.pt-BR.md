# Demo Manual da API

English: [README.md](./README.md)

Esta demo é a superfície HTML enxuta usada para exercitar a stack local real sem introduzir um frontend separado com framework.

## Rotas publicadas

- `/api/docs`
- `/api/docs/pt-br`

## Arquivos

- `manual-api-tests.html`
- `manual-api-tests.pt-BR.html`

## Fonte e validação

A fonte de verdade fica em `platform/scripts/demo`.

```sh
node ./platform/scripts/demo/generate-manual-api-tests.mjs
node ./platform/scripts/demo/validate-manual-api-tests.mjs
```

## Propósito

- validação manual de fluxos
- demonstração da borda pública
- showcase operacional simples para recrutadores e engenheiros

O console é intencionalmente operacional, não uma UI final de produto.
