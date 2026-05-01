package payment

import (
	"context"
	"time"
)

type PaymentStatus string

const (
	PaymentStatusPending    PaymentStatus = "PENDING"
	PaymentStatusProcessing PaymentStatus = "PROCESSING"
	PaymentStatusCompleted  PaymentStatus = "COMPLETED"
	PaymentStatusFailed     PaymentStatus = "FAILED"
	PaymentStatusExpired    PaymentStatus = "EXPIRED"
)

type DeliveryStatus string

const (
	DeliveryStatusPending   DeliveryStatus = "PENDING"
	DeliveryStatusDelivered DeliveryStatus = "DELIVERED"
	DeliveryStatusFailed    DeliveryStatus = "FAILED"
)

type PendingMessage struct {
	ID            string     `bson:"id" json:"id"`
	Exchange      string     `bson:"exchange" json:"exchange"`
	RoutingKey    string     `bson:"routingKey" json:"routingKey"`
	Body          string     `bson:"body" json:"body"`
	Attempts      int        `bson:"attempts" json:"attempts"`
	NextAttemptAt time.Time  `bson:"nextAttemptAt" json:"nextAttemptAt"`
	ClaimToken    string     `bson:"claimToken,omitempty" json:"claimToken,omitempty"`
	ClaimedUntil  *time.Time `bson:"claimedUntil,omitempty" json:"claimedUntil,omitempty"`
}

type Payment struct {
	ID                    string           `bson:"_id,omitempty" json:"id"`
	IdempotencyKey        string           `bson:"idempotencyKey" json:"idempotencyKey"`
	RequestHash           string           `bson:"requestHash" json:"requestHash"`
	UserID                string           `bson:"userId" json:"userId"`
	CustomerName          string           `bson:"customerName" json:"customerName"`
	CustomerEmail         string           `bson:"customerEmail" json:"customerEmail"`
	CustomerCellphone     string           `bson:"customerCellphone" json:"customerCellphone"`
	CustomerTaxID         string           `bson:"customerTaxId" json:"customerTaxId"`
	PaymentReference      string           `bson:"paymentReference" json:"paymentReference"`
	Amount                float64          `bson:"amount" json:"amount"`
	Currency              string           `bson:"currency" json:"currency"`
	PaymentStatus         PaymentStatus    `bson:"paymentStatus" json:"paymentStatus"`
	DeliveryStatus        DeliveryStatus   `bson:"deliveryStatus" json:"deliveryStatus"`
	ProcessingAttempts    int              `bson:"processingAttempts" json:"processingAttempts"`
	ExpiresAt             time.Time        `bson:"expiresAt" json:"expiresAt"`
	ProcessingStartedAt   *time.Time       `bson:"processingStartedAt,omitempty" json:"processingStartedAt,omitempty"`
	ConfirmedAt           *time.Time       `bson:"confirmedAt,omitempty" json:"confirmedAt,omitempty"`
	PaymentFailureReason  string           `bson:"paymentFailureReason,omitempty" json:"paymentFailureReason,omitempty"`
	DeliveryFailureReason string           `bson:"deliveryFailureReason,omitempty" json:"deliveryFailureReason,omitempty"`
	WebhookEventIDs       []string         `bson:"webhookEventIds" json:"webhookEventIds"`
	PendingMessages       []PendingMessage `bson:"pendingMessages" json:"pendingMessages"`
	CreatedAt             time.Time        `bson:"createdAt" json:"createdAt"`
	UpdatedAt             time.Time        `bson:"updatedAt" json:"updatedAt"`
}

type PendingPublish struct {
	PaymentID string
	Message   PendingMessage
}

type PaymentRepository interface {
	FindByIdempotencyKey(ctx context.Context, idempotencyKey string) (*Payment, error)
	Create(ctx context.Context, payment *Payment) (*Payment, error)
	FindByID(ctx context.Context, paymentID string) (*Payment, error)
	FindByReference(ctx context.Context, reference string) (*Payment, error)
	ReserveForProcessing(ctx context.Context, paymentID string, now time.Time) (*Payment, error)
	EnqueueMessages(ctx context.Context, paymentID string, messages []PendingMessage) error
	MarkFailed(ctx context.Context, paymentID string, reason string, messages []PendingMessage) (*Payment, bool, error)
	MarkExpired(ctx context.Context, paymentID string, messages []PendingMessage) (*Payment, bool, error)
	MarkCompleted(ctx context.Context, paymentID string, eventID string, confirmedAt time.Time, messages []PendingMessage) (*Payment, bool, error)
	MarkDelivery(ctx context.Context, paymentID string, status DeliveryStatus, reason string, messages []PendingMessage) (*Payment, bool, error)
	ClaimPendingPublishes(ctx context.Context, before time.Time, claimUntil time.Time, limit int) ([]PendingPublish, error)
	AcknowledgePendingPublish(ctx context.Context, paymentID string, messageID string, claimToken string) error
	RetryPendingPublish(ctx context.Context, paymentID string, messageID string, claimToken string, nextAttemptAt time.Time, attempts int) error
	Ping(ctx context.Context) error
}
