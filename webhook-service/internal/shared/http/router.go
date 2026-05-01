package httptransport

import (
	"encoding/json"
	"net/http"
)

type ReadinessProbe interface {
	Ready() bool
}

type HandlerDependencies struct {
	Probes                []ReadinessProbe
	PaymentWebhookHandler http.Handler
}

func NewHandler(deps HandlerDependencies) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health/live", func(writer http.ResponseWriter, request *http.Request) {
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/health/ready", func(writer http.ResponseWriter, request *http.Request) {
		for _, probe := range deps.Probes {
			if probe == nil || !probe.Ready() {
				writeJSON(writer, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
				return
			}
		}
		writeJSON(writer, http.StatusOK, map[string]string{"status": "ok"})
	})
	if deps.PaymentWebhookHandler != nil {
		mux.Handle("/webhooks/payments", deps.PaymentWebhookHandler)
	}
	return mux
}

func writeJSON(writer http.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}
