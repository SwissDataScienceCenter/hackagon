// Package logx bootstraps the default slog logger and provides a small
// Fatal helper for startup paths.
package logx

import (
	"log/slog"
	"os"
	"strings"
)

// Setup installs a JSON slog handler on the default logger at the given
// level (debug|info|warn|error). An empty or unrecognized value defaults
// to info. Safe to call more than once; a second call replaces the
// default logger with one at the new level.
func Setup(level string) {
	opts := &slog.HandlerOptions{Level: parseLevel(level)}
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
