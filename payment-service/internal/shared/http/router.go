package httptransport

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/modularis/payment-service/internal/core/payment"
)

type HealthDependencies struct {
	RabbitReady func() bool
	Repo        payment.PaymentRepository
}

func NewHandler(deps HealthDependencies) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health/live", func(writer http.ResponseWriter, request *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/health/ready", func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), 2*time.Second)
		defer cancel()
		if !deps.RabbitReady() || deps.Repo.Ping(ctx) != nil {
			writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
			return
		}
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
	})
	return mux
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}
