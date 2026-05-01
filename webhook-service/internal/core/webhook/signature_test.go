package webhook

import (
	"errors"
	"testing"
	"time"
)

func TestValidateAcceptsSignedPayload(t *testing.T) {
	body := []byte(`{"eventId":"evt-1"}`)
	timestamp := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	header := BuildHeader("secret", timestamp, body)

	err := Validate("secret", header, body, timestamp.Add(30*time.Second), 5*time.Minute)
	if err != nil {
		t.Fatalf("expected signature to be valid, got %v", err)
	}
}

func TestValidateRejectsExpiredSignature(t *testing.T) {
	body := []byte(`{"eventId":"evt-1"}`)
	timestamp := time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC)
	header := BuildHeader("secret", timestamp, body)

	err := Validate("secret", header, body, timestamp.Add(6*time.Minute), 5*time.Minute)
	if !errors.Is(err, ErrExpiredSignature) {
		t.Fatalf("expected expired signature error, got %v", err)
	}
}
