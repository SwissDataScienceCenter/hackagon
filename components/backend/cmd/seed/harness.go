package main

// The seed drives the real gRPC handlers rather than writing rows itself.
//
// Every fixture row used to be an ent builder in this package, and every casbin
// row that had to accompany it was a hand-written copy of what a handler
// already does. The copies drifted: the capability→policy switch was duplicated
// from SetCapabilities, votes were written without the checks SubmitVote makes,
// and an answer's storage format had to be kept true by hand. So the seed now
// stands up the actual server in-process and calls it, which means the fixture
// is by construction a state the application itself could have produced.
//
// It is a real gRPC server — protovalidate and the auth interceptor included —
// listening on an in-memory pipe rather than a port, so seeding needs neither
// the stack nor Keycloak. Authentication is the reason it cannot simply call
// the handler functions: every participant action (Join, SubmitAnswers,
// SetPreference, SubmitVote, CreateSubmission) acts as whoever holds the token
// and takes no actor argument, and a user's display name can only ever come
// from JWT claims. The seed therefore signs its own tokens with a throwaway key
// this process generates and the server is told to trust for this run only, so
// it can act as all 106 fixture identities — only four of which exist in
// Keycloak.

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"fmt"
	"net"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"

	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	userSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user"
	voteSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/service"
)

const (
	// bufSize is the in-memory pipe's buffer, same as the test harness uses.
	bufSize = 1024 * 1024
	// seedKeyBits is the throwaway signing key's size. It lives for one seed
	// run and never leaves this process.
	seedKeyBits = 2048
	// tokenLifetime only has to outlast the seed run.
	tokenLifetime = time.Hour
)

// harness is the in-process server plus one client per service.
//
// The clients are shared; the identity comes from the context an actor carries,
// so a call reads `h.hackathon.Join(bob.ctx, req)`.
type harness struct {
	ctx context.Context //nolint:containedctx // the base context for every seeded call
	cfg *config.Config
	key *rsa.PrivateKey

	// db is here for one write the API cannot do: see submitAnswers and
	// mydocs/docs/backend-tickets/answer-upsert-sql.md. Nothing else in the seed
	// may touch it — a row written around a handler is a row whose casbin
	// counterpart nobody wrote.
	db *ent.Client

	// enf is the server's own enforcer, exposed so the seed never builds a
	// second one: two enforcers in one process each cache their own copy of the
	// policy, and the one that did not write a role cannot see it.
	enf *middleware.Enforcer

	lis  *bufconn.Listener
	conn *grpc.ClientConn
	stop func()

	user      userSvc.UserServiceClient
	hackathon hackathonSvc.HackathonServiceClient
	page      hackathonSvc.PageServiceClient
	phase     hackathonSvc.PhaseServiceClient
	track     hackathonSvc.TrackServiceClient
	project   hackathonSvc.ProjectServiceClient
	team      hackathonSvc.TeamServiceClient
	vote      voteSvc.VoteServiceClient
}

// newHarness starts the gRPC server on an in-memory pipe against the given ent
// client.
//
// The client cannot be a transaction's: several handlers open a transaction of
// their own, and ent refuses one inside another ("cannot start a transaction
// within a transaction"). Driving the API and seeding atomically are therefore
// mutually exclusive — see seededHackathons for what replaces the guarantee.
func newHarness(ctx context.Context, db *ent.Client, cfg *config.Config) (*harness, error) {
	key, err := rsa.GenerateKey(rand.Reader, seedKeyBits)
	if err != nil {
		return nil, fmt.Errorf("generate seed signing key: %w", err)
	}

	keyfunc := jwt.Keyfunc(func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		return &key.PublicKey, nil
	})

	server, stopServer, enf, err := service.NewServer(db, cfg, &keyfunc)
	if err != nil {
		return nil, fmt.Errorf("build seed server: %w", err)
	}

	lis := bufconn.Listen(bufSize)
	go func() {
		// Serve returns when the listener closes, which is how close() stops it.
		_ = server.Serve(lis)
	}()

	conn, err := grpc.NewClient(
		"passthrough:///bufconn",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		stopServer()

		return nil, fmt.Errorf("dial seed server: %w", err)
	}

	return &harness{
		ctx:       ctx,
		cfg:       cfg,
		key:       key,
		db:        db,
		enf:       enf,
		lis:       lis,
		conn:      conn,
		stop:      stopServer,
		user:      userSvc.NewUserServiceClient(conn),
		hackathon: hackathonSvc.NewHackathonServiceClient(conn),
		page:      hackathonSvc.NewPageServiceClient(conn),
		phase:     hackathonSvc.NewPhaseServiceClient(conn),
		track:     hackathonSvc.NewTrackServiceClient(conn),
		project:   hackathonSvc.NewProjectServiceClient(conn),
		team:      hackathonSvc.NewTeamServiceClient(conn),
		vote:      voteSvc.NewVoteServiceClient(conn),
	}, nil
}

// close shuts the server down and stops the goroutine serving it.
func (h *harness) close() {
	_ = h.conn.Close()
	h.stop()
	_ = h.lis.Close()
}

// mintToken signs a token carrying the four claims the handlers read. The
// issuer has to match the one the server validates against, which is the real
// Keycloak issuer from config — only the signing key is ours.
func (h *harness) mintToken(keycloakID, username, displayName, email string) (string, error) {
	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub":                keycloakID,
		"preferred_username": username,
		"name":               displayName,
		"email":              email,
		"iss":                h.cfg.Oidc.IssuerUrl,
		"iat":                now.Unix(),
		"exp":                now.Add(tokenLifetime).Unix(),
	})

	signed, err := token.SignedString(h.key)
	if err != nil {
		return "", fmt.Errorf("sign token for %s: %w", username, err)
	}

	return signed, nil
}
