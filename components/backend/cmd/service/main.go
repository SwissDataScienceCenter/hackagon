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
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/migrate"
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

// ensurePublicGrants re-grants publicHackathonGrants to every hackathon whose
// visibility already says public.
//
// Visibility lives on the hackathon row, but what it *does* is a set of casbin
// rows written when Create or Edit last ran, so the two can disagree: a grant
// added to that set later reaches new public hackathons and no existing one,
// because nothing re-runs Edit on them. This makes the visibility column the
// authority on every boot, which it can afford to do because each grant is a
// no-op once written.
//
// Not a migration -- it earns its keep every time publicHackathonGrants grows.
// One-off repairs live in internal/migrate.
func ensurePublicGrants(ctx context.Context, dbClient *ent.Client, enf *mw.Enforcer) error {
	public, err := dbClient.Hackathon.Query().
		Where(enthackathon.VisibilityEQ(enthackathon.VisibilityPublic)).
		IDs(ctx)
	if err != nil {
		return fmt.Errorf("query public hackathons: %w", err)
	}

	for _, id := range public {
		if _, err := enf.AllowPublicHackathonAccess(id.String()); err != nil {
			return fmt.Errorf("grant public view on hackathon %s: %w", id, err)
		}
	}
	slog.Info("ensured public hackathon grants", "hackathons", len(public))

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

	// After NewServer, which builds the enforcer, and before Serve, so no
	// request is answered against a half-migrated policy table. Grants first:
	// they add the rows the migration then makes obsolete, so a public
	// hackathon is never briefly unreachable.
	if err := ensurePublicGrants(context.Background(), dbClient, enforcer); err != nil {
		logx.Fatal("ensure public grants", "err", err)
	}
	if err := migrate.Run(context.Background(), dbClient, enforcer); err != nil {
		logx.Fatal("run migrations", "err", err)
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
