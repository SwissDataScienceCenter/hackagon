// Package migrate holds one-off repairs to data that an older build wrote
// differently.
//
// Everything here is meant to be deleted. Once every live database has booted
// the build that introduced a migration, that migration can never fire again;
// each one says which release it can go after.
package migrate

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
)

// Run applies every outstanding migration. Called once at startup, after the
// enforcer is built and after ensurePublicGrants, so that a row is always added
// before its predecessor is taken away.
func Run(ctx context.Context, dbClient *ent.Client, enf *mw.Enforcer) error {
	return dropLegacyPublicRead(ctx, dbClient, enf)
}

// dropLegacyPublicRead removes the `*, /hackathon/<id>, hackathon, read` row
// that making a hackathon public used to write.
// Delete after 0.9.2.
func dropLegacyPublicRead(ctx context.Context, dbClient *ent.Client, enf *mw.Enforcer) error {
	ids, err := dbClient.Hackathon.Query().IDs(ctx)
	if err != nil {
		return fmt.Errorf("query hackathons: %w", err)
	}

	for _, id := range ids {
		if err := enf.RemovePolicy(nil, id.String(), mw.Hackathon, mw.Read); err != nil {
			return fmt.Errorf("drop legacy public read on hackathon %s: %w", id, err)
		}
	}
	slog.Info("dropped legacy public read rows", "hackathons", len(ids))

	return nil
}
