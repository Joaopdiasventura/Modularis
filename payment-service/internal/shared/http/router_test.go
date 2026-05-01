package httptransport

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/modularis/payment-service/internal/testsupport"
)

func TestLiveHealth(t *testing.T) {
	handler := NewHandler(HealthDependencies{
		RabbitReady: func() bool { return true },
		Repo:        testsupport.NewMemoryRepository(),
	})

	request := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}
