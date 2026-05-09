package config

import (
	"flag"
	"log/slog"
	"os"
	"path/filepath"
)

type Config struct {
	SocketPath string
	BundlePath string
	LogLevel   slog.Level
	HealthPort int
}

func Parse() *Config {
	homeDir, _ := os.UserHomeDir()
	defaultSocket := filepath.Join(homeDir, ".kirakira", "kirakirad.sock")
	defaultBundle := filepath.Join(".", "policies")

	cfg := &Config{}
	flag.StringVar(&cfg.SocketPath, "socket", defaultSocket, "Unix socket path")
	flag.StringVar(&cfg.BundlePath, "bundle", defaultBundle, "OPA bundle path")
	flag.IntVar(&cfg.HealthPort, "health-port", 0, "HTTP health check port (0 = disabled)")

	levelStr := flag.String("log-level", "info", "Log level (debug, info, warn, error)")
	flag.Parse()

	switch *levelStr {
	case "debug":
		cfg.LogLevel = slog.LevelDebug
	case "warn":
		cfg.LogLevel = slog.LevelWarn
	case "error":
		cfg.LogLevel = slog.LevelError
	default:
		cfg.LogLevel = slog.LevelInfo
	}

	return cfg
}
