//go:build test && integration

// Package smoke_test drives a *running* Hackagon stack over the network.
//
// Everything under `internal/**` is tested against in-memory SQLite, a mock
// keyfunc and a bufconn listener — no Postgres, no Keycloak, no sockets. That
// is the right trade for testing behaviour, and it is why those suites are
// where behaviour belongs. It also means three things production depends on are
// never exercised: the Postgres schema the migration actually produced, the
// token exchange with Keycloak, and the gRPC server on a real port.
//
// This suite exercises exactly those three and little else. It is deliberately
// thin: "is the deployed thing alive, does auth work end to end, does Postgres
// round-trip, and does a refusal refuse cleanly". Logic assertions belong in
// `internal/service` where they run in a second without a stack.
package smoke_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc/metadata"
)

func TestSmoke(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "Smoke Suite")
}

// Where the suite points. The defaults are the local process-compose stack
// (`just deploy::up`), so it runs unconfigured on a developer machine and in CI
// alike; the env vars are there to aim it at a deployed environment instead.
var (
	backendAddr = envOr("HACKAGON_SMOKE_BACKEND_ADDR", "localhost:3000")
	keycloakURL = envOr("HACKAGON_SMOKE_KEYCLOAK_URL", "http://localhost:8180")
	realm       = envOr("HACKAGON_SMOKE_REALM", "hackagon")
	clientID    = envOr("HACKAGON_SMOKE_CLIENT_ID", "hackagon-backend")

	// The dev-fixture password every seeded Keycloak user shares, documented in
	// CLAUDE.md. Overridable so the suite can be pointed somewhere its fixtures
	// differ — it is not a secret in any environment this suite should run
	// against, and pointing this at production is not a supported use.
	fixturePassword = envOr("HACKAGON_SMOKE_PASSWORD", "aliceandbob")
)

// specTimeout bounds every spec. A stack that is down should fail the suite in
// seconds with a legible message rather than hang until the CI job's 30-minute
// ceiling, which is the difference between a useful red build and one people
// learn to cancel.
const specTimeout = 30 * time.Second

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}

	return fallback
}

// tokens caches one access token per username. Specs run serially, and re-asking
// Keycloak for the same token on every call would add latency and failure
// surface to assertions that are not about Keycloak.
var tokens = map[string]string{}

// accessToken performs the OIDC password grant against Keycloak.
//
// This is the half `cmd/seed` structurally cannot cover: the seed signs its own
// tokens with a key the backend is configured to trust, so a realm with a
// renamed client, a missing user or direct-access-grants switched off still
// seeds perfectly green. Here the token has to come from Keycloak itself, and
// the backend has to accept it after fetching JWKS over the network.
func accessToken(ctx context.Context, username string) string {
	GinkgoHelper()

	if cached, ok := tokens[username]; ok {
		return cached
	}

	endpoint := fmt.Sprintf(
		"%s/realms/%s/protocol/openid-connect/token", keycloakURL, realm,
	)

	form := url.Values{
		"client_id":  {clientID},
		"username":   {username},
		"password":   {fixturePassword},
		"grant_type": {"password"},
		"scope":      {"openid profile"},
	}

	// The request carries the spec's deadline. http.DefaultClient has no
	// timeout of its own, so without a context a Keycloak that accepted the
	// connection and then never answered would hang this goroutine long after
	// the spec that owns it has been reported.
	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()),
	)
	Expect(err).NotTo(HaveOccurred())
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	Expect(err).NotTo(HaveOccurred(),
		"Keycloak unreachable at %s — is the stack up? (just deploy::up)", keycloakURL)
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	Expect(err).NotTo(HaveOccurred())
	Expect(resp.StatusCode).To(Equal(http.StatusOK),
		"Keycloak refused a token for %q: %s", username, body)

	var payload struct {
		AccessToken string `json:"access_token"`
	}
	Expect(json.Unmarshal(body, &payload)).To(Succeed())
	Expect(payload.AccessToken).NotTo(BeEmpty(),
		"Keycloak answered 200 for %q but the response carried no access_token", username)

	tokens[username] = payload.AccessToken

	return payload.AccessToken
}

// as derives an outgoing context authenticated as `username`, keeping the
// spec's deadline. Deriving from the spec context rather than Background is
// what makes specTimeout actually bound the RPC.
func as(ctx context.Context, username string) context.Context {
	GinkgoHelper()

	return metadata.AppendToOutgoingContext(
		ctx, "authorization", "Bearer "+accessToken(ctx, username),
	)
}
