package rabbit

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/modularis/webhook-service/internal/config"
)

type Bus struct {
	logger        *slog.Logger
	config        config.Config
	connection    *amqp.Connection
	channel       *amqp.Channel
	confirmations <-chan amqp.Confirmation
	mu            sync.Mutex
	ready         bool
}

func NewBus(logger *slog.Logger, cfg config.Config) (*Bus, error) {
	conn, err := amqp.Dial(cfg.RabbitURL)
	if err != nil {
		return nil, err
	}
	channel, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	if err := channel.Confirm(false); err != nil {
		_ = channel.Close()
		_ = conn.Close()
		return nil, err
	}

	bus := &Bus{
		logger:        logger,
		config:        cfg,
		connection:    conn,
		channel:       channel,
		confirmations: channel.NotifyPublish(make(chan amqp.Confirmation, 1)),
		ready:         true,
	}
	if err := channel.ExchangeDeclare(cfg.EventExchange, "topic", true, false, false, false, nil); err != nil {
		_ = channel.Close()
		_ = conn.Close()
		return nil, err
	}

	go bus.watchConnection(conn, channel)
	return bus, nil
}

func (b *Bus) Publish(ctx context.Context, exchange string, routingKey string, body string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !b.ready {
		return errors.New("rabbitmq publisher is not ready")
	}

	var lastErr error
	for attempt := 1; attempt <= b.config.PublishAttempts; attempt++ {
		b.logger.Debug("publishing webhook event", "exchange", exchange, "routingKey", routingKey, "attempt", attempt)
		lastErr = b.channel.PublishWithContext(ctx, exchange, routingKey, false, false, amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Body:         []byte(body),
		})
		if lastErr == nil {
			lastErr = b.awaitConfirmation(ctx, routingKey)
		}
		if lastErr == nil {
			return nil
		}
		if attempt == b.config.PublishAttempts {
			break
		}
		b.logger.Warn("webhook publish failed, retrying", "attempt", attempt, "routingKey", routingKey, "error", lastErr)
		time.Sleep(backoffDelay(attempt, b.config.PublishDelay, b.config.PublishBackoff))
	}
	return lastErr
}

func (b *Bus) Ready() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.ready
}

func (b *Bus) Close() error {
	b.mu.Lock()
	b.ready = false
	b.mu.Unlock()

	var errs []error
	for _, closer := range []func() error{b.channel.Close, b.connection.Close} {
		if err := closer(); err != nil && !errors.Is(err, amqp.ErrClosed) {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (b *Bus) awaitConfirmation(ctx context.Context, routingKey string) error {
	select {
	case confirmation, ok := <-b.confirmations:
		if !ok {
			b.mu.Lock()
			b.ready = false
			b.mu.Unlock()
			return errors.New("rabbitmq publisher confirmation channel closed")
		}
		if !confirmation.Ack {
			return fmt.Errorf("rabbitmq negatively acknowledged publish for %s", routingKey)
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (b *Bus) watchConnection(conn *amqp.Connection, channel *amqp.Channel) {
	connectionClosed := conn.NotifyClose(make(chan *amqp.Error, 1))
	channelClosed := channel.NotifyClose(make(chan *amqp.Error, 1))

	select {
	case err := <-connectionClosed:
		if err != nil {
			b.logger.Error("rabbitmq connection closed", "error", err)
		}
	case err := <-channelClosed:
		if err != nil {
			b.logger.Error("rabbitmq channel closed", "error", err)
		}
	}

	b.mu.Lock()
	b.ready = false
	b.mu.Unlock()
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
