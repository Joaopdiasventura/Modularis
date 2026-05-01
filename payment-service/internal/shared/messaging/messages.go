package messaging

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Envelope[T any] struct {
	SchemaVersion string `json:"schemaVersion"`
	MessageID     string `json:"messageId"`
	CorrelationID string `json:"correlationId"`
	CausationID   string `json:"causationId,omitempty"`
	OccurredAt    string `json:"occurredAt"`
	Type          string `json:"type"`
	Source        string `json:"source,omitempty"`
	Payload       T      `json:"payload"`
}

func (e Envelope[T]) MarshalJSON() ([]byte, error) {
	type envelopeAlias Envelope[T]
	return json.Marshal(struct {
		envelopeAlias
		EventVersion string `json:"eventVersion"`
		ID           string `json:"id"`
		Timestamp    string `json:"timestamp"`
		EventType    string `json:"eventType"`
	}{
		envelopeAlias: envelopeAlias(e),
		EventVersion:  e.SchemaVersion,
		ID:            e.MessageID,
		Timestamp:     e.OccurredAt,
		EventType:     e.Type,
	})
}

type RPCSuccess[T any] struct {
	Success bool `json:"success"`
	Data    T    `json:"data"`
}

type RPCErrorDetail struct {
	Status int    `json:"status"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
	Code   string `json:"code,omitempty"`
}

type RPCError struct {
	Success bool           `json:"success"`
	Error   RPCErrorDetail `json:"error"`
}

type PaymentCreateCommandPayload struct {
	IdempotencyKey    string  `json:"idempotencyKey"`
	RequestHash       string  `json:"requestHash"`
	UserID            string  `json:"userId"`
	CustomerName      string  `json:"customerName"`
	CustomerEmail     string  `json:"customerEmail"`
	CustomerCellphone string  `json:"customerCellphone"`
	CustomerTaxID     string  `json:"customerTaxId"`
	Amount            float64 `json:"amount"`
	Currency          string  `json:"currency"`
}

type PaymentIntentPayload struct {
	ID               string  `json:"id"`
	PaymentReference string  `json:"paymentReference"`
	Amount           float64 `json:"amount"`
	Currency         string  `json:"currency"`
	PaymentStatus    string  `json:"paymentStatus"`
	DeliveryStatus   string  `json:"deliveryStatus"`
	ExpiresAt        string  `json:"expiresAt"`
	QRCode           string  `json:"qrCode"`
	QRCodeImageURL   string  `json:"qrCodeImageUrl,omitempty"`
	Replayed         bool    `json:"replayed"`
}

type PaymentProcessRequestedPayload struct {
	PaymentID        string `json:"paymentId"`
	PaymentReference string `json:"paymentReference"`
}

type PaymentCallbackConfirmedPayload struct {
	EventID          string  `json:"eventId"`
	PaymentReference string  `json:"paymentReference"`
	Amount           float64 `json:"amount"`
	Currency         string  `json:"currency"`
	OccurredAt       string  `json:"occurredAt"`
}

type PaymentDeliveryRequestedPayload struct {
	PaymentID string `json:"paymentId"`
	UserID    string `json:"userId"`
}

type PaymentStatusUpdatedPayload struct {
	PaymentID        string `json:"paymentId"`
	PaymentReference string `json:"paymentReference"`
	UserID           string `json:"userId"`
	PaymentStatus    string `json:"paymentStatus"`
	DeliveryStatus   string `json:"deliveryStatus"`
	ConfirmedAt      string `json:"confirmedAt"`
	ExpiresAt        string `json:"expiresAt"`
}

type PaymentConfirmedPayload = PaymentStatusUpdatedPayload

func NewEnvelope[T any](messageType string, correlationID string, causationID string, payload T) Envelope[T] {
	return NewEnvelopeWithMetadata(
		messageType,
		uuid.NewString(),
		correlationID,
		causationID,
		time.Now().UTC().Format(time.RFC3339Nano),
		"payment-service",
		payload,
	)
}

func NewEnvelopeWithMetadata[T any](
	messageType string,
	messageID string,
	correlationID string,
	causationID string,
	occurredAt string,
	source string,
	payload T,
) Envelope[T] {
	return Envelope[T]{
		SchemaVersion: "1.0.0",
		MessageID:     messageID,
		CorrelationID: correlationID,
		CausationID:   causationID,
		OccurredAt:    occurredAt,
		Type:          messageType,
		Source:        source,
		Payload:       payload,
	}
}

func Marshal(v any) string {
	raw, _ := json.Marshal(v)
	return string(raw)
}
