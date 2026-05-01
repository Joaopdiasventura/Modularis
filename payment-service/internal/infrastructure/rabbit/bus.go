package rabbit

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"

	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/modularis/payment-service/internal/config"
	"github.com/modularis/payment-service/internal/shared/messaging"
)

type Bus struct {
	logger     *slog.Logger
	config     config.Config
	connection *amqp.Connection
	publishCh  *amqp.Channel
	commandCh  *amqp.Channel
	eventCh    *amqp.Channel
	mu         sync.Mutex
	ready      bool
}

func NewBus(logger *slog.Logger, cfg config.Config) (*Bus, error) {
	conn, err := amqp.Dial(cfg.RabbitURL)
	if err != nil {
		return nil, err
	}

	publishCh, err := conn.Channel()
	if err != nil {
		return nil, err
	}
	commandCh, err := conn.Channel()
	if err != nil {
		return nil, err
	}
	eventCh, err := conn.Channel()
	if err != nil {
		return nil, err
	}

	bus := &Bus{
		logger:     logger,
		config:     cfg,
		connection: conn,
		publishCh:  publishCh,
		commandCh:  commandCh,
		eventCh:    eventCh,
		ready:      true,
	}
	if err := bus.setup(); err != nil {
		return nil, err
	}

	return bus, nil
}

func (b *Bus) setup() error {
	for _, ch := range []*amqp.Channel{b.publishCh, b.commandCh, b.eventCh} {
		if err := ch.ExchangeDeclare(b.config.CommandExchange, "topic", true, false, false, false, nil); err != nil {
			return err
		}
		if err := ch.ExchangeDeclare(b.config.EventExchange, "topic", true, false, false, false, nil); err != nil {
			return err
		}
		if err := ch.ExchangeDeclare(b.config.ResponseExchange, "topic", true, false, false, false, nil); err != nil {
			return err
		}
	}

	queueArgs := amqp.Table{
		"x-queue-type":           "quorum",
		"x-delivery-limit":       b.config.DeliveryLimit,
		"x-dead-letter-exchange": "",
	}

	commandArgs := cloneTable(queueArgs)
	commandArgs["x-dead-letter-routing-key"] = b.config.CommandQueue + ".dlq"
	eventArgs := cloneTable(queueArgs)
	eventArgs["x-dead-letter-routing-key"] = b.config.EventQueue + ".dlq"

	if _, err := b.commandCh.QueueDeclare(b.config.CommandQueue, true, false, false, false, commandArgs); err != nil {
		return err
	}
	if _, err := b.commandCh.QueueDeclare(b.config.CommandQueue+".dlq", true, false, false, false, amqp.Table{"x-queue-type": "quorum"}); err != nil {
		return err
	}
	if _, err := b.eventCh.QueueDeclare(b.config.EventQueue, true, false, false, false, eventArgs); err != nil {
		return err
	}
	if _, err := b.eventCh.QueueDeclare(b.config.EventQueue+".dlq", true, false, false, false, amqp.Table{"x-queue-type": "quorum"}); err != nil {
		return err
	}

	if err := b.commandCh.QueueBind(b.config.CommandQueue, "payment.intent.create", b.config.CommandExchange, false, nil); err != nil {
		return err
	}
	if err := b.eventCh.QueueBind(b.config.EventQueue, "payment.process.requested", b.config.EventExchange, false, nil); err != nil {
		return err
	}
	if err := b.eventCh.QueueBind(b.config.EventQueue, "payment.callback.confirmed", b.config.EventExchange, false, nil); err != nil {
		return err
	}
	if err := b.eventCh.QueueBind(b.config.EventQueue, "payment.delivery.requested", b.config.EventExchange, false, nil); err != nil {
		return err
	}

	if err := b.commandCh.Qos(10, 0, false); err != nil {
		return err
	}
	if err := b.eventCh.Qos(10, 0, false); err != nil {
		return err
	}
	return nil
}

func (b *Bus) Close() error {
	b.ready = false
	var errs []error
	for _, closer := range []func() error{b.publishCh.Close, b.commandCh.Close, b.eventCh.Close, b.connection.Close} {
		if err := closer(); err != nil && !errors.Is(err, amqp.ErrClosed) {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (b *Bus) Ready() bool {
	return b.ready
}

func (b *Bus) Publish(ctx context.Context, exchange string, routingKey string, body string) error {
	b.logger.Debug("publishing message", "exchange", exchange, "routingKey", routingKey)
	return b.publish(ctx, exchange, routingKey, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         []byte(body),
	})
}

func (b *Bus) PublishReply(
	ctx context.Context,
	exchange string,
	routingKey string,
	correlationID string,
	body string,
) error {
	b.logger.Debug("publishing async response", "exchange", exchange, "routingKey", routingKey, "rpcId", correlationID)
	return b.publish(ctx, exchange, routingKey, amqp.Publishing{
		ContentType:   "application/json",
		DeliveryMode:  amqp.Persistent,
		CorrelationId: correlationID,
		Body:          []byte(body),
	})
}

func (b *Bus) publish(
	ctx context.Context,
	exchange string,
	routingKey string,
	message amqp.Publishing,
) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.publishCh.PublishWithContext(ctx, exchange, routingKey, false, false, message)
}

func (b *Bus) StartConsumers(
	ctx context.Context,
	commandHandler func(context.Context, amqp.Delivery) (string, error),
	eventHandler func(context.Context, amqp.Delivery) error,
) error {
	commandDeliveries, err := b.commandCh.Consume(b.config.CommandQueue, "", false, false, false, false, nil)
	if err != nil {
		return err
	}
	eventDeliveries, err := b.eventCh.Consume(b.config.EventQueue, "", false, false, false, false, nil)
	if err != nil {
		return err
	}

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case delivery, ok := <-commandDeliveries:
				if !ok {
					return
				}
				b.logger.Debug("consuming command", "routingKey", delivery.RoutingKey, "rpcId", delivery.CorrelationId, "correlationId", delivery.Headers["x-correlation-id"])
				responseBody, handleErr := commandHandler(ctx, delivery)
				if handleErr != nil {
					b.logger.Error("payment command failed", "error", handleErr)
					responseBody = messaging.Marshal(messaging.RPCError{
						Success: false,
						Error: messaging.RPCErrorDetail{
							Status: 500,
							Title:  "Internal Server Error",
							Detail: handleErr.Error(),
						},
					})
				}
				if routingKey, exchange, ok := responseTarget(delivery, b.config.ResponseExchange); ok {
					_ = b.PublishReply(ctx, exchange, routingKey, delivery.CorrelationId, responseBody)
				}
				_ = delivery.Ack(false)
			}
		}
	}()

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case delivery, ok := <-eventDeliveries:
				if !ok {
					return
				}
				b.logger.Debug("consuming event", "routingKey", delivery.RoutingKey, "correlationId", delivery.Headers["x-correlation-id"])
				if err := eventHandler(ctx, delivery); err != nil {
					b.logger.Error("payment event failed", "routingKey", delivery.RoutingKey, "error", err)
					_ = delivery.Nack(false, true)
					continue
				}
				_ = delivery.Ack(false)
			}
		}
	}()

	return nil
}

func cloneTable(source amqp.Table) amqp.Table {
	target := amqp.Table{}
	for key, value := range source {
		target[key] = value
	}
	return target
}

func Decode[T any](delivery amqp.Delivery, target *T) error {
	return json.Unmarshal(delivery.Body, target)
}

func responseTarget(delivery amqp.Delivery, fallbackExchange string) (string, string, bool) {
	routingKey, _ := delivery.Headers["x-response-routing-key"].(string)
	if routingKey == "" {
		return "", "", false
	}
	exchange, _ := delivery.Headers["x-response-exchange"].(string)
	if exchange == "" {
		exchange = fallbackExchange
	}
	return routingKey, exchange, true
}
