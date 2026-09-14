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
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
)

// Run applies every outstanding migration. Called once at startup, after the
// enforcer is built and before the server serves.
func Run(ctx context.Context, dbClient *ent.Client, enf *mw.Enforcer) error {
	return publicHackathonsGrantViewNotRead(ctx, dbClient, enf)
}

// publicHackathonsGrantViewNotRead moves already-public hackathons onto the
// `view` grant and takes away the `read` one they were published with.
//
// `read` is what HackathonService.Get asks for, and Get answers with the
// participant roster, so granting it to `*` put every participant's name and
// e-mail address on the open internet. Public access is a `view` grant now, but
// the rows are written when Create or Edit runs and nothing re-runs Edit on a
// hackathon that is already public.
//
// Grant before revoke, so a public hackathon is never briefly unreachable.
//
// The revoke covers every hackathon, not only the public ones: the invariant is
// that no hackathon carries such a row at all, and scoping it to public ones
// would trust the old un-publish path to have cleaned up after itself. A nil
// role is the `*` subject (see Enforcer.RemovePolicy), so this is the legacy row
// exactly, and no method on the enforcer has to outlive the migration wanting it.
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
