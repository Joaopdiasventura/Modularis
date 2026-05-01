package webhook

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/modularis/webhook-service/internal/config"
)

type Relay struct {
	logger    *slog.Logger
	config    config.Config
	store     ReceiptStore
	publisher Publisher
	clock     func() time.Time
}

func NewRelay(
	logger *slog.Logger,
	cfg config.Config,
	store ReceiptStore,
	publisher Publisher,
) *Relay {
	if logger == nil {
		logger = slog.Default()
	}
	return &Relay{
		logger:    logger,
		config:    cfg,
		store:     store,
		publisher: publisher,
		clock:     time.Now,
	}
}

func (r *Relay) Run(ctx context.Context) {
	ticker := time.NewTicker(r.config.RelayTick)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if r.store == nil || r.publisher == nil || !r.publisher.Ready() {
				continue
			}

			lockOwner := "relay:" + uuid.NewString()
			receipts, err := r.store.ClaimPending(
				ctx,
				lockOwner,
				r.clock().UTC().Add(r.config.RelayLease),
				r.config.RelayBatchSize,
			)
			if err != nil {
				r.logger.Warn("failed to claim pending webhook receipts", "error", err)
				continue
			}

			for _, receipt := range receipts {
				if err := r.publisher.Publish(ctx, r.config.EventExchange, receipt.RoutingKey, receipt.PayloadJSON); err != nil {
					retryAt := r.clock().UTC().Add(backoffDelay(receipt.Attempts+1, r.config.PublishDelay, r.config.PublishBackoff))
					_ = r.store.RetryPending(
						ctx,
						receipt.DedupeKey,
						lockOwner,
						retryAt,
						err.Error(),
					)
					r.logger.Warn(
						"failed to relay webhook receipt",
						"dedupeKey", receipt.DedupeKey,
						"correlationId", receipt.CorrelationID,
						"error", err,
					)
					continue
				}

				if err := r.store.MarkPublished(ctx, receipt.DedupeKey, lockOwner); err != nil {
					r.logger.Warn(
						"failed to mark webhook receipt as published",
						"dedupeKey", receipt.DedupeKey,
						"correlationId", receipt.CorrelationID,
						"error", err,
					)
				}
			}
		}
	}
}

func backoffDelay(attempt int, base time.Duration, backoff int) time.Duration {
	if attempt <= 1 || backoff <= 1 {
		return base
	}
	multiplier := 1
	for i := 1; i < attempt; i++ {
		multiplier *= backoff
	}
	return time.Duration(multiplier) * base
}
