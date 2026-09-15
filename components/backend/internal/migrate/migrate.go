// Package migrate holds one-off repairs to data an older build wrote
// differently. Everything here is meant to be deleted; each says when.
package migrate

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
)

// Run applies every outstanding migration, once at startup.
func Run(ctx context.Context, dbClient *ent.Client, enf *mw.Enforcer) error {
	return publicHackathonsGrantViewNotRead(ctx, dbClient, enf)
}

// publicHackathonsGrantViewNotRead moves already-public hackathons onto `view`
// and drops the `*` `read` row they were published with.
//
// Grant before revoke, so none is briefly unreachable. The revoke covers every
// hackathon, not just the public ones.
//
// Delete after 0.9.2.
func publicHackathonsGrantViewNotRead(
	ctx context.Context,
	dbClient *ent.Client,
	enf *mw.Enforcer,
) error {
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

	all, err := dbClient.Hackathon.Query().IDs(ctx)
	if err != nil {
		return fmt.Errorf("query hackathons: %w", err)
	}
	for _, id := range all {
		// A nil role is the `*` subject, so this is the legacy row exactly.
		if err := enf.RemovePolicy(nil, id.String(), mw.Hackathon, mw.Read); err != nil {
			return fmt.Errorf("drop legacy public read on hackathon %s: %w", id, err)
		}
	}
	slog.Info(
		"public hackathons now grant view, not read",
		"public",
		len(public),
		"checked",
		len(all),
	)

	return nil
}
