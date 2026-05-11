// Package config loads runtime configuration from environment variables.
// All settings have sensible defaults except ADMIN_TOKEN, which is
// mandatory and must be at least 16 characters long.
package config

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port           int
	AdminToken     string
	FrontendOrigin string
	DefaultTZ      string
	LogLevel       slog.Level
}

const (
	defaultPort           = 3000
	defaultFrontendOrigin = "http://localhost:5173"
	defaultDefaultTZ      = "UTC"
	defaultLogLevel       = slog.LevelInfo
	minAdminTokenLength   = 16
)

// LoadFromEnv builds a Config from process environment. Returns an error
// when ADMIN_TOKEN is missing/too short or when PORT is malformed.
func LoadFromEnv() (Config, error) {
	cfg := Config{
		Port:           defaultPort,
		FrontendOrigin: defaultFrontendOrigin,
		DefaultTZ:      defaultDefaultTZ,
		LogLevel:       defaultLogLevel,
	}

	if v := os.Getenv("PORT"); v != "" {
		port, err := strconv.Atoi(v)
		if err != nil || port <= 0 || port > 65535 {
			return Config{}, fmt.Errorf("PORT must be a valid TCP port, got %q", v)
		}
		cfg.Port = port
	}

	token := os.Getenv("ADMIN_TOKEN")
	if len(token) < minAdminTokenLength {
		return Config{}, fmt.Errorf("ADMIN_TOKEN must be at least %d characters", minAdminTokenLength)
	}
	cfg.AdminToken = token

	if v := os.Getenv("FRONTEND_ORIGIN"); v != "" {
		cfg.FrontendOrigin = v
	}
	if v := os.Getenv("DEFAULT_TZ"); v != "" {
		cfg.DefaultTZ = v
	}
	if v := os.Getenv("LOG_LEVEL"); v != "" {
		switch strings.ToLower(v) {
		case "debug":
			cfg.LogLevel = slog.LevelDebug
		case "info":
			cfg.LogLevel = slog.LevelInfo
		case "warn", "warning":
			cfg.LogLevel = slog.LevelWarn
		case "error":
			cfg.LogLevel = slog.LevelError
		default:
			return Config{}, fmt.Errorf("LOG_LEVEL must be one of debug|info|warn|error, got %q", v)
		}
	}
	return cfg, nil
}
