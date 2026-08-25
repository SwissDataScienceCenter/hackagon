package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	_ "github.com/swissdatasciencecenter/hackagon/components/backend/ent/runtime"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/logx"
)

const (
	aliceKeycloakID   = "a4fd1574-6564-4290-a2a4-1f64eb1025ef" // organizer
	bobKeycloakID     = "1d091735-29c1-45bb-848d-1af7f53ef51e" // participant
	charlesKeycloakID = "bcb2768f-83e3-426b-be4d-238de8ee1e58" // waitlisted viewer
	// dana and yuki hold the team seats hackagon-admin used to. They exist in
	// Postgres only — no Keycloak account, so nobody can log in as them, same as
	// H4's hundred. They are there so a team keeps its size and H3 keeps two
	// voters, not so you can drive the app as one; alice, bob and charles are
	// still the accounts for that.
	danaKeycloakID = "seed-dana" // team seat in H1 and H3
	yukiKeycloakID = "seed-yuki" // team seat in H2
)

// The four hackathons the fixture is made of. Their presence is what makes a
// second seed run a no-op, and a partial set is what says a run died partway.
const (
	sentinelHackathon = "AI Innovation Challenge 2026"
	climateHackathon  = "Climate Tech Hackathon 2026"
	sprintHackathon   = "Internal Product Sprint"
	dataForGood       = "Data for Good Hackathon 2026"
)

func seededHackathonNames() []string {
	return []string{
		sentinelHackathon,
		climateHackathon,
		sprintHackathon,
		dataForGood,
	}
}

// capabilities mirrors the six booleans on HackathonState, which are the six
// values of entities.Capability. Every capability-gated handler refuses unless
// the matching casbin policy row exists, and SetCapabilities is what normally
// writes both. The seed builds rows directly, so it has to do both by hand —
// see seedCapabilities.
func main() {
	logx.Setup("")

	configDirPtr := flag.String("config-dir", "./data/test/config/", "path to config directory")
	flag.Parse()

	cfg, err := config.Load(*configDirPtr)
	if err != nil {
		logx.Fatal("load config", "err", err)
	}
	logx.Setup(cfg.Logging.Level)

	db, err := ent.Open("postgres", cfg.ConnectionStr())
	if err != nil {
		logx.Fatal("open db", "err", err)
	}
	defer db.Close()

	ctx := context.Background()

	if err := db.Schema.Create(ctx); err != nil {
		logx.Fatal("migrate schema", "err", err)
	}

	switch present, err := seededHackathons(ctx, db); {
	case err != nil:
		logx.Fatal("check for existing seed data", "err", err)
	case len(present) == len(seededHackathonNames()):
		slog.Info("seed data already present, skipping")

		return
	case len(present) > 0:
		// A previous run died partway. Re-seeding on top would collide with what
		// it did leave behind, and skipping would hand you a half fixture that
		// looks whole, so say so instead of doing either.
		logx.Fatal(
			"partial seed data found — wipe it with `just clean::state` and seed again",
			"present", strings.Join(present, ", "),
		)
	}

	if err := seedAll(ctx, db, cfg); err != nil {
		logx.Fatal("seed", "err", err)
	}
	slog.Info("seed complete")
}

// seededHackathons reports which of the fixture's hackathons already exist.
//
// The seed is not atomic: it drives the API, and several handlers open a
// transaction of their own, which rules out wrapping the run in one — ent
// refuses a transaction inside a transaction. (Nor was it ever fully atomic:
// casbin writes through its own connection, so a rollback always left the
// policy rows behind.) All-or-nothing is therefore checked rather than
// enforced.
func seededHackathons(ctx context.Context, db *ent.Client) ([]string, error) {
	var present []string
	for _, name := range seededHackathonNames() {
		exists, err := db.Hackathon.Query().Where(hackathon.NameEQ(name)).Exist(ctx)
		if err != nil {
			return nil, fmt.Errorf("query hackathon %q: %w", name, err)
		}
		if exists {
			present = append(present, name)
		}
	}

	return present, nil
}

func seedAll(
	ctx context.Context,
	db *ent.Client,
	cfg *config.Config,
) error {
	// The server the whole fixture is built through — see harness.go for why the
	// seed calls RPCs rather than writing rows.
	h, err := newHarness(ctx, db, cfg)
	if err != nil {
		return err
	}
	defer h.close()

	// Users, created the way the application creates them: each one registers
	// itself, and its display name and email come off its token's claims.
	admin, err := h.register(
		cfg.Server.AdminKeycloakID,
		"hackagon-admin",
		"Hackagon Admin",
		cfg.Server.AdminEmail,
	)
	if err != nil {
		return err
	}
	alice, err := h.register(aliceKeycloakID, "alice", "Alice Wonderland", "alice@mail.com")
	if err != nil {
		return err
	}
	bob, err := h.register(bobKeycloakID, "bob", "Bob Henderson", "bob@mail.org")
	if err != nil {
		return err
	}
	charles, err := h.register(
		charlesKeycloakID,
		"charles",
		"Charles Whitfield",
		"charles@mail.net",
	)
	if err != nil {
		return err
	}
	dana, err := h.register(danaKeycloakID, "dana", "Dana Okonkwo", "dana@mail.org")
	if err != nil {
		return err
	}
	yuki, err := h.register(yukiKeycloakID, "yuki", "Yuki Tanaka", "yuki@mail.org")
	if err != nil {
		return err
	}

	// alice is a hackathon organizer globally, which is what lets her create
	// one. Only an admin can hand that out.
	if err := h.makeOrganizer(admin, alice); err != nil {
		return err
	}

	now := time.Now()

	// hackagon-admin takes part in none of these. He is the platform operator:
	// global admin, and owner of H2 and H3 — which is a job, not a seat in the
	// hackathon. He keeps every role that says so and holds no participant row
	// anywhere, so the global-admin escape hatch is exercised by somebody who is
	// genuinely outside the hackathon rather than a member in disguise.
	//
	// alice is the organizer of H1; she creates it and manages its content
	if err := h.seedH1(now, admin, alice, bob, charles, dana); err != nil {
		return fmt.Errorf("h1: %w", err)
	}

	// admin runs H2 and H3; charles takes part in neither
	if err := h.seedH2(now, admin, alice, bob, yuki); err != nil {
		return fmt.Errorf("h2: %w", err)
	}
	if err := h.seedH3(now, admin, alice, dana); err != nil {
		return fmt.Errorf("h3: %w", err)
	}
	// alice runs H4 too — the large team-formation fixture, whose other hundred
	// participants have no Keycloak account and cannot log in.
	if err := h.seedH4(now, alice, bob, charles); err != nil {
		return fmt.Errorf("h4: %w", err)
	}

	return nil
}
