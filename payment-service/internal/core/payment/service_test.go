package payment

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/modularis/payment-service/internal/config"
	"github.com/modularis/payment-service/internal/shared/messaging"
)

type publishedMessage struct {
	routingKey string
	body       string
}

type stubPublisher struct {
	mu             sync.Mutex
	messages       []publishedMessage
	failRoutingKey string
	failCount      int
}

func (s *stubPublisher) Publish(ctx context.Context, exchange string, routingKey string, body string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failCount > 0 && (s.failRoutingKey == "" || s.failRoutingKey == routingKey) {
		s.failCount--
		return errors.New("publish failed")
	}
	s.messages = append(s.messages, publishedMessage{routingKey: routingKey, body: body})
	return nil
}

type stubGateway struct {
	result GatewayResult
	err    error
}

func (s *stubGateway) CreateIntent(paymentRecord *Payment) (PaymentIntent, error) {
	return PaymentIntent{
		Reference:      paymentRecord.PaymentReference,
		QRCode:         "qr-code",
		QRCodeImageURL: "qr-image",
	}, nil
}

func (s *stubGateway) Process(paymentRecord *Payment, attempt int) (GatewayResult, error) {
	return s.result, s.err
}

type flakyTransitionRepository struct {
	*MemoryRepository
	failMarkCompleted int
	failMarkDelivery  int
}

func (r *flakyTransitionRepository) MarkCompleted(
	ctx context.Context,
	paymentID string,
	eventID string,
	confirmedAt time.Time,
	messages []PendingMessage,
) (*Payment, bool, error) {
	if r.failMarkCompleted > 0 {
		r.failMarkCompleted--
		return nil, false, errors.New("mark completed failed")
	}
	return r.MemoryRepository.MarkCompleted(ctx, paymentID, eventID, confirmedAt, messages)
}

func (r *flakyTransitionRepository) MarkDelivery(
	ctx context.Context,
	paymentID string,
	status DeliveryStatus,
	reason string,
	messages []PendingMessage,
) (*Payment, bool, error) {
	if r.failMarkDelivery > 0 {
		r.failMarkDelivery--
		return nil, false, errors.New("mark delivery failed")
	}
	return r.MemoryRepository.MarkDelivery(ctx, paymentID, status, reason, messages)
}

func TestCreatePaymentIsIdempotent(t *testing.T) {
	repo := NewMemoryRepository()
	service := newTestService(repo, &stubGateway{}, &stubPublisher{})
	command := messaging.NewEnvelope("payment.intent.create", uuid.NewString(), "", messaging.PaymentCreateCommandPayload{
		IdempotencyKey:    "same-key",
		RequestHash:       "hash",
		UserID:            uuid.NewString(),
		CustomerName:      "John",
		CustomerEmail:     "john@example.com",
		CustomerCellphone: "5511",
		CustomerTaxID:     "123",
		Amount:            49,
		Currency:          "BRL",
	})

	first := service.CreatePayment(context.Background(), command)
	second := service.CreatePayment(context.Background(), command)

	if first == "" || second == "" {
		t.Fatalf("expected both responses to be non-empty")
	}

	var response messaging.Envelope[messaging.RPCSuccess[messaging.PaymentIntentPayload]]
	if err := json.Unmarshal([]byte(first), &response); err != nil {
		t.Fatalf("expected first response to be a valid async envelope: %v", err)
	}
	if response.Type != "payment.intent.create.response" || !response.Payload.Success {
		t.Fatalf("expected async response envelope with successful payload")
	}
}

func TestCallbackConfirmationIgnoresDuplicateWebhookEventID(t *testing.T) {
	repo := NewMemoryRepository()
	service := newTestService(repo, &stubGateway{}, &stubPublisher{})
	mustCreatePayment(t, repo, newPendingPayment("payment-1", "reference"))

	callback := confirmedCallback("event-1", "reference", time.Now().UTC())
	if err := service.HandleCallbackConfirmed(context.Background(), callback); err != nil {
		t.Fatalf("expected first callback to succeed: %v", err)
	}
	if err := service.HandleCallbackConfirmed(context.Background(), callback); err != nil {
		t.Fatalf("expected duplicate callback to be ignored: %v", err)
	}

	stored := mustLoadPayment(t, repo, "payment-1")
	if stored.PaymentStatus != PaymentStatusCompleted {
		t.Fatalf("expected payment to be completed, got %s", stored.PaymentStatus)
	}
	if len(stored.WebhookEventIDs) != 1 || stored.WebhookEventIDs[0] != "event-1" {
		t.Fatalf("expected one registered webhook event, got %v", stored.WebhookEventIDs)
	}
	assertRoutingKeyCount(t, stored.PendingMessages, "payment.delivery.requested", 1)
}

func TestCallbackConfirmationIgnoresDifferentEventIDForSamePayment(t *testing.T) {
	repo := NewMemoryRepository()
	service := newTestService(repo, &stubGateway{}, &stubPublisher{})
	mustCreatePayment(t, repo, newPendingPayment("payment-1", "reference"))

	if err := service.HandleCallbackConfirmed(context.Background(), confirmedCallback("event-1", "reference", time.Now().UTC())); err != nil {
		t.Fatalf("expected first callback to succeed: %v", err)
	}
	if err := service.HandleCallbackConfirmed(context.Background(), confirmedCallback("event-2", "reference", time.Now().UTC())); err != nil {
		t.Fatalf("expected second callback to be ignored by business CAS: %v", err)
	}

	stored := mustLoadPayment(t, repo, "payment-1")
	if stored.PaymentStatus != PaymentStatusCompleted {
		t.Fatalf("expected payment to be completed, got %s", stored.PaymentStatus)
	}
	if len(stored.WebhookEventIDs) != 1 || stored.WebhookEventIDs[0] != "event-1" {
		t.Fatalf("expected only the first event ID to be persisted, got %v", stored.WebhookEventIDs)
	}
	assertRoutingKeyCount(t, stored.PendingMessages, "payment.delivery.requested", 1)
}

func TestCallbackConfirmationIsAtomicUnderConcurrentCallbacks(t *testing.T) {
	repo := NewMemoryRepository()
	service := newTestService(repo, &stubGateway{}, &stubPublisher{})
	mustCreatePayment(t, repo, newPendingPayment("payment-1", "reference"))

	var wg sync.WaitGroup
	for index := 0; index < 12; index++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_ = service.HandleCallbackConfirmed(context.Background(), confirmedCallback("event-"+uuid.NewString(), "reference", time.Now().UTC()))
		}(index)
	}
	wg.Wait()

	stored := mustLoadPayment(t, repo, "payment-1")
	if stored.PaymentStatus != PaymentStatusCompleted {
		t.Fatalf("expected payment to be completed once, got %s", stored.PaymentStatus)
	}
	if len(stored.WebhookEventIDs) != 1 {
		t.Fatalf("expected exactly one winning callback, got %v", stored.WebhookEventIDs)
	}
	assertRoutingKeyCount(t, stored.PendingMessages, "payment.status-updated", 1)
	assertRoutingKeyCount(t, stored.PendingMessages, "payment.delivery.requested", 1)
}

func TestHandleDeliveryRequestedIsIdempotentAcrossReplays(t *testing.T) {
	repo := NewMemoryRepository()
	service := newTestService(repo, &stubGateway{}, &stubPublisher{})
	confirmedAt := time.Now().UTC().Add(-time.Minute)
	mustCreatePayment(t, repo, newCompletedPayment("payment-1", "reference", confirmedAt))

	if err := service.HandleDeliveryRequested(context.Background(), deliveryRequested("payment.delivery.requested", "payment-1")); err != nil {
		t.Fatalf("expected first delivery request to succeed: %v", err)
	}
	if err := service.HandleDeliveryRequested(context.Background(), deliveryRequested("payment.delivery.requested", "payment-1")); err != nil {
		t.Fatalf("expected replay to be ignored: %v", err)
	}

	stored := mustLoadPayment(t, repo, "payment-1")
	if stored.DeliveryStatus != DeliveryStatusDelivered {
		t.Fatalf("expected delivery to be marked delivered, got %s", stored.DeliveryStatus)
	}
	assertRoutingKeyCount(t, stored.PendingMessages, "payment.confirmed", 1)
}

func TestHandleDeliveryRequestedRetryAfterFailureDoesNotDuplicateConfirmation(t *testing.T) {
	repo := &flakyTransitionRepository{
		MemoryRepository: NewMemoryRepository(),
		failMarkDelivery: 1,
	}
	service := newTestService(repo, &stubGateway{}, &stubPublisher{})
	confirmedAt := time.Now().UTC().Add(-time.Minute)
	mustCreatePayment(t, repo, newCompletedPayment("payment-1", "reference", confirmedAt))

	err := service.HandleDeliveryRequested(context.Background(), deliveryRequested("payment.delivery.requested", "payment-1"))
	if err == nil {
		t.Fatalf("expected first delivery attempt to fail")
	}
	if err := service.HandleDeliveryRequested(context.Background(), deliveryRequested("payment.delivery.requested", "payment-1")); err != nil {
		t.Fatalf("expected retry to succeed: %v", err)
	}

	stored := mustLoadPayment(t, repo, "payment-1")
	assertRoutingKeyCount(t, stored.PendingMessages, "payment.confirmed", 1)
}

func TestCallbackRetryAfterRepositoryFailureDoesNotLoseConfirmation(t *testing.T) {
	repo := &flakyTransitionRepository{
		MemoryRepository:  NewMemoryRepository(),
		failMarkCompleted: 1,
	}
	service := newTestService(repo, &stubGateway{}, &stubPublisher{})
	mustCreatePayment(t, repo, newPendingPayment("payment-1", "reference"))

	callback := confirmedCallback("event-1", "reference", time.Now().UTC())
	err := service.HandleCallbackConfirmed(context.Background(), callback)
	if err == nil {
		t.Fatalf("expected first callback attempt to fail")
	}
	if err := service.HandleCallbackConfirmed(context.Background(), callback); err != nil {
		t.Fatalf("expected retry to succeed: %v", err)
	}

	stored := mustLoadPayment(t, repo, "payment-1")
	if stored.PaymentStatus != PaymentStatusCompleted {
		t.Fatalf("expected payment to be completed after retry, got %s", stored.PaymentStatus)
	}
	if len(stored.WebhookEventIDs) != 1 || stored.WebhookEventIDs[0] != "event-1" {
		t.Fatalf("expected event registration to happen with the successful transition, got %v", stored.WebhookEventIDs)
	}
	assertRoutingKeyCount(t, stored.PendingMessages, "payment.delivery.requested", 1)
}

func TestPublishPendingRetriesFailedConfirmationFromOutbox(t *testing.T) {
	repo := NewMemoryRepository()
	publisher := &stubPublisher{failRoutingKey: "payment.confirmed", failCount: 1}
	service := newTestService(repo, &stubGateway{}, publisher)
	confirmedAt := time.Now().UTC().Add(-time.Minute)
	mustCreatePayment(t, repo, newCompletedPayment("payment-1", "reference", confirmedAt))

	if err := service.HandleDeliveryRequested(context.Background(), deliveryRequested("payment.delivery.requested", "payment-1")); err != nil {
		t.Fatalf("expected delivery request to succeed: %v", err)
	}
	if err := service.PublishPending(context.Background()); err != nil {
		t.Fatalf("expected outbox publish cycle to continue on publish failure: %v", err)
	}

	stored := mustLoadPayment(t, repo, "payment-1")
	assertRoutingKeyCount(t, stored.PendingMessages, "payment.confirmed", 1)
	if firstPendingMessage(t, stored.PendingMessages, "payment.confirmed").Attempts != 1 {
		t.Fatalf("expected failed confirmation publish to be scheduled for retry")
	}

	time.Sleep(5 * time.Millisecond)
	if err := service.PublishPending(context.Background()); err != nil {
		t.Fatalf("expected retry publish cycle to succeed: %v", err)
	}
	stored = mustLoadPayment(t, repo, "payment-1")
	if len(stored.PendingMessages) != 0 {
		t.Fatalf("expected outbox to be fully drained after retry, got %d messages", len(stored.PendingMessages))
	}
	assertPublishedMessageCount(t, publisher.messages, "payment.confirmed", 1)
}

func TestRetryStopsOnPermanentGatewayError(t *testing.T) {
	err := retry(3, time.Millisecond, 2, func(attempt int) error {
		return GatewayError{Message: "permanent", Retryable: false}
	})
	var gatewayErr GatewayError
	if err == nil || !errors.As(err, &gatewayErr) || gatewayErr.Message != "permanent" || gatewayErr.Retryable {
		t.Fatalf("expected retry to stop on permanent error")
	}
}

func newTestService(repo PaymentRepository, gateway PaymentGateway, publisher Publisher) *Service {
	return NewService(
		slog.New(slog.NewJSONHandler(io.Discard, nil)),
		testConfig(),
		repo,
		gateway,
		publisher,
	)
}

func newPendingPayment(paymentID string, reference string) *Payment {
	return &Payment{
		ID:               paymentID,
		IdempotencyKey:   "key-" + paymentID,
		RequestHash:      "hash-" + paymentID,
		UserID:           uuid.NewString(),
		PaymentReference: reference,
		Amount:           49,
		Currency:         "BRL",
		PaymentStatus:    PaymentStatusPending,
		DeliveryStatus:   DeliveryStatusPending,
		ExpiresAt:        time.Now().UTC().Add(time.Hour),
		WebhookEventIDs:  []string{},
		PendingMessages:  []PendingMessage{},
	}
}

func newCompletedPayment(paymentID string, reference string, confirmedAt time.Time) *Payment {
	payment := newPendingPayment(paymentID, reference)
	payment.PaymentStatus = PaymentStatusCompleted
	payment.ConfirmedAt = &confirmedAt
	return payment
}

func confirmedCallback(eventID string, paymentReference string, occurredAt time.Time) messaging.Envelope[messaging.PaymentCallbackConfirmedPayload] {
	occurredAtValue := occurredAt.UTC().Format(time.RFC3339Nano)
	return messaging.NewEnvelopeWithMetadata(
		"payment.callback.confirmed",
		"pcb:"+paymentReference,
		"corr:"+paymentReference,
		eventID,
		occurredAtValue,
		"webhook-service",
		messaging.PaymentCallbackConfirmedPayload{
			EventID:          eventID,
			PaymentReference: paymentReference,
			Amount:           49,
			Currency:         "BRL",
			OccurredAt:       occurredAtValue,
		},
	)
}

func deliveryRequested(eventType string, paymentID string) messaging.Envelope[messaging.PaymentDeliveryRequestedPayload] {
	return messaging.NewEnvelopeWithMetadata(
		eventType,
		"pdr:"+paymentID,
		"corr:"+paymentID,
		"cause:"+paymentID,
		time.Now().UTC().Format(time.RFC3339Nano),
		"payment-service",
		messaging.PaymentDeliveryRequestedPayload{
			PaymentID: paymentID,
			UserID:    "user-" + paymentID,
		},
	)
}

func mustCreatePayment(t *testing.T, repo PaymentRepository, payment *Payment) {
	t.Helper()
	if _, err := repo.Create(context.Background(), payment); err != nil {
		t.Fatalf("expected payment setup to succeed: %v", err)
	}
}

func mustLoadPayment(t *testing.T, repo PaymentRepository, paymentID string) *Payment {
	t.Helper()
	payment, err := repo.FindByID(context.Background(), paymentID)
	if err != nil {
		t.Fatalf("expected payment lookup to succeed: %v", err)
	}
	if payment == nil {
		t.Fatalf("expected payment %s to exist", paymentID)
	}
	return payment
}

func assertRoutingKeyCount(t *testing.T, messages []PendingMessage, routingKey string, expected int) {
	t.Helper()
	count := 0
	for _, message := range messages {
		if message.RoutingKey == routingKey {
			count++
		}
	}
	if count != expected {
		t.Fatalf("expected %d pending messages for %s, got %d", expected, routingKey, count)
	}
}

func assertPublishedMessageCount(t *testing.T, messages []publishedMessage, routingKey string, expected int) {
	t.Helper()
	count := 0
	for _, message := range messages {
		if message.routingKey == routingKey {
			count++
		}
	}
	if count != expected {
		t.Fatalf("expected %d published messages for %s, got %d", expected, routingKey, count)
	}
}

func firstPendingMessage(t *testing.T, messages []PendingMessage, routingKey string) PendingMessage {
	t.Helper()
	for _, message := range messages {
		if message.RoutingKey == routingKey {
			return message
		}
	}
	t.Fatalf("expected pending message for routing key %s", routingKey)
	return PendingMessage{}
}

func decodePendingMessage[T any](t *testing.T, body string) messaging.Envelope[T] {
	t.Helper()
	var envelope messaging.Envelope[T]
	if err := json.Unmarshal([]byte(body), &envelope); err != nil {
		t.Fatalf("expected pending message to contain a valid envelope: %v", err)
	}
	return envelope
}

func testConfig() config.Config {
	return config.Config{
		EventExchange:                   "modularis.events",
		AllowedCurrencies:               []string{"BRL"},
		PaymentExpiration:               15 * time.Minute,
		ProcessingAttempts:              3,
		ProcessingDelay:                 time.Millisecond,
		ProcessingBackoff:               2,
		WebhookTolerance:                5 * time.Minute,
		SimulationFailuresBeforeSuccess: 0,
		SimulationSuccessRate:           1,
	}
}
