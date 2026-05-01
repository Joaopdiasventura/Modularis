# Contracts

Portuguese: [README.pt-BR.md](./README.pt-BR.md)

This directory holds the canonical shared contracts for the Modularis ecosystem.

## Current source of truth

- Async contract: [asyncapi/modularis.yaml](./asyncapi/modularis.yaml)

## Contract policy

- RabbitMQ message shapes and channels are documented centrally in AsyncAPI.
- Public HTTP behavior is documented in service READMEs and in the platform communication docs, because the current ecosystem does not maintain a separate generated OpenAPI bundle in this repository.
- Shared JSON schema folders are intentionally absent until there is a real cross-service schema artifact to version independently.

## Why `http/` and `schemas/` are not present

- Empty directories create false expectations about maintained artifacts.
- The current repository already has clear sources of truth:
  - code for request/response DTOs and message payloads
  - AsyncAPI for shared async topology
  - platform docs for behavior-level integration guidance

## Related documentation

- [../docs/communication/http-and-auth.md](../docs/communication/http-and-auth.md)
- [../docs/communication/events-and-rabbitmq.md](../docs/communication/events-and-rabbitmq.md)
