package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/modularis/webhook-service/internal/config"
	"github.com/modularis/webhook-service/internal/core/webhook"
	"github.com/modularis/webhook-service/internal/infrastructure/postgres"
	"github.com/modularis/webhook-service/internal/infrastructure/rabbit"
	httptransport "github.com/modularis/webhook-service/internal/shared/http"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	receiptStore, err := postgres.NewReceiptStore(ctx, cfg)
	if err != nil {
		logger.Error("failed to connect to postgres", "error", err)
		os.Exit(1)
	}
	defer func() {
		_ = receiptStore.Close()
	}()

	bus, err := rabbit.NewBus(logger, cfg)
	if err != nil {
		logger.Error("failed to connect to rabbitmq", "error", err)
		os.Exit(1)
	}
	defer func() {
		_ = bus.Close()
	}()

	go webhook.NewRelay(logger, cfg, receiptStore, bus).Run(ctx)

	server := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: httptransport.NewHandler(httptransport.HandlerDependencies{
			Probes: []httptransport.ReadinessProbe{receiptStore, bus},
			PaymentWebhookHandler: webhook.NewHandler(webhook.HandlerDependencies{
				Config: cfg,
				Logger: logger,
				Store:  receiptStore,
			}),
		}),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	logger.Info("webhook-service started", "port", cfg.Port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Error("webhook-service stopped unexpectedly", "error", err)
		os.Exit(1)
	}
}
