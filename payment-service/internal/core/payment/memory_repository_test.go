package payment

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
)

type MemoryRepository struct {
	mu       sync.Mutex
	payments map[string]*Payment
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{payments: map[string]*Payment{}}
}

func (r *MemoryRepository) Ping(ctx context.Context) error { return nil }

func (r *MemoryRepository) FindByIdempotencyKey(ctx context.Context, idempotencyKey string) (*Payment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, paymentRecord := range r.payments {
		if paymentRecord.IdempotencyKey == idempotencyKey {
			return clonePayment(paymentRecord), nil
		}
	}
	return nil, nil
}

func (r *MemoryRepository) Create(ctx context.Context, paymentRecord *Payment) (*Payment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now().UTC()
	stored := clonePayment(paymentRecord)
	stored.CreatedAt = now
	stored.UpdatedAt = now
	if stored.PendingMessages == nil {
		stored.PendingMessages = []PendingMessage{}
	}
	if stored.WebhookEventIDs == nil {
		stored.WebhookEventIDs = []string{}
	}
	r.payments[paymentRecord.ID] = stored
	return clonePayment(stored), nil
}

func (r *MemoryRepository) FindByID(ctx context.Context, paymentID string) (*Payment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if paymentRecord, ok := r.payments[paymentID]; ok {
		return clonePayment(paymentRecord), nil
	}
	return nil, nil
}

func (r *MemoryRepository) FindByReference(ctx context.Context, reference string) (*Payment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, paymentRecord := range r.payments {
		if paymentRecord.PaymentReference == reference {
			return clonePayment(paymentRecord), nil
		}
	}
	return nil, nil
}

func (r *MemoryRepository) ReserveForProcessing(ctx context.Context, paymentID string, now time.Time) (*Payment, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	paymentRecord, ok := r.payments[paymentID]
	if !ok || paymentRecord.PaymentStatus != PaymentStatusPending || !paymentRecord.ExpiresAt.After(now) {
		return nil, nil
	}
	paymentRecord.PaymentStatus = PaymentStatusProcessing
	paymentRecord.ProcessingAttempts++
	paymentRecord.ProcessingStartedAt = &now
	paymentRecord.PaymentFailureReason = ""
	paymentRecord.UpdatedAt = now
	return clonePayment(paymentRecord), nil
}

func (r *MemoryRepository) EnqueueMessages(ctx context.Context, paymentID string, messages []PendingMessage) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	paymentRecord := r.payments[paymentID]
	paymentRecord.PendingMessages = append(paymentRecord.PendingMessages, cloneMessages(messages)...)
	paymentRecord.UpdatedAt = time.Now().UTC()
	return nil
}

func (r *MemoryRepository) MarkFailed(ctx context.Context, paymentID string, reason string, messages []PendingMessage) (*Payment, bool, error) {
	return r.transition(paymentID, messages, func(paymentRecord *Payment) bool {
		return paymentRecord.PaymentStatus == PaymentStatusProcessing
	}, func(paymentRecord *Payment) {
		paymentRecord.PaymentStatus = PaymentStatusFailed
		paymentRecord.PaymentFailureReason = reason
	})
}

func (r *MemoryRepository) MarkExpired(ctx context.Context, paymentID string, messages []PendingMessage) (*Payment, bool, error) {
	return r.transition(paymentID, messages, func(paymentRecord *Payment) bool {
		return paymentRecord.PaymentStatus == PaymentStatusPending ||
			paymentRecord.PaymentStatus == PaymentStatusProcessing ||
			paymentRecord.PaymentStatus == PaymentStatusFailed
	}, func(paymentRecord *Payment) {
		paymentRecord.PaymentStatus = PaymentStatusExpired
		paymentRecord.ProcessingStartedAt = nil
	})
}

func (r *MemoryRepository) MarkCompleted(
	ctx context.Context,
	paymentID string,
	eventID string,
	confirmedAt time.Time,
	messages []PendingMessage,
) (*Payment, bool, error) {
	return r.transition(paymentID, messages, func(paymentRecord *Payment) bool {
		return paymentRecord.PaymentStatus == PaymentStatusPending ||
			paymentRecord.PaymentStatus == PaymentStatusProcessing ||
			paymentRecord.PaymentStatus == PaymentStatusFailed
	}, func(paymentRecord *Payment) {
		paymentRecord.PaymentStatus = PaymentStatusCompleted
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
	status DeliveryStatus,
	reason string,
	messages []PendingMessage,
) (*Payment, bool, error) {
	return r.transition(paymentID, messages, func(paymentRecord *Payment) bool {
		return paymentRecord.PaymentStatus == PaymentStatusCompleted &&
			paymentRecord.DeliveryStatus == DeliveryStatusPending
	}, func(paymentRecord *Payment) {
		paymentRecord.DeliveryStatus = status
		paymentRecord.DeliveryFailureReason = reason
	})
}

func (r *MemoryRepository) ClaimPendingPublishes(ctx context.Context, before time.Time, claimUntil time.Time, limit int) ([]PendingPublish, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	result := make([]PendingPublish, 0, limit)
	for _, paymentRecord := range r.payments {
		for index := range paymentRecord.PendingMessages {
			pending := &paymentRecord.PendingMessages[index]
			if !pending.NextAttemptAt.After(before) && !isClaimed(pending, before) {
				claimToken := uuid.NewString()
				claimedUntil := claimUntil
				pending.ClaimToken = claimToken
				pending.ClaimedUntil = &claimedUntil
				paymentRecord.UpdatedAt = time.Now().UTC()
				result = append(result, PendingPublish{
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
	filtered := make([]PendingMessage, 0, len(paymentRecord.PendingMessages))
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
	messages []PendingMessage,
	allowed func(*Payment) bool,
	updater func(*Payment),
) (*Payment, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	paymentRecord, ok := r.payments[paymentID]
	if !ok {
		return nil, false, nil
	}
	if !allowed(paymentRecord) {
		return clonePayment(paymentRecord), false, nil
	}
	updater(paymentRecord)
	paymentRecord.PendingMessages = append(paymentRecord.PendingMessages, cloneMessages(messages)...)
	paymentRecord.UpdatedAt = time.Now().UTC()
	return clonePayment(paymentRecord), true, nil
}

func clonePayment(paymentRecord *Payment) *Payment {
	copyValue := *paymentRecord
	copyValue.WebhookEventIDs = append([]string{}, paymentRecord.WebhookEventIDs...)
	copyValue.PendingMessages = cloneMessages(paymentRecord.PendingMessages)
	copyValue.ProcessingStartedAt = cloneTime(paymentRecord.ProcessingStartedAt)
	copyValue.ConfirmedAt = cloneTime(paymentRecord.ConfirmedAt)
	return &copyValue
}

func cloneMessages(messages []PendingMessage) []PendingMessage {
	if len(messages) == 0 {
		return nil
	}
	cloned := make([]PendingMessage, 0, len(messages))
	for _, message := range messages {
		cloned = append(cloned, clonePendingMessage(message))
	}
	return cloned
}

func clonePendingMessage(message PendingMessage) PendingMessage {
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

func isClaimed(message *PendingMessage, now time.Time) bool {
	if message.ClaimToken == "" || message.ClaimedUntil == nil {
		return false
	}
	return message.ClaimedUntil.After(now)
}
