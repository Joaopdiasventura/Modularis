package gateway

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/modularis/payment-service/internal/config"
	"github.com/modularis/payment-service/internal/core/payment"
)

type MockGateway struct {
	config config.Config
}

func NewMockGateway(cfg config.Config) *MockGateway {
	return &MockGateway{config: cfg}
}

func (g *MockGateway) CreateIntent(paymentRecord *payment.Payment) (payment.PaymentIntent, error) {
	return payment.PaymentIntent{
		Reference:      paymentRecord.PaymentReference,
		QRCode:         fmt.Sprintf("000201010212modularis-%s-%.2f", paymentRecord.PaymentReference, paymentRecord.Amount),
		QRCodeImageURL: fmt.Sprintf("https://payments.mock.local/qrcode/%s", base64.RawURLEncoding.EncodeToString([]byte(paymentRecord.PaymentReference))),
	}, nil
}

func (g *MockGateway) Process(paymentRecord *payment.Payment, attempt int) (payment.GatewayResult, error) {
	if g.config.SimulationDelay > 0 {
		time.Sleep(g.config.SimulationDelay)
	}

	if attempt <= g.config.SimulationFailuresBeforeSuccess {
		return payment.GatewayResult{}, payment.GatewayError{
			Message:   "simulated transient payment failure",
			Retryable: true,
		}
	}

	score := deterministicScore(g.config.SimulationSeed, paymentRecord.PaymentReference)
	if score > g.config.SimulationSuccessRate {
		return payment.GatewayResult{}, payment.GatewayError{
			Message:   "simulated permanent payment failure",
			Retryable: false,
		}
	}

	return payment.GatewayResult{
		Reference:   paymentRecord.PaymentReference,
		CompletedAt: time.Now().UTC(),
	}, nil
}

func deterministicScore(seed string, reference string) float64 {
	hash := sha256.Sum256([]byte(seed + ":" + reference))
	value := uint32(hash[0])<<24 | uint32(hash[1])<<16 | uint32(hash[2])<<8 | uint32(hash[3])
	return float64(value) / float64(^uint32(0))
}
