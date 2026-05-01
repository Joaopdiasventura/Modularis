package webhook

import (
	"context"
	"time"
)

type PublishStatus string

const (
	PublishStatusPending   PublishStatus = "PENDING"
	PublishStatusInFlight  PublishStatus = "IN_FLIGHT"
	PublishStatusPublished PublishStatus = "PUBLISHED"
)

type ReceiptRegistration struct {
	DedupeKey        string
	PaymentReference string
	PaymentStatus    string
	ProviderEventID  string
	CorrelationID    string
	MessageID        string
	RoutingKey       string
	PayloadJSON      string
}

type RegistrationResult struct {
	Accepted      bool
	PublishStatus PublishStatus
}

type Receipt struct {
	DedupeKey     string
	RoutingKey    string
	PayloadJSON   string
	CorrelationID string
	MessageID     string
	Attempts      int
}

type ReceiptStore interface {
	Register(ctx context.Context, input ReceiptRegistration) (RegistrationResult, error)
	ClaimPending(ctx context.Context, lockOwner string, lockUntil time.Time, limit int) ([]Receipt, error)
	MarkPublished(ctx context.Context, dedupeKey string, lockOwner string) error
	RetryPending(ctx context.Context, dedupeKey string, lockOwner string, nextAttemptAt time.Time, lastError string) error
	Ready() bool
}

type Publisher interface {
	Publish(ctx context.Context, exchange string, routingKey string, body string) error
	Ready() bool
}
