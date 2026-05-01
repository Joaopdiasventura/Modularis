package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	ServiceName            string
	Port                   string
	RabbitURL              string
	EventExchange          string
	PublishRoutingKey      string
	PublishAttempts        int
	PublishDelay           time.Duration
	PublishBackoff         int
	RelayBatchSize         int
	RelayLease             time.Duration
	RelayTick              time.Duration
	PostgresURL            string
	PostgresConnectTimeout time.Duration
	SignatureHeader        string
	SignatureSecret        string
	WebhookTolerance       time.Duration
	MaxBodyBytes           int64
}

func Load() (Config, error) {
	publishDelay, err := duration("MODULARIS_WEBHOOK_PUBLISH_DELAY", 200*time.Millisecond)
	if err != nil {
		return Config{}, err
	}
	webhookTolerance, err := duration("MODULARIS_WEBHOOK_TOLERANCE_MS", 5*time.Minute)
	if err != nil {
		return Config{}, err
	}
	relayLease, err := duration("MODULARIS_WEBHOOK_RELAY_LEASE", 30*time.Second)
	if err != nil {
		return Config{}, err
	}
	relayTick, err := duration("MODULARIS_WEBHOOK_RELAY_TICK", 500*time.Millisecond)
	if err != nil {
		return Config{}, err
	}
	postgresConnectTimeout, err := duration("MODULARIS_POSTGRES_CONNECTION_TIMEOUT", 5*time.Second)
	if err != nil {
		return Config{}, err
	}

	return Config{
		ServiceName:            get("MODULARIS_SERVICE_NAME", "webhook-service"),
		Port:                   get("PORT", "8081"),
		RabbitURL:              get("MODULARIS_RABBITMQ_URL", "amqp://user:user@localhost:5672/"),
		EventExchange:          get("MODULARIS_EVENT_EXCHANGE", "modularis.events"),
		PublishRoutingKey:      get("MODULARIS_WEBHOOK_ROUTING_KEY", "payment.callback.confirmed"),
		PublishAttempts:        getInt("MODULARIS_WEBHOOK_PUBLISH_ATTEMPTS", 3),
		PublishDelay:           publishDelay,
		PublishBackoff:         getInt("MODULARIS_WEBHOOK_PUBLISH_BACKOFF", 2),
		RelayBatchSize:         getInt("MODULARIS_WEBHOOK_RELAY_BATCH_SIZE", 50),
		RelayLease:             relayLease,
		RelayTick:              relayTick,
		PostgresURL:            get("MODULARIS_POSTGRES_URL", "postgres://modularis:modularis@localhost:5432/modularis_webhook?sslmode=disable"),
		PostgresConnectTimeout: postgresConnectTimeout,
		SignatureHeader:        strings.ToLower(get("MODULARIS_WEBHOOK_HEADER", "x-payment-signature")),
		SignatureSecret:        get("MODULARIS_WEBHOOK_SECRET", "change-this-webhook-secret-at-least-32-characters"),
		WebhookTolerance:       webhookTolerance,
		MaxBodyBytes:           getInt64("MODULARIS_WEBHOOK_MAX_BODY_BYTES", 1048576),
	}, nil
}

func get(key string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func getInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		panic(fmt.Sprintf("%s must be an integer: %v", key, err))
	}
	return parsed
}

func getInt64(key string, fallback int64) int64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		panic(fmt.Sprintf("%s must be an integer: %v", key, err))
	}
	return parsed
}

func duration(key string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	if strings.HasSuffix(value, "ms") || strings.HasSuffix(value, "s") || strings.HasSuffix(value, "m") {
		return time.ParseDuration(value)
	}
	if millis, err := strconv.Atoi(value); err == nil {
		return time.Duration(millis) * time.Millisecond, nil
	}
	return 0, fmt.Errorf("%s must be a duration or integer milliseconds", key)
}
