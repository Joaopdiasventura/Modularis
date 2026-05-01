package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	ServiceName                     string
	Port                            string
	RabbitURL                       string
	CommandExchange                 string
	EventExchange                   string
	ResponseExchange                string
	CommandQueue                    string
	EventQueue                      string
	DeliveryLimit                   int
	WebhookTolerance                time.Duration
	AllowedCurrencies               []string
	PaymentExpiration               time.Duration
	ProcessingAttempts              int
	ProcessingDelay                 time.Duration
	ProcessingBackoff               int
	SimulationDelay                 time.Duration
	SimulationFailuresBeforeSuccess int
	SimulationSuccessRate           float64
	SimulationSeed                  string
	SimulateWebhookConfirmation     bool
	MongoURI                        string
	MongoDatabase                   string
	MongoConnectTimeout             time.Duration
}

func Load() (Config, error) {
	webhookTolerance, err := duration("MODULARIS_WEBHOOK_TOLERANCE_MS", 300000*time.Millisecond)
	if err != nil {
		return Config{}, err
	}
	paymentExpiration, err := duration("MODULARIS_PAYMENT_EXPIRATION", 15*time.Minute)
	if err != nil {
		return Config{}, err
	}
	processingDelay, err := duration("MODULARIS_PAYMENT_PROCESSING_DELAY", 100*time.Millisecond)
	if err != nil {
		return Config{}, err
	}
	simulationDelay, err := duration("MODULARIS_PAYMENT_SIMULATION_DELAY", 200*time.Millisecond)
	if err != nil {
		return Config{}, err
	}
	mongoConnectTimeout, err := duration("MODULARIS_MONGO_CONNECT_TIMEOUT", 5*time.Second)
	if err != nil {
		return Config{}, err
	}

	return Config{
		ServiceName:                     get("MODULARIS_SERVICE_NAME", "payment-service"),
		Port:                            get("PORT", "8080"),
		RabbitURL:                       get("MODULARIS_RABBITMQ_URL", "amqp://user:user@localhost:5672/"),
		CommandExchange:                 get("MODULARIS_COMMAND_EXCHANGE", "modularis.commands"),
		EventExchange:                   get("MODULARIS_EVENT_EXCHANGE", "modularis.events"),
		ResponseExchange:                get("MODULARIS_RESPONSE_EXCHANGE", "modularis.responses"),
		CommandQueue:                    get("MODULARIS_PAYMENT_COMMAND_QUEUE", "payment-service.commands"),
		EventQueue:                      get("MODULARIS_PAYMENT_EVENT_QUEUE", "payment-service.events"),
		DeliveryLimit:                   getInt("MODULARIS_RABBITMQ_DELIVERY_LIMIT", 5),
		WebhookTolerance:                webhookTolerance,
		AllowedCurrencies:               splitCSV(get("MODULARIS_ALLOWED_CURRENCIES", "BRL")),
		PaymentExpiration:               paymentExpiration,
		ProcessingAttempts:              getInt("MODULARIS_PAYMENT_PROCESSING_ATTEMPTS", 3),
		ProcessingDelay:                 processingDelay,
		ProcessingBackoff:               getInt("MODULARIS_PAYMENT_PROCESSING_BACKOFF", 2),
		SimulationDelay:                 simulationDelay,
		SimulationFailuresBeforeSuccess: getInt("MODULARIS_PAYMENT_SIMULATION_FAILURES_BEFORE_SUCCESS", 0),
		SimulationSuccessRate:           getFloat("MODULARIS_PAYMENT_SIMULATION_SUCCESS_RATE", 1),
		SimulationSeed:                  get("MODULARIS_PAYMENT_SIMULATION_SEED", "modularis"),
		SimulateWebhookConfirmation:     getBool("MODULARIS_PAYMENT_SIMULATE_WEBHOOK_CONFIRMATION", false),
		MongoURI:                        get("MODULARIS_MONGO_URI", "mongodb://localhost:27017"),
		MongoDatabase:                   get("MODULARIS_MONGO_DATABASE", "modularis_payments"),
		MongoConnectTimeout:             mongoConnectTimeout,
	}, nil
}

func get(key, fallback string) string {
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

func getFloat(key string, fallback float64) float64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		panic(fmt.Sprintf("%s must be numeric: %v", key, err))
	}
	return parsed
}

func getBool(key string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	if value == "true" {
		return true
	}
	if value == "false" {
		return false
	}
	panic(fmt.Sprintf("%s must be true or false", key))
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

func splitCSV(value string) []string {
	items := strings.Split(value, ",")
	result := make([]string, 0, len(items))
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed != "" {
			result = append(result, strings.ToUpper(trimmed))
		}
	}
	return result
}
