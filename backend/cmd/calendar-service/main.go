// Command calendar-service runs the v1 calendar booking HTTP API.
// All state is in-memory and lost on restart — see ../../README.md for the
// roadmap to PostgreSQL persistence.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/config"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/repository/memory"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/server"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/service"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "fatal:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		return err
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(logger)

	if _, err := domain.LoadLocation(cfg.DefaultTZ); err != nil {
		return fmt.Errorf("DEFAULT_TZ: %w", err)
	}

	store := memory.NewStore(domain.DefaultSettings(cfg.DefaultTZ))
	clock := domain.SystemClock{}

	srv := server.New(
		service.NewSettingsService(store.Settings),
		service.NewEventTypeService(store.EventTypes, clock),
		service.NewBookingService(store.Settings, store.EventTypes, store.Bookings, clock),
	)

	gin.SetMode(gin.ReleaseMode)
	engine := server.BuildEngine(srv, cfg.AdminToken, cfg.FrontendOrigin)

	httpSrv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           engine,
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		logger.Info("server listening", "port", cfg.Port, "frontendOrigin", cfg.FrontendOrigin)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http server crashed", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return httpSrv.Shutdown(shutdownCtx)
}
