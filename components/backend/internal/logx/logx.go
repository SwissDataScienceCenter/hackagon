// Package logx bootstraps the default slog logger and provides a small
// Fatal helper for startup paths.
package logx

import (
	"log/slog"
	"os"
	"strings"
)

// Setup installs a JSON slog handler on the default logger. The log level
// is read from the LOG_LEVEL env var (debug|info|warn|error) and defaults
// to info.
func Setup() {
	opts := &slog.HandlerOptions{Level: parseLevel(os.Getenv("LOG_LEVEL"))}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, opts)))
}

// Fatal logs an error-level message and exits the process with status 1.
// Intended for unrecoverable startup failures.
func Fatal(msg string, args ...any) {
	slog.Error(msg, args...)
	os.Exit(1)
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(s) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
