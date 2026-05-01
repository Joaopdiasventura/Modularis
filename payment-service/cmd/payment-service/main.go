package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/modularis/payment-service/internal/config"
	"github.com/modularis/payment-service/internal/core/payment"
	"github.com/modularis/payment-service/internal/infrastructure/gateway"
	mongorepo "github.com/modularis/payment-service/internal/infrastructure/mongo"
	"github.com/modularis/payment-service/internal/infrastructure/rabbit"
	httptransport "github.com/modularis/payment-service/internal/shared/http"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	mongoCtx, mongoCancel := context.WithTimeout(ctx, cfg.MongoConnectTimeout)
	defer mongoCancel()
	mongoClient, err := mongodriver.Connect(options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		logger.Error("failed to connect to mongo", "error", err)
		os.Exit(1)
	}
	defer func() {
		_ = mongoClient.Disconnect(context.Background())
	}()

	repo, err := mongorepo.NewRepository(mongoClient, cfg.MongoDatabase)
	if err != nil {
		logger.Error("failed to initialize repository", "error", err)
		os.Exit(1)
	}
	if err := repo.Ping(mongoCtx); err != nil {
		logger.Error("failed to ping mongo", "error", err)
		os.Exit(1)
	}

	bus, err := rabbit.NewBus(logger, cfg)
	if err != nil {
		logger.Error("failed to connect to rabbitmq", "error", err)
		os.Exit(1)
	}
	defer func() {
		_ = bus.Close()
	}()

	service := payment.NewService(logger, cfg, repo, gateway.NewMockGateway(cfg), bus)
	if err := rabbit.StartPaymentConsumers(ctx, bus, service); err != nil {
		logger.Error("failed to start consumers", "error", err)
		os.Exit(1)
	}

	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := service.PublishPending(ctx); err != nil {
					logger.Warn("failed to publish pending messages", "error", err)
				}
			}
		}
	}()

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httptransport.NewHandler(httptransport.HealthDependencies{RabbitReady: bus.Ready, Repo: repo}),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	logger.Info("payment-service started", "port", cfg.Port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Error("payment-service stopped unexpectedly", "error", err)
		os.Exit(1)
	}
}
