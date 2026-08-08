package service

import (
	"fmt"

	"buf.build/go/protovalidate"
	grpc_middleware "github.com/grpc-ecosystem/go-grpc-middleware"
	protovalidate_middleware "github.com/grpc-ecosystem/go-grpc-middleware/v2/interceptors/protovalidate"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	"github.com/golang-jwt/jwt/v5"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/audit"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/health"
	siteSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/site"
	storageSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/storage"
	userSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user"
	voteSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote"
	objstore "github.com/swissdatasciencecenter/hackagon/components/backend/internal/storage"
)

// NewServer creates a gRPC server with all middleware, services, and registration.
// Returns: server instance, cleanup function, enforcer, error.
// The cleanup function should be called to gracefully stop the server.
func NewServer(
	dbClient *ent.Client,
	cfg *config.Config,
	keyfunc *jwt.Keyfunc,
) (*grpc.Server, func(), *mw.Enforcer, error) {
	// Create Casbin enforcer
	enf, err := mw.NewRBACEnforcer(cfg)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("create RBAC enforcer: %w", err)
	}

	// Create JWT validator
	var validator *mw.JWTValidator
	if keyfunc != nil {
		validator = mw.NewTestJWTValidator(cfg, *keyfunc)
	} else {
		validator, err = mw.NewJWTValidator(cfg)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("create jwt validator: %w", err)
		}
	}

	// Create protovalidate
	protoValidator, err := protovalidate.New()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("create protovalidate: %w", err)
	}
	validationInterceptor := protovalidate_middleware.UnaryServerInterceptor(protoValidator)

	// Create auth interceptor
	authInterceptor := mw.AuthUnaryServerInterceptor(validator)

	// RPC journal — OFF unless cfg.Audit.Enabled. See internal/audit and
	// config.AuditConfig for exactly what enabling it records.
	journal, err := audit.Open(cfg.Audit, audit.NewResolver(audit.EntLookup(dbClient)))
	if err != nil {
		return nil, nil, nil, fmt.Errorf("open rpc journal: %w", err)
	}

	// Middleware chain, in order. Auth first: everything downstream reads the
	// claims it puts in the context. The journal sits between auth and
	// validation so a request rejected by protovalidate is still recorded —
	// InvalidArgument is an outcome the recipe asserts on.
	chain := []grpc.UnaryServerInterceptor{authInterceptor}
	if audited := audit.UnaryServerInterceptor(journal); audited != nil {
		chain = append(chain, audited)
	}
	chain = append(chain, validationInterceptor)

	server := grpc.NewServer(
		grpc.UnaryInterceptor(grpc_middleware.ChainUnaryServer(chain...)),
	)

	// Object store. Optional: with no endpoint configured (which is what the
	// unit-test config does) the storage RPCs answer Unavailable and the two
	// delete handlers skip their purge, rather than every test needing a
	// bucket. New performs no I/O, so a store that is merely DOWN still lets
	// the backend start — that failure belongs on the first upload, where
	// someone can act on it.
	var store *objstore.Client
	if cfg.Storage.Endpoint != "" {
		store, err = objstore.New(cfg.Storage)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("create storage client: %w", err)
		}
	}

	// Create services
	healthService := NewHealthService()
	userService := NewUserService(dbClient, enf, store)
	hackathonService := NewHackathonService(dbClient, enf, store)
	pageService := NewPageService(dbClient, enf)
	phaseService := NewPhaseService(dbClient, enf)
	trackService := NewTrackService(dbClient, enf)
	projectService := NewProjectService(dbClient, enf)
	teamService := NewTeamService(dbClient, enf)
	voteService := NewVoteService(dbClient, enf)
	configService := NewConfigService(dbClient, enf)
	prizeService := NewPrizeService(dbClient, enf)
	sitePageService := NewSitePageService(dbClient, enf)
	storageService := NewStorageService(dbClient, enf, store)

	// Register services
	health.RegisterHealthServiceServer(server, healthService)
	userSvc.RegisterUserServiceServer(server, userService)
	hackathonSvc.RegisterHackathonServiceServer(server, hackathonService)
	hackathonSvc.RegisterPageServiceServer(server, pageService)
	hackathonSvc.RegisterPhaseServiceServer(server, phaseService)
	hackathonSvc.RegisterTrackServiceServer(server, trackService)
	hackathonSvc.RegisterProjectServiceServer(server, projectService)
	hackathonSvc.RegisterTeamServiceServer(server, teamService)
	voteSvc.RegisterVoteServiceServer(server, voteService)
	hackathonSvc.RegisterConfigServiceServer(server, configService)
	hackathonSvc.RegisterPrizeServiceServer(server, prizeService)
	siteSvc.RegisterSitePageServiceServer(server, sitePageService)
	storageSvc.RegisterStorageServiceServer(server, storageService)
	reflection.Register(server)

	// Cleanup: shutdown the gRPC server, then drain the journal so the last
	// calls of a session are on disk before the process exits.
	cleanup := func() {
		server.GracefulStop()
		journal.Close()
	}

	return server, cleanup, enf, nil
}
