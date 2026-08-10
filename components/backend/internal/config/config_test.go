//go:build test && unittest

package config_test

import (
	"net/url"
	"os"
	"path/filepath"

	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
)

// A config.yaml complete enough for Load to succeed. Load rejects an empty
// server.adminkeycloakid, so that field has to be here.
const baseYAML = `
server:
  port: "3000"
  adminkeycloakid: "1183370a-46a2-4dad-b8fd-dd927d083e14"
oidc:
  jwksurl: "http://localhost:8180/realms/hackagon/protocol/openid-connect/certs"
  issuerurl: "http://localhost:8180/realms/hackagon"
  algorithm: "RS256"
`

// writeConfigDir returns a directory holding the given files, addressed the
// way the real callers address it: with a TRAILING SLASH, because Load runs
// path.Dir over its argument.
func writeConfigDir(files map[string]string) string {
	dir := GinkgoT().TempDir()
	for name, content := range files {
		Expect(os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600)).To(Succeed())
	}

	return dir + "/"
}

var _ = Describe("Load", func() {
	Context("without an overlay", func() {
		It("uses config.yaml", func() {
			cfg, err := config.Load(writeConfigDir(map[string]string{"config.yaml": baseYAML}))
			Expect(err).ToNot(HaveOccurred())
			Expect(cfg.Oidc.IssuerUrl).To(Equal("http://localhost:8180/realms/hackagon"))
		})
	})

	Context("with config.local.yaml beside it", func() {
		const overlayYAML = `
oidc:
  issuerurl: "https://example-tunnel.trycloudflare.com/realms/hackagon"
`

		It("overrides config.yaml and leaves untouched keys alone", func() {
			cfg, err := config.Load(writeConfigDir(map[string]string{
				"config.yaml":       baseYAML,
				"config.local.yaml": overlayYAML,
			}))
			Expect(err).ToNot(HaveOccurred())

			Expect(cfg.Oidc.IssuerUrl).
				To(Equal("https://example-tunnel.trycloudflare.com/realms/hackagon"))
			// The overlay is a PARTIAL: naming one key under oidc must not
			// erase its siblings. jwksurl deliberately stays on localhost even
			// while a tunnel is wired.
			Expect(cfg.Oidc.JwksUrl).
				To(Equal("http://localhost:8180/realms/hackagon/protocol/openid-connect/certs"))
			Expect(cfg.Oidc.Algorithm).To(Equal("RS256"))
			// And a key from a section the overlay never mentions.
			Expect(cfg.Server.Port).To(Equal("3000"))
		})

		It("still loses to the environment", func() {
			GinkgoT().Setenv("HACKAGON_OIDC_ISSUERURL", "http://env.example/realms/hackagon")

			cfg, err := config.Load(writeConfigDir(map[string]string{
				"config.yaml":       baseYAML,
				"config.local.yaml": overlayYAML,
			}))
			Expect(err).ToNot(HaveOccurred())
			Expect(cfg.Oidc.IssuerUrl).To(Equal("http://env.example/realms/hackagon"))
		})

		It("fails loudly when the overlay is malformed", func() {
			_, err := config.Load(writeConfigDir(map[string]string{
				"config.yaml":       baseYAML,
				"config.local.yaml": "oidc: [this is not a mapping\n",
			}))
			// Ignoring a broken overlay would mean the operator's override
			// quietly stops applying — the exact failure mode the overlay was
			// introduced to end.
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("config.local.yaml"))
		})
	})
})

// The tracked configs are the repository's, not this machine's. Nothing that
// wires this checkout to a temporary hostname may write into them: a
// Cloudflare quick-tunnel issuer was once committed this way and sat there for
// several commits, and a fresh clone pointed at a tunnel that no longer
// existed. Tunnel wiring goes in config.local.yaml, which is gitignored.
//
// This guard lives here — in the package that DEFINES the precedence chain —
// rather than in the e2e harness, because the harness is not part of the
// repository on every branch while these two files always are, and because
// `go test ./internal/...` runs in CI. It reaches across to the frontend's
// config on purpose: it is one invariant over two files, and splitting it in
// two leaves two half-guards that can drift apart.
var _ = Describe("the tracked config files", func() {
	DescribeTable("keep their OIDC issuer on localhost",
		func(relPath, key string) {
			k := koanf.New(".")
			Expect(k.Load(file.Provider(relPath), yaml.Parser())).To(Succeed())

			raw := k.String(key)
			Expect(raw).ToNot(BeEmpty(), "%s has no %s", relPath, key)

			parsed, err := url.Parse(raw)
			Expect(err).ToNot(HaveOccurred())
			Expect(parsed.Hostname()).To(Equal("localhost"),
				"%s: %s is %q. A tracked config must never carry a machine- or "+
					"tunnel-specific hostname — write it to config.local.yaml "+
					"instead (gitignored; see .claude/skills/cloudflare-tunnel/"+
					"scripts/auth-wire.sh).", relPath, key, raw)
		},
		Entry("backend", "../../data/test/config/config.yaml", "oidc.issuerurl"),
		Entry("frontend", "../../../frontend/data/test/config/config.yaml", "oidc.issuer"),
	)
})
