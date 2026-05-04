package config

import (
	"errors"
	"fmt"
	"log/slog"
	"path"
	"strings"

	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/confmap"
	"github.com/knadh/koanf/providers/env/v2"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
)

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Oidc     OidcConfig     `yaml:"oidc"`
	Logging  LoggingConfig  `yaml:"logging"`
}

type LoggingConfig struct {
	// Level is one of: debug, info, warn, error. Defaults to info.
	Level string `yaml:"level"`
}

type ServerConfig struct {
	Port            string `yaml:"port"`
	AdminEmail      string `yaml:"adminemail"`
	AdminKeycloakID string `yaml:"adminkeycloakid"`
}
type DatabaseConfig struct {
	Driver   string `yaml:"driver"`
	Host     string `yaml:"host"`
	Port     int16  `yaml:"port"`
	DbName   string `yaml:"dbname"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
}

type OidcConfig struct {
	JwksUrl   string `yaml:"jwksurl"`
	IssuerUrl string `yaml:"issuerurl"`
	Algorithm string `yaml:"algorithm"`
}

func (c *Config) ConnectionStr() string {
	switch c.Database.Driver {
	case "sqlite3":
		// For SQLite, use in-memory database
		// This can be overridden for testing
		dbName := c.Database.DbName
		if dbName == "" {
			dbName = "default-db"
		}
		dbName = strings.ReplaceAll(strings.ToLower(dbName), " ", "_")

		return fmt.Sprintf("file:%s?mode=memory&cache=shared&_fk=1", dbName)
	default:
		// Default to postgres connection string
		return fmt.Sprintf(
			"host=%s port=%d user=%s dbname=%s password=%s sslmode=disable",
			c.Database.Host,
			c.Database.Port,
			c.Database.User,
			c.Database.DbName,
			c.Database.Password,
		)
	}
}

func Load(configDir string) (*Config, error) {
	k := koanf.New(".")

	// Load defaults from hardcoded confmap provider
	defaults := map[string]interface{}{
		"server": map[string]interface{}{
			"port": "3000",
		},
		"database": map[string]interface{}{
			"driver": "postgres",
			"host":   "localhost",
			"port":   5432, //nolint:mnd // 5432 is the well-known default Postgres port
			"dbname": "hackagon",
			"user":   "postgres",
		},
		"oidc": map[string]interface{}{
			"jwksurl":   "http://localhost:8180/realms/hackagon/protocol/openid-connect/certs",
			"issuerurl": "http://localhost:8180/realms/hackagon",
			"algorithm": "RS256",
		},
		"logging": map[string]interface{}{
			"level": "info",
		},
	}
	if err := k.Load(confmap.Provider(defaults, ""), nil); err != nil {
		return nil, err
	}

	// Override with YAML config file
	configPath := path.Join(path.Dir(configDir), "config.yaml")
	if err := k.Load(file.Provider(configPath), yaml.Parser()); err != nil {
		if !strings.Contains(err.Error(), "no such file") {
			return nil, err
		}
		slog.Warn("couldn't load config file", "err", err)
	}

	// Override with environment variables
	if err := k.Load(env.Provider(".", env.Opt{
		Prefix:      "HACKAGON_",
		EnvironFunc: nil, // Use default os.Environ
		TransformFunc: func(k, v string) (string, any) {
			// Transform the key.
			k = strings.ReplaceAll(strings.ToLower(strings.TrimPrefix(k, "HACKAGON_")), "_", ".")

			// Transform the value into slices, if they contain spaces.
			// Eg: MYVAR_TAGS="foo bar baz" -> tags: ["foo", "bar", "baz"]
			if strings.Contains(v, " ") {
				return k, strings.Split(v, " ")
			}

			return k, v
		},
	}), nil); err != nil {
		return nil, err
	}

	// Convert to proper types
	var cfg Config
	if err := k.Unmarshal("", &cfg); err != nil {
		return nil, err
	}

	if cfg.Server.AdminKeycloakID == "" {
		return nil, errors.New("server.adminkeycloakid is required")
	}

	return &cfg, nil
}

func (c *Config) String() string {
	return fmt.Sprintf("Server: { Port: %s }", c.Server.Port)
}
