package httptransport

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

type stubProbe bool

func (s stubProbe) Ready() bool {
	return bool(s)
}

func TestLiveHealth(t *testing.T) {
	handler := NewHandler(HandlerDependencies{})

	request := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}

func TestReadyHealthRequiresAllProbes(t *testing.T) {
	handler := NewHandler(HandlerDependencies{
		Probes: []ReadinessProbe{stubProbe(true), stubProbe(false)},
	})

	request := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", recorder.Code)
	}
}
