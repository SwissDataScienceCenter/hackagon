package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"os"

	_ "github.com/lib/pq"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	_ "github.com/swissdatasciencecenter/hackagon/components/backend/ent/runtime" // registers schema hooks and default values
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/logx"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/service"
)

func seedAdminUser(ctx context.Context, dbClient *ent.Client, cfg *config.Config) error {
	exists, err := dbClient.User.Query().
		Where(user.KeycloakIDEQ(cfg.Server.AdminKeycloakID)).
		Exist(ctx)
	if err != nil {
		return fmt.Errorf("check admin user: %w", err)
	}
	if exists {
		return nil
	}
	_, err = dbClient.User.Create().
		SetKeycloakID(cfg.Server.AdminKeycloakID).
		SetUsername("hackagon-admin").
		SetDisplayName("Hackagon Admin").
		SetEmail(cfg.Server.AdminEmail).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("create admin user: %w", err)
	}
	slog.Info("seeded admin user", "keycloak_id", cfg.Server.AdminKeycloakID)

	return nil
}

// reconcilePublicAccess re-grants the public casbin rows for every hackathon
// whose visibility already says public.
//
// Visibility is stored on the hackathon row, but what it *does* is a set of
// casbin rows written at the moment Create or Edit runs. The two can therefore
// disagree, and today they do: `page:read` only recently joined that set, so
// every hackathon made public before it carries the old half-grant and answers
// an anonymous PageService.List with PermissionDenied. Nothing re-runs Edit on
// those, so nothing would ever repair them.
//
// It runs on every boot rather than as a migration script somebody has to
// remember per environment, which it can afford to do because
// AllowPublicHackathonAccess is a no-op per row that already exists. It also
// makes the DB the authority: whatever the casbin table holds, visibility wins.
func reconcilePublicAccess(ctx context.Context, dbClient *ent.Client, enf *mw.Enforcer) error {
	public, err := dbClient.Hackathon.Query().
		Where(enthackathon.VisibilityEQ(enthackathon.VisibilityPublic)).
		IDs(ctx)
	if err != nil {
		return fmt.Errorf("query public hackathons: %w", err)
	}

	for _, id := range public {
		if _, err := enf.AllowPublicHackathonAccess(id.String()); err != nil {
			return fmt.Errorf("grant public access to hackathon %s: %w", id, err)
		}
	}
	slog.Info("reconciled public hackathon access", "hackathons", len(public))

	return nil
}

func main() {
	logx.Setup("")

	configDirPtr := flag.String("config-dir", "./data/test/config/", "path to config")
	flag.Parse()
	cfg, err := config.Load(*configDirPtr)
	if err != nil {
		logx.Fatal("load config", "err", err)
	}
	logx.Setup(cfg.Logging.Level)

	slog.Info("starting backend service")
	// migrate database
	dbClient, err := ent.Open(
		"postgres",
		cfg.ConnectionStr(),
		ent.Log(func(a ...any) { slog.Debug("ent", "msg", fmt.Sprint(a...)) }),
	)
	if err != nil {
		logx.Fatal("open database", "err", err)
	}

	defer dbClient.Close()
	if err := dbClient.Schema.Create(context.Background()); err != nil {
		logx.Fatal("create schema", "err", err)
	}
	if err := seedAdminUser(context.Background(), dbClient, cfg); err != nil {
		logx.Fatal("seed admin user", "err", err)
	}

	// Create server with all middleware and services
	server, cleanup, enforcer, err := service.NewServer(dbClient, cfg, nil)
	if err != nil {
		logx.Fatal("create server", "err", err)
	}
	defer cleanup()

	// After NewServer, because that is what builds the enforcer, and before
	// Serve, so no request is answered against a half-written policy table.
	if err := reconcilePublicAccess(context.Background(), dbClient, enforcer); err != nil {
		logx.Fatal("reconcile public hackathon access", "err", err)
	}

	// Listen
	lc := net.ListenConfig{} //nolint:exhaustruct // all fields optional
	lis, err := lc.Listen(context.Background(), "tcp", fmt.Sprintf(":%s", cfg.Server.Port))
	if err != nil {
		logx.Fatal("listen", "err", err)
	}

	slog.Info("grpc server listening", "port", cfg.Server.Port)

	// Serve
	if err := server.Serve(lis); err != nil {
		logx.Fatal("serve", "err", err)
	}

	// Graceful shutdown
	shutdown := make(chan os.Signal, 1)
	<-shutdown

	slog.Info("shutting down server")
	server.GracefulStop()
	slog.Info("server stopped")
}
