package main

import (
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/kirakira-agent/kirakirad/internal/config"
	"github.com/kirakira-agent/kirakirad/internal/health"
	"github.com/kirakira-agent/kirakirad/internal/pdp"
)

func main() {
	cfg := config.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
		Level: cfg.LogLevel,
	}))
	slog.SetDefault(logger)

	engine, err := pdp.NewEngine(cfg.BundlePath)
	if err != nil {
		slog.Error("failed to create OPA engine", "error", err)
		os.Exit(1)
	}
	defer engine.Close()

	healthSvc := health.New(engine)

	server, err := pdp.NewServer(cfg.SocketPath, cfg.ListenAddr, engine, healthSvc)
	if err != nil {
		slog.Error("failed to create server", "error", err)
		os.Exit(1)
	}

	go func() {
		if err := server.Serve(); err != nil {
			slog.Error("server error", "error", err)
		}
	}()

	if cfg.HealthPort > 0 {
		go func() {
			if err := health.ServeHTTP(cfg.HealthPort, healthSvc); err != nil {
				slog.Error("health HTTP server failed", "port", cfg.HealthPort, "error", err)
			}
		}()
	}

	if cfg.ListenAddr != "" {
		slog.Info("kirakirad started", "addr", cfg.ListenAddr, "bundle", cfg.BundlePath)
	} else {
		slog.Info("kirakirad started", "socket", cfg.SocketPath, "bundle", cfg.BundlePath)
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	slog.Info("shutting down")
	_ = server.Close()
}
