package payment

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/modularis/payment-service/internal/config"
	"github.com/modularis/payment-service/internal/shared/messaging"
)

type Service struct {
	logger  *slog.Logger
	config  config.Config
	repo    PaymentRepository
	gateway PaymentGateway
	bus     Publisher
}

type Publisher interface {
	Publish(ctx context.Context, exchange string, routingKey string, body string) error
}

const pendingPublishLease = 30 * time.Second

func NewService(
	logger *slog.Logger,
	cfg config.Config,
	repo PaymentRepository,
	gateway PaymentGateway,
	bus Publisher,
) *Service {
	return &Service{
		logger:  logger,
		config:  cfg,
		repo:    repo,
		gateway: gateway,
		bus:     bus,
	}
}

func (s *Service) CreatePayment(ctx context.Context, envelope messaging.Envelope[messaging.PaymentCreateCommandPayload]) string {
	payload := envelope.Payload
	existing, err := s.repo.FindByIdempotencyKey(ctx, payload.IdempotencyKey)
	if err != nil {
		s.logger.Error("failed to query payment store", "error", err)
		return s.rpcErrorResponse(
			envelope,
			500,
			"Internal Server Error",
			"The payment service could not load the current payment state.",
			"",
		)
	}
	if existing != nil {
		if existing.RequestHash != payload.RequestHash {
			return s.rpcErrorResponse(
				envelope,
				409,
				"Conflict",
				"Idempotency-Key was already used with a different payload",
				"IDEMPOTENCY_KEY_REUSED",
			)
		}
		return s.rpcSuccessResponse(envelope, toIntentPayload(existing, true))
	}

	currency := strings.ToUpper(payload.Currency)
	if !contains(s.config.AllowedCurrencies, currency) {
		return s.rpcErrorResponse(
			envelope,
			400,
			"Bad Request",
			"Unsupported currency.",
			"UNSUPPORTED_CURRENCY",
		)
	}

	payment := &Payment{
		ID:                uuid.NewString(),
		IdempotencyKey:    payload.IdempotencyKey,
		RequestHash:       payload.RequestHash,
		UserID:            payload.UserID,
		CustomerName:      payload.CustomerName,
		CustomerEmail:     payload.CustomerEmail,
		CustomerCellphone: payload.CustomerCellphone,
		CustomerTaxID:     payload.CustomerTaxID,
		PaymentReference:  uuid.NewString(),
		Amount:            payload.Amount,
		Currency:          currency,
		PaymentStatus:     PaymentStatusPending,
		DeliveryStatus:    DeliveryStatusPending,
		ExpiresAt:         time.Now().UTC().Add(s.config.PaymentExpiration),
		WebhookEventIDs:   []string{},
		PendingMessages:   []PendingMessage{},
	}

	intent, err := s.gateway.CreateIntent(payment)
	if err != nil {
		s.logger.Error("failed to create payment intent", "error", err)
		return s.rpcErrorResponse(
			envelope,
			502,
			"Bad Gateway",
			"The payment provider could not create the payment intent.",
			"",
		)
	}
	payment.PaymentReference = intent.Reference
	processMessageID := transitionMessageID("ppd", payment.ID)
	payment.PendingMessages = []PendingMessage{
		s.pendingMessage(
			"payment.process.requested",
			messaging.NewEnvelopeWithMetadata(
				"payment.process.requested",
				processMessageID,
				envelope.CorrelationID,
				envelope.MessageID,
				time.Now().UTC().Format(time.RFC3339Nano),
				"payment-service",
				messaging.PaymentProcessRequestedPayload{
					PaymentID:        payment.ID,
					PaymentReference: payment.PaymentReference,
				},
			),
		),
	}

	created, err := s.repo.Create(ctx, payment)
	if err != nil {
		s.logger.Error("failed to persist payment", "error", err)
		return s.rpcErrorResponse(
			envelope,
			500,
			"Internal Server Error",
			"The payment service could not save the payment.",
			"",
		)
	}
	return s.rpcSuccessResponse(envelope, withIntent(toIntentPayload(created, false), intent))
}

func (s *Service) HandleProcessRequested(ctx context.Context, envelope messaging.Envelope[messaging.PaymentProcessRequestedPayload]) error {
	now := time.Now().UTC()
	payment, err := s.repo.ReserveForProcessing(ctx, envelope.Payload.PaymentID, now)
	if err != nil {
		return err
	}
	if payment == nil {
		existing, findErr := s.repo.FindByID(ctx, envelope.Payload.PaymentID)
		if findErr != nil || existing == nil {
			return findErr
		}
		if existing.PaymentStatus == PaymentStatusPending && existing.ExpiresAt.Before(now) {
			_, _, err = s.repo.MarkExpired(
				ctx,
				existing.ID,
				s.statusMessages(
					existing,
					PaymentStatusExpired,
					existing.DeliveryStatus,
					envelope.CorrelationID,
					envelope.MessageID,
				),
			)
			return err
		}
		return nil
	}

	if err := s.repo.EnqueueMessages(
		ctx,
		payment.ID,
		s.statusMessages(
			payment,
			PaymentStatusProcessing,
			payment.DeliveryStatus,
			envelope.CorrelationID,
			envelope.MessageID,
		),
	); err != nil {
		return err
	}

	var result GatewayResult
	err = retry(
		s.config.ProcessingAttempts,
		s.config.ProcessingDelay,
		s.config.ProcessingBackoff,
		func(attempt int) error {
			processed, processErr := s.gateway.Process(payment, attempt)
			if processErr != nil {
				return processErr
			}
			result = processed
			return nil
		},
	)
	if err != nil {
		_, _, markErr := s.repo.MarkFailed(
			ctx,
			payment.ID,
			err.Error(),
			s.statusMessages(
				payment,
				PaymentStatusFailed,
				payment.DeliveryStatus,
				envelope.CorrelationID,
				envelope.MessageID,
			),
		)
		return markErr
	}

	if !s.config.SimulateWebhookConfirmation {
		return nil
	}

	callbackEventID := transitionMessageID("pcb", payment.PaymentReference)
	callbackOccurredAt := result.CompletedAt.UTC().Format(time.RFC3339Nano)
	return s.repo.EnqueueMessages(ctx, payment.ID, []PendingMessage{
		s.pendingMessage(
			"payment.callback.confirmed",
			messaging.NewEnvelopeWithMetadata(
				"payment.callback.confirmed",
				callbackEventID,
				envelope.CorrelationID,
				envelope.MessageID,
				callbackOccurredAt,
				"payment-service",
				messaging.PaymentCallbackConfirmedPayload{
					EventID:          callbackEventID,
					PaymentReference: result.Reference,
					Amount:           payment.Amount,
					Currency:         payment.Currency,
					OccurredAt:       callbackOccurredAt,
				},
			),
		),
	})
}

func (s *Service) HandleCallbackConfirmed(ctx context.Context, envelope messaging.Envelope[messaging.PaymentCallbackConfirmedPayload]) error {
	payment, err := s.repo.FindByReference(ctx, envelope.Payload.PaymentReference)
	if err != nil || payment == nil {
		return err
	}

	eventTime, parseErr := time.Parse(time.RFC3339Nano, envelope.Payload.OccurredAt)
	if parseErr != nil {
		return nil
	}
	if absDuration(time.Since(eventTime)) > s.config.WebhookTolerance {
		s.logger.Warn("ignoring stale callback", "paymentReference", envelope.Payload.PaymentReference)
		return nil
	}
	if payment.Amount != envelope.Payload.Amount || payment.Currency != envelope.Payload.Currency {
		s.logger.Warn("ignoring inconsistent callback", "paymentReference", envelope.Payload.PaymentReference)
		return nil
	}
	if payment.ExpiresAt.Before(eventTime) {
		_, _, err = s.repo.MarkExpired(
			ctx,
			payment.ID,
			s.statusMessages(
				payment,
				PaymentStatusExpired,
				payment.DeliveryStatus,
				envelope.CorrelationID,
				envelope.MessageID,
			),
		)
		return err
	}

	completedPayment := *payment
	completedPayment.PaymentStatus = PaymentStatusCompleted
	completedPayment.ConfirmedAt = &eventTime

	deliveryMessageID := transitionMessageID("pdr", payment.ID)
	_, transitioned, err := s.repo.MarkCompleted(ctx, payment.ID, envelope.Payload.EventID, eventTime, append(
		s.statusMessages(
			&completedPayment,
			PaymentStatusCompleted,
			completedPayment.DeliveryStatus,
			envelope.CorrelationID,
			envelope.MessageID,
		),
		s.pendingMessage(
			"payment.delivery.requested",
			messaging.NewEnvelopeWithMetadata(
				"payment.delivery.requested",
				deliveryMessageID,
				envelope.CorrelationID,
				envelope.MessageID,
				eventTime.UTC().Format(time.RFC3339Nano),
				"payment-service",
				messaging.PaymentDeliveryRequestedPayload{
					PaymentID: payment.ID,
					UserID:    payment.UserID,
				},
			),
		),
	))
	if err != nil || !transitioned {
		return err
	}
	return err
}

func (s *Service) HandleDeliveryRequested(ctx context.Context, envelope messaging.Envelope[messaging.PaymentDeliveryRequestedPayload]) error {
	payment, err := s.repo.FindByID(ctx, envelope.Payload.PaymentID)
	if err != nil || payment == nil {
		return err
	}
	if payment.PaymentStatus != PaymentStatusCompleted || payment.DeliveryStatus == DeliveryStatusDelivered {
		return nil
	}

	confirmedMessageID := transitionMessageID("pcf", payment.ID)
	occurredAt := safeTime(payment.ConfirmedAt)
	if occurredAt == "" {
		occurredAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	_, _, err = s.repo.MarkDelivery(
		ctx,
		payment.ID,
		DeliveryStatusDelivered,
		"",
		append(
			s.statusMessages(
				payment,
				PaymentStatusCompleted,
				DeliveryStatusDelivered,
				envelope.CorrelationID,
				envelope.MessageID,
			),
			s.pendingMessage(
				"payment.confirmed",
				s.confirmedEnvelope("payment.confirmed", confirmedMessageID, occurredAt, payment, envelope.CorrelationID, envelope.MessageID),
			),
		),
	)
	return err
}

func (s *Service) PublishPending(ctx context.Context) error {
	now := time.Now().UTC()
	pendingMessages, err := s.repo.ClaimPendingPublishes(ctx, now, now.Add(pendingPublishLease), 100)
	if err != nil {
		return err
	}

	for _, publish := range pendingMessages {
		if err := s.bus.Publish(ctx, publish.Message.Exchange, publish.Message.RoutingKey, publish.Message.Body); err != nil {
			_ = s.repo.RetryPendingPublish(
				ctx,
				publish.PaymentID,
				publish.Message.ID,
				publish.Message.ClaimToken,
				time.Now().UTC().Add(backoffDelay(publish.Message.Attempts+1, s.config.ProcessingDelay, s.config.ProcessingBackoff)),
				publish.Message.Attempts+1,
			)
			continue
		}
		_ = s.repo.AcknowledgePendingPublish(ctx, publish.PaymentID, publish.Message.ID, publish.Message.ClaimToken)
	}

	return nil
}

func (s *Service) pendingMessage(routingKey string, envelope any) PendingMessage {
	return PendingMessage{
		ID:            uuid.NewString(),
		Exchange:      s.config.EventExchange,
		RoutingKey:    routingKey,
		Body:          messaging.Marshal(envelope),
		Attempts:      0,
		NextAttemptAt: time.Now().UTC(),
	}
}

func (s *Service) statusEnvelope(
	eventType string,
	messageID string,
	occurredAt string,
	payment *Payment,
	status PaymentStatus,
	delivery DeliveryStatus,
	correlationID string,
	causationID string,
) messaging.Envelope[messaging.PaymentStatusUpdatedPayload] {
	return messaging.NewEnvelopeWithMetadata(
		eventType,
		messageID,
		correlationID,
		causationID,
		occurredAt,
		"payment-service",
		messaging.PaymentStatusUpdatedPayload{
			PaymentID:        payment.ID,
			PaymentReference: payment.PaymentReference,
			UserID:           payment.UserID,
			PaymentStatus:    string(status),
			DeliveryStatus:   string(delivery),
			ConfirmedAt:      safeTime(payment.ConfirmedAt),
			ExpiresAt:        payment.ExpiresAt.Format(time.RFC3339Nano),
		},
	)
}

func toIntentPayload(payment *Payment, replayed bool) messaging.PaymentIntentPayload {
	return messaging.PaymentIntentPayload{
		ID:               payment.ID,
		PaymentReference: payment.PaymentReference,
		Amount:           payment.Amount,
		Currency:         payment.Currency,
		PaymentStatus:    string(payment.PaymentStatus),
		DeliveryStatus:   string(payment.DeliveryStatus),
		ExpiresAt:        payment.ExpiresAt.Format(time.RFC3339Nano),
		Replayed:         replayed,
	}
}

func (s *Service) statusMessages(
	payment *Payment,
	status PaymentStatus,
	delivery DeliveryStatus,
	correlationID string,
	causationID string,
) []PendingMessage {
	messageID := statusMessageID(payment.ID, status, delivery)
	occurredAt := time.Now().UTC().Format(time.RFC3339Nano)
	return []PendingMessage{
		s.pendingMessage(
			"payment.status-updated",
			s.statusEnvelope(
				"payment.status-updated",
				messageID,
				occurredAt,
				payment,
				status,
				delivery,
				correlationID,
				causationID,
			),
		),
	}
}

func (s *Service) confirmedEnvelope(
	eventType string,
	messageID string,
	occurredAt string,
	payment *Payment,
	correlationID string,
	causationID string,
) messaging.Envelope[messaging.PaymentConfirmedPayload] {
	return messaging.NewEnvelopeWithMetadata(
		eventType,
		messageID,
		correlationID,
		causationID,
		occurredAt,
		"payment-service",
		messaging.PaymentConfirmedPayload{
			PaymentID:        payment.ID,
			PaymentReference: payment.PaymentReference,
			UserID:           payment.UserID,
			PaymentStatus:    string(PaymentStatusCompleted),
			DeliveryStatus:   string(DeliveryStatusDelivered),
			ConfirmedAt:      safeTime(payment.ConfirmedAt),
			ExpiresAt:        payment.ExpiresAt.Format(time.RFC3339Nano),
		},
	)
}

func withIntent(payload messaging.PaymentIntentPayload, intent PaymentIntent) messaging.PaymentIntentPayload {
	payload.PaymentReference = intent.Reference
	payload.QRCode = intent.QRCode
	payload.QRCodeImageURL = intent.QRCodeImageURL
	return payload
}

func safeTime(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.UTC().Format(time.RFC3339Nano)
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func retry(attempts int, delay time.Duration, backoff int, operation func(int) error) error {
	for attempt := 1; attempt <= attempts; attempt++ {
		err := operation(attempt)
		if err == nil {
			return nil
		}
		var gatewayErr GatewayError
		if !errors.As(err, &gatewayErr) || !gatewayErr.Retryable || attempt == attempts {
			return err
		}
		time.Sleep(backoffDelay(attempt, delay, backoff))
	}
	return nil
}

func backoffDelay(attempt int, base time.Duration, backoff int) time.Duration {
	if attempt <= 1 || backoff <= 1 {
		return base
	}
	multiplier := 1
	for i := 1; i < attempt; i++ {
		multiplier *= backoff
	}
	return time.Duration(multiplier) * base
}

func absDuration(value time.Duration) time.Duration {
	if value < 0 {
		return -value
	}
	return value
}

func (s *Service) rpcSuccessResponse(
	command messaging.Envelope[messaging.PaymentCreateCommandPayload],
	payload messaging.PaymentIntentPayload,
) string {
	return messaging.Marshal(
		messaging.NewEnvelope(
			responseTypeForCommand(command.Type),
			command.CorrelationID,
			command.MessageID,
			messaging.RPCSuccess[messaging.PaymentIntentPayload]{
				Success: true,
				Data:    payload,
			},
		),
	)
}

func (s *Service) rpcErrorResponse(
	command messaging.Envelope[messaging.PaymentCreateCommandPayload],
	status int,
	title string,
	detail string,
	code string,
) string {
	return messaging.Marshal(
		messaging.NewEnvelope(
			responseTypeForCommand(command.Type),
			command.CorrelationID,
			command.MessageID,
			messaging.RPCError{
				Success: false,
				Error: messaging.RPCErrorDetail{
					Status: status,
					Title:  title,
					Detail: detail,
					Code:   code,
				},
			},
		),
	)
}

func responseTypeForCommand(commandType string) string {
	if commandType == "payment.intent.create" {
		return "payment.intent.create.response"
	}
	return "payment.intent.create.response"
}

func transitionMessageID(prefix string, paymentID string) string {
	return prefix + ":" + paymentID
}

func statusMessageID(paymentID string, status PaymentStatus, delivery DeliveryStatus) string {
	return "psu:" + paymentID + ":" + paymentStatusCode(status) + ":" + deliveryStatusCode(delivery)
}

func paymentStatusCode(status PaymentStatus) string {
	switch status {
	case PaymentStatusPending:
		return "p"
	case PaymentStatusProcessing:
		return "pr"
	case PaymentStatusCompleted:
		return "c"
	case PaymentStatusFailed:
		return "f"
	case PaymentStatusExpired:
		return "e"
	default:
		return "u"
	}
}

func deliveryStatusCode(status DeliveryStatus) string {
	switch status {
	case DeliveryStatusPending:
		return "p"
	case DeliveryStatusDelivered:
		return "d"
	case DeliveryStatusFailed:
		return "f"
	default:
		return "u"
	}
}
