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

type PaymentWebhookPayload struct {
	EventID          string  `json:"eventId"`
	PaymentReference string  `json:"paymentReference"`
	Amount           float64 `json:"amount"`
	Currency         string  `json:"currency"`
	Status           string  `json:"status"`
	OccurredAt       string  `json:"occurredAt"`
}

type PaymentCallbackConfirmedPayload struct {
	EventID          string  `json:"eventId"`
	PaymentReference string  `json:"paymentReference"`
	Amount           float64 `json:"amount"`
	Currency         string  `json:"currency"`
	OccurredAt       string  `json:"occurredAt"`
}

func NewEnvelope[T any](messageType string, correlationID string, causationID string, payload T) Envelope[T] {
	return NewEnvelopeWithMetadata(
		messageType,
		uuid.NewString(),
		correlationID,
		causationID,
		time.Now().UTC().Format(time.RFC3339Nano),
		"webhook-service",
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
