package rabbit

import (
	"context"

	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/modularis/payment-service/internal/core/payment"
	"github.com/modularis/payment-service/internal/shared/messaging"
)

func StartPaymentConsumers(ctx context.Context, bus *Bus, service *payment.Service) error {
	return bus.StartConsumers(
		ctx,
		func(ctx context.Context, delivery amqp.Delivery) (string, error) {
			var command messaging.Envelope[messaging.PaymentCreateCommandPayload]
			if err := Decode(delivery, &command); err != nil {
				return invalidCommandResponse(delivery), nil
			}
			return service.CreatePayment(ctx, command), nil
		},
		func(ctx context.Context, delivery amqp.Delivery) error {
			switch delivery.RoutingKey {
			case "payment.process.requested":
				var envelope messaging.Envelope[messaging.PaymentProcessRequestedPayload]
				if err := Decode(delivery, &envelope); err != nil {
					return err
				}
				return service.HandleProcessRequested(ctx, envelope)
			case "payment.callback.confirmed":
				var envelope messaging.Envelope[messaging.PaymentCallbackConfirmedPayload]
				if err := Decode(delivery, &envelope); err != nil {
					return err
				}
				return service.HandleCallbackConfirmed(ctx, envelope)
			case "payment.delivery.requested":
				var envelope messaging.Envelope[messaging.PaymentDeliveryRequestedPayload]
				if err := Decode(delivery, &envelope); err != nil {
					return err
				}
				return service.HandleDeliveryRequested(ctx, envelope)
			default:
				return nil
			}
		},
	)
}

func invalidCommandResponse(delivery amqp.Delivery) string {
	return messaging.Marshal(
		messaging.NewEnvelope(
			"payment.intent.create.response",
			headerString(delivery.Headers, "x-correlation-id"),
			headerString(delivery.Headers, "x-causation-id"),
			messaging.RPCError{
				Success: false,
				Error: messaging.RPCErrorDetail{
					Status: 400,
					Title:  "Bad Request",
					Detail: "The payment command payload is invalid.",
				},
			},
		),
	)
}

func headerString(headers amqp.Table, key string) string {
	value, _ := headers[key].(string)
	return value
}
