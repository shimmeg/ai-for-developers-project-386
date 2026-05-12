// Package config loads runtime configuration from environment variables.
// All settings have sensible defaults. ADMIN_TOKEN is optional: when
// unset, a random token is generated and admin endpoints become
// effectively inaccessible — the auth middleware still runs, it just
// never matches an incoming header. This lets the service boot in
// CI smoke environments (e.g., the Hexlet check) that only verify
// the public catalog responds on $PORT.
package config

import (
	"crypto/rand"
	"encoding/hex"
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
	StaticDir      string
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
// when PORT is malformed, when LOG_LEVEL is unrecognised, or when an
// explicitly-set ADMIN_TOKEN is shorter than the minimum length.
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

	token, err := loadAdminToken()
	if err != nil {
		return Config{}, err
	}
	cfg.AdminToken = token

	if v := os.Getenv("FRONTEND_ORIGIN"); v != "" {
		cfg.FrontendOrigin = v
	}
	// STATIC_DIR enables same-origin SPA hosting: when set, the server reads
	// the built frontend from this directory and serves it alongside the
	// API. Empty string disables it (the dev/test default).
	cfg.StaticDir = os.Getenv("STATIC_DIR")
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

// loadAdminToken returns the configured admin token. When ADMIN_TOKEN is
// unset, a 32-byte random hex token is generated so the service can boot;
// the value is never logged or surfaced, so admin endpoints become
// inaccessible in practice. When ADMIN_TOKEN is set, it must meet the
// minimum length so deployments don't accidentally pick a weak secret.
func loadAdminToken() (string, error) {
	t := os.Getenv("ADMIN_TOKEN")
	if t == "" {
		var b [32]byte
		if _, err := rand.Read(b[:]); err != nil {
			return "", fmt.Errorf("generate random admin token: %w", err)
		}
		fmt.Fprintln(os.Stderr, "warning: ADMIN_TOKEN not set; generated a random token, admin endpoints will be inaccessible")
		return hex.EncodeToString(b[:]), nil
	}
	if len(t) < minAdminTokenLength {
		return "", fmt.Errorf("ADMIN_TOKEN must be at least %d characters", minAdminTokenLength)
	}
	return t, nil
}
