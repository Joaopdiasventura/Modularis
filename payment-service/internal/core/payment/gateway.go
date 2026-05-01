package payment

import "time"

type PaymentIntent struct {
	Reference      string
	QRCode         string
	QRCodeImageURL string
}

type GatewayResult struct {
	Reference   string
	CompletedAt time.Time
}

type GatewayError struct {
	Message   string
	Retryable bool
}

func (g GatewayError) Error() string {
	return g.Message
}

type PaymentGateway interface {
	CreateIntent(payment *Payment) (PaymentIntent, error)
	Process(payment *Payment, attempt int) (GatewayResult, error)
}
