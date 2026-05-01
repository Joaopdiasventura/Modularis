package webhook

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modularis/webhook-service/internal/config"
	"github.com/modularis/webhook-service/internal/shared/messaging"
)

type stubReceiptStore struct {
	ready         bool
	results       []RegistrationResult
	registerErr   error
	registrations []ReceiptRegistration
}

func (s *stubReceiptStore) Register(ctx context.Context, input ReceiptRegistration) (RegistrationResult, error) {
	if s.registerErr != nil {
		return RegistrationResult{}, s.registerErr
	}
	s.registrations = append(s.registrations, input)
	if len(s.results) == 0 {
		return RegistrationResult{Accepted: true, PublishStatus: PublishStatusPending}, nil
	}
	result := s.results[0]
	s.results = s.results[1:]
	return result, nil
}

func (s *stubReceiptStore) Ready() bool {
	return s.ready
}

func (s *stubReceiptStore) ClaimPending(ctx context.Context, lockOwner string, lockUntil time.Time, limit int) ([]Receipt, error) {
	return nil, nil
}

func (s *stubReceiptStore) MarkPublished(ctx context.Context, dedupeKey string, lockOwner string) error {
	return nil
}

func (s *stubReceiptStore) RetryPending(ctx context.Context, dedupeKey string, lockOwner string, nextAttemptAt time.Time, lastError string) error {
	return nil
}

func TestWebhookAcceptsFirstConfirmedPayment(t *testing.T) {
	receiptStore := &stubReceiptStore{
		ready: true,
		results: []RegistrationResult{
			{Accepted: true, PublishStatus: PublishStatusPending},
		},
	}
	handler := NewHandler(HandlerDependencies{
		Config: testConfig(),
		Logger: slog.New(slog.NewJSONHandler(io.Discard, nil)),
		Store:  receiptStore,
		Clock: func() time.Time {
			return time.Date(2026, 4, 25, 12, 1, 0, 0, time.UTC)
		},
	})

	body := `{"eventId":"evt-1","paymentReference":"pay-1","amount":49.9,"currency":"BRL","status":"CONFIRMED","occurredAt":"2026-04-25T12:00:00Z"}`
	header := BuildHeader("secret", time.Date(2026, 4, 25, 12, 0, 30, 0, time.UTC), []byte(body))
	request := httptest.NewRequest(http.MethodPost, "/webhooks/payments", strings.NewReader(body))
	request.Header.Set("X-Payment-Signature", header)
	request.Header.Set("X-Request-Id", "req-1")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", recorder.Code)
	}
	if len(receiptStore.registrations) != 1 {
		t.Fatalf("expected one persisted receipt, got %d", len(receiptStore.registrations))
	}

	envelope := decodeWebhookEnvelope(t, receiptStore.registrations[0].PayloadJSON)
	if envelope.MessageID != "pcb:pay-1" {
		t.Fatalf("expected stable logical message ID, got %s", envelope.MessageID)
	}
}

func TestWebhookReturnsDuplicateWhenReplayArrives(t *testing.T) {
	receiptStore := &stubReceiptStore{
		ready: true,
		results: []RegistrationResult{
			{Accepted: false, PublishStatus: PublishStatusPublished},
		},
	}
	handler := NewHandler(HandlerDependencies{
		Config: testConfig(),
		Logger: slog.New(slog.NewJSONHandler(io.Discard, nil)),
		Store:  receiptStore,
		Clock: func() time.Time {
			return time.Date(2026, 4, 25, 12, 1, 0, 0, time.UTC)
		},
	})

	sendWebhook(t, handler, `{"eventId":"evt-1","paymentReference":"pay-1","amount":49.9,"currency":"BRL","status":"CONFIRMED","occurredAt":"2026-04-25T12:00:00-03:00"}`, http.StatusOK)

	if len(receiptStore.registrations) != 1 {
		t.Fatalf("expected one registration attempt, got %d", len(receiptStore.registrations))
	}
}

func TestWebhookTreatsDifferentEventIdForSamePaymentAsDuplicate(t *testing.T) {
	receiptStore := &stubReceiptStore{
		ready: true,
		results: []RegistrationResult{
			{Accepted: false, PublishStatus: PublishStatusPending},
		},
	}
	handler := NewHandler(HandlerDependencies{
		Config: testConfig(),
		Logger: slog.New(slog.NewJSONHandler(io.Discard, nil)),
		Store:  receiptStore,
		Clock: func() time.Time {
			return time.Date(2026, 4, 25, 12, 1, 0, 0, time.UTC)
		},
	})

	sendWebhook(t, handler, `{"eventId":"evt-2","paymentReference":"pay-1","amount":49.9,"currency":"BRL","status":"CONFIRMED","occurredAt":"2026-04-25T15:00:00Z"}`, http.StatusOK)

	registration := receiptStore.registrations[0]
	if registration.DedupeKey != "CONFIRMED:pay-1" {
		t.Fatalf("expected stable dedupe key per payment, got %s", registration.DedupeKey)
	}
}

func TestWebhookRejectsExpiredSignature(t *testing.T) {
	handler := NewHandler(HandlerDependencies{
		Config: testConfig(),
		Logger: slog.New(slog.NewJSONHandler(io.Discard, nil)),
		Store:  &stubReceiptStore{ready: true},
		Clock: func() time.Time {
			return time.Date(2026, 4, 25, 12, 10, 0, 0, time.UTC)
		},
	})

	body := `{"eventId":"evt-1","paymentReference":"pay-1","amount":49.9,"currency":"BRL","status":"CONFIRMED","occurredAt":"2026-04-25T12:00:00Z"}`
	header := BuildHeader("secret", time.Date(2026, 4, 25, 12, 0, 0, 0, time.UTC), []byte(body))
	request := httptest.NewRequest(http.MethodPost, "/webhooks/payments", strings.NewReader(body))
	request.Header.Set("X-Payment-Signature", header)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", recorder.Code)
	}
}

func TestWebhookReturnsBadGatewayWhenPersistenceFails(t *testing.T) {
	handler := NewHandler(HandlerDependencies{
		Config: testConfig(),
		Logger: slog.New(slog.NewJSONHandler(io.Discard, nil)),
		Store: &stubReceiptStore{
			ready:       true,
			registerErr: context.DeadlineExceeded,
		},
		Clock: func() time.Time {
			return time.Date(2026, 4, 25, 12, 1, 0, 0, time.UTC)
		},
	})

	body := `{"eventId":"evt-1","paymentReference":"pay-1","amount":49.9,"currency":"BRL","status":"CONFIRMED","occurredAt":"2026-04-25T12:00:00Z"}`
	header := BuildHeader("secret", time.Date(2026, 4, 25, 12, 0, 30, 0, time.UTC), []byte(body))
	request := httptest.NewRequest(http.MethodPost, "/webhooks/payments", strings.NewReader(body))
	request.Header.Set("X-Payment-Signature", header)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d", recorder.Code)
	}
}

func sendWebhook(t *testing.T, handler http.Handler, body string, expectedStatus int) {
	t.Helper()
	header := BuildHeader("secret", time.Date(2026, 4, 25, 12, 0, 30, 0, time.UTC), []byte(body))
	request := httptest.NewRequest(http.MethodPost, "/webhooks/payments", strings.NewReader(body))
	request.Header.Set("X-Payment-Signature", header)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != expectedStatus {
		t.Fatalf("expected %d, got %d", expectedStatus, recorder.Code)
	}
}

func decodeWebhookEnvelope(t *testing.T, body string) messaging.Envelope[messaging.PaymentCallbackConfirmedPayload] {
	t.Helper()
	var envelope messaging.Envelope[messaging.PaymentCallbackConfirmedPayload]
	if err := json.Unmarshal([]byte(body), &envelope); err != nil {
		t.Fatalf("expected persisted payload to be a valid envelope: %v", err)
	}
	return envelope
}

func testConfig() config.Config {
	return config.Config{
		ServiceName:            "webhook-service",
		Port:                   "8081",
		EventExchange:          "modularis.events",
		PublishRoutingKey:      "payment.callback.confirmed",
		PublishAttempts:        3,
		PublishDelay:           time.Millisecond,
		PublishBackoff:         2,
		RelayBatchSize:         50,
		RelayLease:             30 * time.Second,
		RelayTick:              500 * time.Millisecond,
		PostgresURL:            "postgres://ignored",
		PostgresConnectTimeout: time.Second,
		SignatureHeader:        "x-payment-signature",
		SignatureSecret:        "secret",
		WebhookTolerance:       5 * time.Minute,
		MaxBodyBytes:           1024 * 1024,
	}
}
