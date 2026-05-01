package webhook

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/modularis/webhook-service/internal/config"
	"github.com/modularis/webhook-service/internal/shared/messaging"
)

type HandlerDependencies struct {
	Config config.Config
	Logger *slog.Logger
	Store  ReceiptStore
	Clock  func() time.Time
}

func NewHandler(deps HandlerDependencies) http.Handler {
	if deps.Clock == nil {
		deps.Clock = time.Now
	}
	if deps.Logger == nil {
		deps.Logger = slog.Default()
	}

	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		reqID := requestID(request)
		if request.Method != http.MethodPost {
			writeProblem(writer, reqID, http.StatusMethodNotAllowed, "Method Not Allowed", "Only POST is supported on this endpoint.")
			return
		}

		body, err := io.ReadAll(http.MaxBytesReader(writer, request.Body, deps.Config.MaxBodyBytes))
		if err != nil {
			writeProblem(writer, reqID, http.StatusBadRequest, "Bad Request", "The webhook body could not be read.")
			return
		}

		signatureValue := request.Header.Get(deps.Config.SignatureHeader)
		err = Validate(
			deps.Config.SignatureSecret,
			signatureValue,
			body,
			deps.Clock().UTC(),
			deps.Config.WebhookTolerance,
		)
		if err != nil {
			status := http.StatusUnauthorized
			title := "Unauthorized"
			if errors.Is(err, ErrExpiredSignature) {
				status = http.StatusBadRequest
				title = "Bad Request"
			}
			writeProblem(writer, reqID, status, title, err.Error())
			return
		}

		var payload messaging.PaymentWebhookPayload
		decoder := json.NewDecoder(strings.NewReader(string(body)))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&payload); err != nil {
			writeProblem(writer, reqID, http.StatusBadRequest, "Bad Request", "The webhook payload must be valid JSON.")
			return
		}
		if detail := validateWebhookPayload(payload); detail != "" {
			writeProblem(writer, reqID, http.StatusBadRequest, "Bad Request", detail)
			return
		}

		status := strings.ToUpper(payload.Status)
		if status != "CONFIRMED" {
			writeJSON(writer, http.StatusAccepted, map[string]string{
				"status": "ignored",
				"reason": "unsupported_status",
			})
			return
		}

		occurredAt := normalizeOccurredAt(payload.OccurredAt)
		logicalMessageID := callbackMessageID(payload.PaymentReference)
		correlationID := request.Header.Get("X-Correlation-Id")
		if correlationID == "" {
			correlationID = logicalMessageID
		}

		callbackPayload := messaging.PaymentCallbackConfirmedPayload{
			EventID:          payload.EventID,
			PaymentReference: payload.PaymentReference,
			Amount:           payload.Amount,
			Currency:         strings.ToUpper(payload.Currency),
			OccurredAt:       occurredAt,
		}
		envelope := messaging.NewEnvelopeWithMetadata(
			deps.Config.PublishRoutingKey,
			logicalMessageID,
			correlationID,
			payload.EventID,
			occurredAt,
			"webhook-service",
			callbackPayload,
		)
		dedupeKey := webhookDedupeKey(payload.PaymentReference, status)
		registration, err := deps.Store.Register(request.Context(), ReceiptRegistration{
			DedupeKey:        dedupeKey,
			PaymentReference: strings.TrimSpace(payload.PaymentReference),
			PaymentStatus:    status,
			ProviderEventID:  strings.TrimSpace(payload.EventID),
			CorrelationID:    correlationID,
			MessageID:        logicalMessageID,
			RoutingKey:       deps.Config.PublishRoutingKey,
			PayloadJSON:      messaging.Marshal(envelope),
		})
		if err != nil {
			deps.Logger.Error(
				"failed to register webhook receipt",
				"requestId", reqID,
				"paymentReference", payload.PaymentReference,
				"status", status,
				"eventId", payload.EventID,
				"correlationId", correlationID,
				"error", err,
			)
			writeProblem(writer, reqID, http.StatusBadGateway, "Bad Gateway", "The webhook could not be recorded.")
			return
		}

		if registration.Accepted {
			deps.Logger.Info(
				"accepted webhook receipt",
				"requestId", reqID,
				"paymentReference", payload.PaymentReference,
				"status", status,
				"eventId", payload.EventID,
				"correlationId", correlationID,
				"dedupeKey", dedupeKey,
			)
			writeJSON(writer, http.StatusAccepted, map[string]string{
				"status":    "accepted",
				"dedupeKey": dedupeKey,
				"eventId":   payload.EventID,
			})
			return
		}

		reason := "replayed"
		if registration.PublishStatus == PublishStatusPending || registration.PublishStatus == PublishStatusInFlight {
			reason = "processing"
		}
		deps.Logger.Info(
			"ignored duplicate webhook receipt",
			"requestId", reqID,
			"paymentReference", payload.PaymentReference,
			"status", status,
			"eventId", payload.EventID,
			"correlationId", correlationID,
			"dedupeKey", dedupeKey,
			"reason", reason,
		)
		writeJSON(writer, http.StatusOK, map[string]string{
			"status":    "duplicate",
			"reason":    reason,
			"dedupeKey": dedupeKey,
			"eventId":   payload.EventID,
		})
	})
}

func validateWebhookPayload(payload messaging.PaymentWebhookPayload) string {
	if strings.TrimSpace(payload.EventID) == "" {
		return "eventId is required"
	}
	if strings.TrimSpace(payload.PaymentReference) == "" {
		return "paymentReference is required"
	}
	if payload.Amount <= 0 {
		return "amount must be greater than zero"
	}
	if strings.TrimSpace(payload.Currency) == "" {
		return "currency is required"
	}
	if strings.TrimSpace(payload.Status) == "" {
		return "status is required"
	}
	if strings.TrimSpace(payload.OccurredAt) == "" {
		return "occurredAt is required"
	}
	if _, err := time.Parse(time.RFC3339Nano, payload.OccurredAt); err != nil {
		return "occurredAt must be RFC3339"
	}
	return ""
}

func requestID(request *http.Request) string {
	if request == nil {
		return uuid.NewString()
	}
	if value := strings.TrimSpace(request.Header.Get("X-Request-Id")); value != "" {
		return value
	}
	return uuid.NewString()
}

func normalizeOccurredAt(value string) string {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return value
	}
	return parsed.UTC().Format(time.RFC3339Nano)
}

func callbackMessageID(paymentReference string) string {
	return "pcb:" + strings.TrimSpace(paymentReference)
}

func webhookDedupeKey(paymentReference string, status string) string {
	return strings.ToUpper(strings.TrimSpace(status)) + ":" + strings.TrimSpace(paymentReference)
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}

func writeProblem(writer http.ResponseWriter, requestID string, status int, title string, detail string) {
	writer.Header().Set("Content-Type", "application/problem+json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]any{
		"type":      "about:blank",
		"title":     title,
		"status":    status,
		"detail":    detail,
		"requestId": requestID,
	})
}
