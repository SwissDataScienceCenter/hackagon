package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/confmap"
	"github.com/knadh/koanf/providers/env/v2"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
)

type Config struct {
	Server ServerConfig `yaml:"server"`
	Oidc   OidcConfig   `yaml:"oidc"`
}

type ServerConfig struct {
	Port string `yaml:"port"`
}

type OidcConfig struct {
	JwksUrl   string        `yaml:"jwks_url"`
	IssuerUrl string        `yaml:"issuer_url"`
	Algorithm string        `yaml:"algorithm"`
	CacheTTL  time.Duration `yaml:"cache_ttl"`
}

func Load() (*Config, error) {
	k := koanf.New(".")

	// Load defaults from hardcoded confmap provider
	defaults := map[string]interface{}{
		"server": map[string]interface{}{
			"port": "3000",
		},
		"oidc": map[string]interface{}{
			"jwks_url":   "http://localhost:8180/realms/hackagon/jwks",
			"issuer_url": "http://localhost:8180/realms/hackagon/",
			"algorithm":  "RS256",
			"cache_ttl":  "3600s",
		},
	}
	if err := k.Load(confmap.Provider(defaults, ""), nil); err != nil {
		return nil, err
	}

	// Override with YAML config file
	if err := k.Load(file.Provider("config.yaml"), yaml.Parser()); err != nil {
		if !strings.Contains(err.Error(), "no such file") {
			return nil, err
		}
	}

	// Override with environment variables
	if err := k.Load(env.Provider(".", env.Opt{
		Prefix: "HACKAGON_",
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

	return &cfg, nil
}

func (c *Config) String() string {
	return fmt.Sprintf("Server: { Port: %s }", c.Server.Port)
}
