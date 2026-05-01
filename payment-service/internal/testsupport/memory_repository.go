package testsupport

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/modularis/payment-service/internal/core/payment"
)

type MemoryRepository struct {
	mu       sync.Mutex
	payments map[string]*payment.Payment
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{payments: map[string]*payment.Payment{}}
}

func (r *MemoryRepository) Ping(ctx context.Context) error { return nil }

func (r *MemoryRepository) FindByIdempotencyKey(ctx context.Context, idempotencyKey string) (*payment.Payment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, payment := range r.payments {
		if payment.IdempotencyKey == idempotencyKey {
			return clone(payment), nil
		}
	}
	return nil, nil
}

func (r *MemoryRepository) Create(ctx context.Context, paymentRecord *payment.Payment) (*payment.Payment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now().UTC()
	stored := clone(paymentRecord)
	stored.CreatedAt = now
	stored.UpdatedAt = now
	if stored.PendingMessages == nil {
		stored.PendingMessages = []payment.PendingMessage{}
	}
	if stored.WebhookEventIDs == nil {
		stored.WebhookEventIDs = []string{}
	}
	r.payments[paymentRecord.ID] = stored
	return clone(stored), nil
}

func (r *MemoryRepository) FindByID(ctx context.Context, paymentID string) (*payment.Payment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if payment, ok := r.payments[paymentID]; ok {
		return clone(payment), nil
	}
	return nil, nil
}

func (r *MemoryRepository) FindByReference(ctx context.Context, reference string) (*payment.Payment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, payment := range r.payments {
		if payment.PaymentReference == reference {
			return clone(payment), nil
		}
	}
	return nil, nil
}

func (r *MemoryRepository) ReserveForProcessing(ctx context.Context, paymentID string, now time.Time) (*payment.Payment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	paymentRecord, ok := r.payments[paymentID]
	if !ok || paymentRecord.PaymentStatus != payment.PaymentStatusPending || !paymentRecord.ExpiresAt.After(now) {
		return nil, nil
	}
	paymentRecord.PaymentStatus = payment.PaymentStatusProcessing
	paymentRecord.ProcessingAttempts++
	paymentRecord.ProcessingStartedAt = &now
	paymentRecord.PaymentFailureReason = ""
	paymentRecord.UpdatedAt = now
	return clone(paymentRecord), nil
}

func (r *MemoryRepository) EnqueueMessages(ctx context.Context, paymentID string, messages []payment.PendingMessage) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	payment := r.payments[paymentID]
	payment.PendingMessages = append(payment.PendingMessages, cloneMessages(messages)...)
	payment.UpdatedAt = time.Now().UTC()
	return nil
}

func (r *MemoryRepository) MarkFailed(ctx context.Context, paymentID string, reason string, messages []payment.PendingMessage) (*payment.Payment, bool, error) {
	return r.transition(paymentID, messages, func(paymentRecord *payment.Payment) bool {
		return paymentRecord.PaymentStatus == payment.PaymentStatusProcessing
	}, func(paymentRecord *payment.Payment) {
		paymentRecord.PaymentStatus = payment.PaymentStatusFailed
		paymentRecord.PaymentFailureReason = reason
	})
}

func (r *MemoryRepository) MarkExpired(ctx context.Context, paymentID string, messages []payment.PendingMessage) (*payment.Payment, bool, error) {
	return r.transition(paymentID, messages, func(paymentRecord *payment.Payment) bool {
		return paymentRecord.PaymentStatus == payment.PaymentStatusPending ||
			paymentRecord.PaymentStatus == payment.PaymentStatusProcessing ||
			paymentRecord.PaymentStatus == payment.PaymentStatusFailed
	}, func(paymentRecord *payment.Payment) {
		paymentRecord.PaymentStatus = payment.PaymentStatusExpired
		paymentRecord.ProcessingStartedAt = nil
	})
}

func (r *MemoryRepository) MarkCompleted(
	ctx context.Context,
	paymentID string,
	eventID string,
	confirmedAt time.Time,
	messages []payment.PendingMessage,
) (*payment.Payment, bool, error) {
	return r.transition(paymentID, messages, func(paymentRecord *payment.Payment) bool {
		return paymentRecord.PaymentStatus == payment.PaymentStatusPending ||
			paymentRecord.PaymentStatus == payment.PaymentStatusProcessing ||
			paymentRecord.PaymentStatus == payment.PaymentStatusFailed
	}, func(paymentRecord *payment.Payment) {
		paymentRecord.PaymentStatus = payment.PaymentStatusCompleted
		paymentRecord.ConfirmedAt = &confirmedAt
		paymentRecord.PaymentFailureReason = ""
		paymentRecord.ProcessingStartedAt = nil
		if eventID != "" && !containsString(paymentRecord.WebhookEventIDs, eventID) {
			paymentRecord.WebhookEventIDs = append(paymentRecord.WebhookEventIDs, eventID)
		}
	})
}

func (r *MemoryRepository) MarkDelivery(
	ctx context.Context,
	paymentID string,
	status payment.DeliveryStatus,
	reason string,
	messages []payment.PendingMessage,
) (*payment.Payment, bool, error) {
	return r.transition(paymentID, messages, func(paymentRecord *payment.Payment) bool {
		return paymentRecord.PaymentStatus == payment.PaymentStatusCompleted &&
			paymentRecord.DeliveryStatus == payment.DeliveryStatusPending
	}, func(paymentRecord *payment.Payment) {
		paymentRecord.DeliveryStatus = status
		paymentRecord.DeliveryFailureReason = reason
	})
}

func (r *MemoryRepository) ClaimPendingPublishes(ctx context.Context, before time.Time, claimUntil time.Time, limit int) ([]payment.PendingPublish, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	result := make([]payment.PendingPublish, 0, limit)
	for _, paymentRecord := range r.payments {
		for index := range paymentRecord.PendingMessages {
			pending := &paymentRecord.PendingMessages[index]
			if !pending.NextAttemptAt.After(before) && !isClaimed(pending, before) {
				claimToken := uuid.NewString()
				claimedUntil := claimUntil
				pending.ClaimToken = claimToken
				pending.ClaimedUntil = &claimedUntil
				paymentRecord.UpdatedAt = time.Now().UTC()
				result = append(result, payment.PendingPublish{
					PaymentID: paymentRecord.ID,
					Message:   clonePendingMessage(*pending),
				})
				if len(result) == limit {
					return result, nil
				}
			}
		}
	}
	return result, nil
}

func (r *MemoryRepository) AcknowledgePendingPublish(ctx context.Context, paymentID string, messageID string, claimToken string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	paymentRecord := r.payments[paymentID]
	filtered := make([]payment.PendingMessage, 0, len(paymentRecord.PendingMessages))
	for _, message := range paymentRecord.PendingMessages {
		if message.ID != messageID || message.ClaimToken != claimToken {
			filtered = append(filtered, message)
		}
	}
	paymentRecord.PendingMessages = filtered
	paymentRecord.UpdatedAt = time.Now().UTC()
	return nil
}

func (r *MemoryRepository) RetryPendingPublish(
	ctx context.Context,
	paymentID string,
	messageID string,
	claimToken string,
	nextAttemptAt time.Time,
	attempts int,
) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for index, message := range r.payments[paymentID].PendingMessages {
		if message.ID == messageID && message.ClaimToken == claimToken {
			r.payments[paymentID].PendingMessages[index].NextAttemptAt = nextAttemptAt
			r.payments[paymentID].PendingMessages[index].Attempts = attempts
			r.payments[paymentID].PendingMessages[index].ClaimToken = ""
			r.payments[paymentID].PendingMessages[index].ClaimedUntil = nil
			r.payments[paymentID].UpdatedAt = time.Now().UTC()
			return nil
		}
	}
	return errors.New("pending message not found")
}

func (r *MemoryRepository) transition(
	paymentID string,
	messages []payment.PendingMessage,
	allowed func(*payment.Payment) bool,
	updater func(*payment.Payment),
) (*payment.Payment, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	paymentRecord, ok := r.payments[paymentID]
	if !ok {
		return nil, false, nil
	}
	if !allowed(paymentRecord) {
		return clone(paymentRecord), false, nil
	}
	updater(paymentRecord)
	paymentRecord.PendingMessages = append(paymentRecord.PendingMessages, cloneMessages(messages)...)
	paymentRecord.UpdatedAt = time.Now().UTC()
	return clone(paymentRecord), true, nil
}

func clone(paymentRecord *payment.Payment) *payment.Payment {
	copyValue := *paymentRecord
	copyValue.WebhookEventIDs = append([]string{}, paymentRecord.WebhookEventIDs...)
	copyValue.PendingMessages = cloneMessages(paymentRecord.PendingMessages)
	copyValue.ProcessingStartedAt = cloneTime(paymentRecord.ProcessingStartedAt)
	copyValue.ConfirmedAt = cloneTime(paymentRecord.ConfirmedAt)
	return &copyValue
}

func cloneMessages(messages []payment.PendingMessage) []payment.PendingMessage {
	if len(messages) == 0 {
		return nil
	}
	cloned := make([]payment.PendingMessage, 0, len(messages))
	for _, message := range messages {
		cloned = append(cloned, clonePendingMessage(message))
	}
	return cloned
}

func clonePendingMessage(message payment.PendingMessage) payment.PendingMessage {
	copyValue := message
	copyValue.ClaimedUntil = cloneTime(message.ClaimedUntil)
	return copyValue
}

func cloneTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	copyValue := *value
	return &copyValue
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func isClaimed(message *payment.PendingMessage, now time.Time) bool {
	if message.ClaimToken == "" || message.ClaimedUntil == nil {
		return false
	}
	return message.ClaimedUntil.After(now)
}
