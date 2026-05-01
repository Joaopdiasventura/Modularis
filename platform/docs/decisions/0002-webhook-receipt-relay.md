# ADR 0002: Webhook Receipts Are Persisted Before Publish

Portuguese: [0002-webhook-receipt-relay.pt-BR.md](./0002-webhook-receipt-relay.pt-BR.md)

## Status

Accepted

## Context

The previous webhook edge published directly to RabbitMQ from the HTTP request thread. Replay from the PSP was accepted repeatedly and the publish path had no durable receipt, so a broker failure or process crash could either lose a valid callback or publish the same logical confirmation multiple times.

## Decision

- `webhook-service` persists a receipt keyed by `CONFIRMED:<paymentReference>` before any publish attempt.
- Duplicate `CONFIRMED` callbacks return an explicit duplicate response and do not create a new logical confirmation.
- A relay loop claims pending receipts, publishes with RabbitMQ publisher confirms and marks the receipt as published.
- Failed publish attempts stay durable and are retried with backoff.

## Consequences

- Replay protection exists at the HTTP boundary, not only downstream.
- Publish is no longer the source of truth for webhook ingestion.
- Temporary broker outages do not force the PSP to create duplicate business effects.
- The webhook service now depends on PostgreSQL and runs a small relay loop.
