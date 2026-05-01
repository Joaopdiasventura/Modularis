package postgres

import (
	"context"
	"database/sql"
	"errors"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/modularis/webhook-service/internal/config"
	"github.com/modularis/webhook-service/internal/core/webhook"
)

type ReceiptStore struct {
	db    *sql.DB
	ready bool
}

func NewReceiptStore(ctx context.Context, cfg config.Config) (*ReceiptStore, error) {
	db, err := sql.Open("pgx", cfg.PostgresURL)
	if err != nil {
		return nil, err
	}
	db.SetConnMaxLifetime(30 * time.Minute)
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(10)

	pingCtx, cancel := context.WithTimeout(ctx, cfg.PostgresConnectTimeout)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		_ = db.Close()
		return nil, err
	}

	store := &ReceiptStore{db: db}
	if err := store.initSchema(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	store.ready = true
	return store, nil
}

func (s *ReceiptStore) Ready() bool {
	return s.ready
}

func (s *ReceiptStore) Close() error {
	s.ready = false
	if s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *ReceiptStore) Ping(ctx context.Context) error {
	return s.db.PingContext(ctx)
}

func (s *ReceiptStore) Register(ctx context.Context, input webhook.ReceiptRegistration) (webhook.RegistrationResult, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return webhook.RegistrationResult{}, err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	var insertedKey string
	err = tx.QueryRowContext(
		ctx,
		`
			INSERT INTO webhook_receipts (
				dedupe_key,
				payment_reference,
				payment_status,
				provider_event_id,
				correlation_id,
				message_id,
				routing_key,
				payload_json,
				publish_status,
				next_attempt_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', NOW())
			ON CONFLICT (dedupe_key) DO NOTHING
			RETURNING dedupe_key
		`,
		input.DedupeKey,
		input.PaymentReference,
		input.PaymentStatus,
		input.ProviderEventID,
		input.CorrelationID,
		input.MessageID,
		input.RoutingKey,
		input.PayloadJSON,
	).Scan(&insertedKey)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		var status webhook.PublishStatus
		if scanErr := tx.QueryRowContext(
			ctx,
			`
				UPDATE webhook_receipts
				SET
					duplicate_count = duplicate_count + 1,
					updated_at = NOW()
				WHERE dedupe_key = $1
				RETURNING publish_status
			`,
			input.DedupeKey,
		).Scan(&status); scanErr != nil {
			return webhook.RegistrationResult{}, scanErr
		}
		if err := tx.Commit(); err != nil {
			return webhook.RegistrationResult{}, err
		}
		return webhook.RegistrationResult{Accepted: false, PublishStatus: status}, nil
	case err != nil:
		return webhook.RegistrationResult{}, err
	default:
		if err := tx.Commit(); err != nil {
			return webhook.RegistrationResult{}, err
		}
		return webhook.RegistrationResult{Accepted: true, PublishStatus: webhook.PublishStatusPending}, nil
	}
}

func (s *ReceiptStore) ClaimPending(
	ctx context.Context,
	lockOwner string,
	lockUntil time.Time,
	limit int,
) ([]webhook.Receipt, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`
			WITH candidate AS (
				SELECT dedupe_key
				FROM webhook_receipts
				WHERE publish_status = 'PENDING'
				  AND next_attempt_at <= NOW()
				  AND (locked_until IS NULL OR locked_until < NOW())
				ORDER BY created_at ASC
				FOR UPDATE SKIP LOCKED
				LIMIT $1
			)
			UPDATE webhook_receipts receipt
			SET
				publish_status = 'IN_FLIGHT',
				locked_by = $2,
				locked_until = $3,
				updated_at = NOW()
			FROM candidate
			WHERE receipt.dedupe_key = candidate.dedupe_key
			RETURNING receipt.dedupe_key, receipt.routing_key, receipt.payload_json, receipt.correlation_id, receipt.message_id, receipt.attempts
		`,
		limit,
		lockOwner,
		lockUntil,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]webhook.Receipt, 0, limit)
	for rows.Next() {
		var receipt webhook.Receipt
		if err := rows.Scan(
			&receipt.DedupeKey,
			&receipt.RoutingKey,
			&receipt.PayloadJSON,
			&receipt.CorrelationID,
			&receipt.MessageID,
			&receipt.Attempts,
		); err != nil {
			return nil, err
		}
		result = append(result, receipt)
	}
	return result, rows.Err()
}

func (s *ReceiptStore) MarkPublished(
	ctx context.Context,
	dedupeKey string,
	lockOwner string,
) error {
	_, err := s.db.ExecContext(
		ctx,
		`
			UPDATE webhook_receipts
			SET
				publish_status = 'PUBLISHED',
				published_at = NOW(),
				last_error = NULL,
				locked_by = NULL,
				locked_until = NULL,
				updated_at = NOW()
			WHERE dedupe_key = $1
			  AND publish_status = 'IN_FLIGHT'
			  AND locked_by = $2
		`,
		dedupeKey,
		lockOwner,
	)
	return err
}

func (s *ReceiptStore) RetryPending(
	ctx context.Context,
	dedupeKey string,
	lockOwner string,
	nextAttemptAt time.Time,
	lastError string,
) error {
	_, err := s.db.ExecContext(
		ctx,
		`
			UPDATE webhook_receipts
			SET
				publish_status = 'PENDING',
				attempts = attempts + 1,
				next_attempt_at = $3,
				last_error = $4,
				locked_by = NULL,
				locked_until = NULL,
				updated_at = NOW()
			WHERE dedupe_key = $1
			  AND publish_status = 'IN_FLIGHT'
			  AND locked_by = $2
		`,
		dedupeKey,
		lockOwner,
		nextAttemptAt,
		lastError,
	)
	return err
}

func (s *ReceiptStore) initSchema(ctx context.Context) error {
	statements := []string{
		`
			CREATE TABLE IF NOT EXISTS webhook_receipts (
				dedupe_key TEXT PRIMARY KEY,
				payment_reference TEXT NOT NULL,
				payment_status VARCHAR(32) NOT NULL,
				provider_event_id TEXT NOT NULL,
				correlation_id TEXT NOT NULL,
				message_id TEXT NOT NULL,
				routing_key TEXT NOT NULL,
				payload_json TEXT NOT NULL,
				publish_status VARCHAR(16) NOT NULL,
				attempts INTEGER NOT NULL DEFAULT 0,
				next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				locked_by TEXT,
				locked_until TIMESTAMPTZ,
				last_error TEXT,
				duplicate_count INTEGER NOT NULL DEFAULT 0,
				published_at TIMESTAMPTZ,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`,
		`
			CREATE UNIQUE INDEX IF NOT EXISTS webhook_receipts_payment_status_uidx
			ON webhook_receipts (payment_reference, payment_status)
		`,
		`
			CREATE UNIQUE INDEX IF NOT EXISTS webhook_receipts_provider_event_uidx
			ON webhook_receipts (provider_event_id)
			WHERE provider_event_id <> ''
		`,
		`
			CREATE INDEX IF NOT EXISTS webhook_receipts_pending_idx
			ON webhook_receipts (publish_status, next_attempt_at, locked_until)
		`,
	}

	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}
