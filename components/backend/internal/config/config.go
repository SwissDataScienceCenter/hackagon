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
	Storage  StorageConfig  `yaml:"storage"`
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

// StorageConfig addresses the S3-compatible object store that holds uploaded
// files. In development that is the `rustfs` container from
// .devcontainer/docker-compose.yml; in a deployment it is S3/MinIO/whatever
// speaks the same API, with the keys injected from a secret store rather than
// read out of this file.
type StorageConfig struct {
	// Endpoint is the S3 base URL. Defaults to the compose service name
	// because the dev container reaches rustfs over the compose network —
	// localhost:9000 is NOT an option there, Keycloak's management port
	// already owns 9000 inside that container. Native (non-container) setups
	// override with HACKAGON_STORAGE_ENDPOINT=http://localhost:9000.
	Endpoint string `yaml:"endpoint"`
	Region   string `yaml:"region"`
	Bucket   string `yaml:"bucket"`
	// DEV-ONLY defaults, mirroring the database password above: they match the
	// committed compose defaults so a fresh checkout works unconfigured.
	// Deployments override every field via HACKAGON_STORAGE_* env vars.
	AccessKey string `yaml:"accesskey"`
	SecretKey string `yaml:"secretkey"`
	// UsePathStyle keeps requests as endpoint/bucket/key. rustfs only supports
	// virtual-hosted style (bucket.host/key) when RUSTFS_SERVER_DOMAINS is
	// set, which the dev service deliberately does not set — there is no
	// wildcard DNS for *.rustfs on the compose network.
	UsePathStyle bool `yaml:"usepathstyle"`
	// PublicPrefix is the path the FRONTEND serves objects under, on its own
	// origin — the vite proxy in components/frontend/vite.config.ts and the
	// matching caddy route in .devcontainer/Caddyfile.tunnel. Presigned URLs
	// and stored paths are both built from it, so they are root-relative and
	// resolve from localhost, the tunnel and a deployment alike. Point it at a
	// CDN origin to serve uploads from somewhere else.
	PublicPrefix string `yaml:"publicprefix"`
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
		"storage": map[string]interface{}{
			"endpoint":     "http://rustfs:9000",
			"region":       "us-east-1",
			"bucket":       "hackagon-dev",
			"accesskey":    "hackagon-dev",
			"secretkey":    "hackagon-dev-secret",
			"usepathstyle": true,
			"publicprefix": "/objects",
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
