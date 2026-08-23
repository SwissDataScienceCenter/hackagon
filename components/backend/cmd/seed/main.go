package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"math/rand"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/project"
	_ "github.com/swissdatasciencecenter/hackagon/components/backend/ent/runtime"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/submission"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/team"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	entvote "github.com/swissdatasciencecenter/hackagon/components/backend/ent/vote"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/votecategory"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/logx"
	middleware "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
)

const (
	aliceKeycloakID   = "a4fd1574-6564-4290-a2a4-1f64eb1025ef" // organizer
	bobKeycloakID     = "1d091735-29c1-45bb-848d-1af7f53ef51e" // participant
	charlesKeycloakID = "bcb2768f-83e3-426b-be4d-238de8ee1e58" // waitlisted viewer
)

// sentinelHackathon is checked to make this script idempotent.
const sentinelHackathon = "AI Innovation Challenge 2026"

// capabilities mirrors the six booleans on HackathonState, which are the six
// values of entities.Capability. Every capability-gated handler refuses unless
// the matching casbin policy row exists, and SetCapabilities is what normally
// writes both. The seed builds rows directly, so it has to do both by hand —
// see seedCapabilities.
type capabilities struct {
	register           bool
	proposeProjects    bool
	teamPreferences    bool
	projectSubmissions bool
	vote               bool
	viewResults        bool
}

// seedCapabilities creates a hackathon's HackathonState row and the casbin
// policy rows that go with it.
//
// Without this, a seeded hackathon has no state row at all: `Get` reports no
// capabilities, and every capability-gated mutation refuses — SetPreference,
// RemovePreference, Propose, submissions. Creating the row alone is not enough,
// because the permission does not come from the row: HackathonService
// .SetCapabilities flips the boolean *and* writes a casbin policy, and the
// enforcer only ever reads the latter. Both writes, or the hackathon stays
// unusable.
//
// The role each capability grants to is copied from SetCapabilities
// (hackathon_service.go:616-653) so seeded hackathons behave like ones created
// through the API. Registration grants to `*` rather than a role, since the
// whole point is that a non-member can join.
//
// `currentPhase` is the phase an organizer has declared current, or nil for a
// hackathon sitting in none. It is display state only — SetCurrentPhase does not
// touch capabilities either, so nothing here depends on which phase it is.
func seedCapabilities(
	ctx context.Context,
	db *ent.Client,
	enf *middleware.Enforcer,
	h *ent.Hackathon,
	modifier *ent.User,
	caps capabilities,
	currentPhase *ent.Phase,
) error {
	state := db.HackathonState.Create().
		SetHackathonID(h.ID).
		SetModifier(modifier).
		SetRegistrationsEnabled(caps.register).
		SetProposeProjectsEnabled(caps.proposeProjects).
		SetSetTeamPreferencesEnabled(caps.teamPreferences).
		SetCreateProjectSubmissionsEnabled(caps.projectSubmissions).
		SetVotingEnabled(caps.vote).
		SetViewResultsEnabled(caps.viewResults)
	if currentPhase != nil {
		state = state.SetCurrentPhase(currentPhase)
	}
	if _, err := state.Save(ctx); err != nil {
		return fmt.Errorf("hackathon state for %q: %w", h.Name, err)
	}

	member := middleware.Member
	owner := middleware.Owner
	id := h.ID.String()

	type policy struct {
		on   bool
		what string
		role *middleware.Role
		obj  middleware.ObjectType
		perm middleware.Permission
		opts []middleware.EnforceOption
	}

	for _, p := range []policy{
		// Anyone, member or not — a caller who cannot yet join is exactly who
		// this is for.
		{caps.register, "register", nil, middleware.Hackathon, middleware.Join, nil},
		{caps.proposeProjects, "propose projects", &member, middleware.Project, middleware.Propose, nil},
		{caps.teamPreferences, "team preferences", &member, middleware.Project, middleware.Join, nil},
		// Ahead of SetCapabilities, which grants team preferences to Member
		// only. The casbin model has no role inheritance, so a hackathon owner
		// who wants to work on a project cannot express a preference — decided
		// to be wrong, and tracked in
		// mydocs/docs/backend-tickets/project-preferences-capability.md. Granted
		// here so the dev fixture shows the intended behaviour; drop this row if
		// you would rather the seed mirror the handler exactly.
		{caps.teamPreferences, "team preferences (owner)", &owner, middleware.Project, middleware.Join, nil},
		{caps.projectSubmissions, "project submissions", &member, middleware.Submission, middleware.Create, []middleware.EnforceOption{middleware.WithTeam("*")}},
		// Two rows, because SetCapabilities writes two. Vote:Create is the one
		// that sounds sufficient and is not: every category-facing handler —
		// ListVoteCategories, GetVoteCategory and SubmitVote itself — checks
		// VoteCategory:Read first, so without it a member cannot even see what
		// there is to vote on, and SubmitVote refuses before it looks at
		// Vote:Create at all.
		{caps.vote, "vote", &member, middleware.Vote, middleware.Create, nil},
		{caps.vote, "vote categories", &member, middleware.VoteCategory, middleware.Read, nil},
		{caps.viewResults, "view results", &member, middleware.VoteResult, middleware.Read, nil},
	} {
		if !p.on {
			continue
		}
		if err := enf.AddPolicy(p.role, id, p.obj, p.perm, p.opts...); err != nil {
			return fmt.Errorf("%s policy for %q: %w", p.what, h.Name, err)
		}
	}

	return nil
}

// The six capability tags a phase can carry, spelled as PhaseService stores them
// (capabilityToString, internal/service/phase_service.go:452). The column is a
// JSON array of raw strings with no enum behind it, so a typo would round-trip
// as an unknown capability rather than fail — hence constants.
const (
	capRegister    = "register"
	capPropose     = "propose_projects"
	capTeamPrefs   = "set_team_preferences"
	capSubmissions = "create_project_submissions"
	capVote        = "vote"
	capViewResults = "view_results"
)

// phaseSeed is one phase to create.
//
// `caps` are the capability tags the phase advertises. They are **descriptive
// only** — db/schema/phase.go:47 says so, and nothing reads them to gate
// anything. What participants may actually do comes from the HackathonState
// booleans and casbin rows that seedCapabilities writes, and the two are set
// independently on purpose. A phase tagged `vote` in a hackathon whose
// `voting_enabled` is false is a legitimate fixture: it says "this is when
// voting is meant to happen", not "voting is open".
//
// `capRegister` appears on exactly one phase, H4's "Registration". The other
// three hackathons run Ideation → build → judge, none of which is a sign-up
// window, so tagging any of their phases with it would misdescribe the data.
type phaseSeed struct {
	name, desc string
	start, end time.Time
	caps       []string
}

// seedPhases creates a hackathon's phases and returns them keyed by name, so the
// caller can nominate one as the current phase without re-querying.
func seedPhases(
	ctx context.Context,
	db *ent.Client,
	h *ent.Hackathon,
	author *ent.User,
	phases []phaseSeed,
) (map[string]*ent.Phase, error) {
	created := make(map[string]*ent.Phase, len(phases))
	for _, ph := range phases {
		p, err := db.Phase.Create().
			SetName(ph.name).
			SetDescription(ph.desc).
			SetStartsAt(ph.start).
			SetEndsAt(ph.end).
			SetCapabilities(ph.caps).
			SetHackathon(h).
			SetCreator(author).
			SetModifier(author).
			Save(ctx)
		if err != nil {
			return nil, fmt.Errorf("phase %q: %w", ph.name, err)
		}
		created[ph.name] = p
	}

	return created, nil
}

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

	exists, err := db.Hackathon.Query().Where(hackathon.NameEQ(sentinelHackathon)).Exist(ctx)
	if err != nil {
		logx.Fatal("check sentinel", "err", err)
	}
	if exists {
		slog.Info("seed data already present, skipping")

		return
	}

	enf, err := middleware.NewRBACEnforcer(cfg)
	if err != nil {
		logx.Fatal("create enforcer", "err", err)
	}

	// alice is a hackathon organizer globally (can create new hackathons).
	if _, err := enf.AddGlobalRole(aliceKeycloakID, middleware.HackathonOrganizer); err != nil {
		logx.Fatal("assign organizer role to alice", "err", err)
	}

	if err := seed(ctx, db, cfg, enf); err != nil {
		logx.Fatal("seed", "err", err)
	}
	slog.Info("seed complete")
}

func seed(ctx context.Context, db *ent.Client, cfg *config.Config, enf *middleware.Enforcer) error {
	return withTx(ctx, db, func(tx *ent.Tx) error {
		return seedInTx(ctx, tx.Client(), cfg, enf)
	})
}

// withTx runs fn inside a transaction, committing on success, rolling back on
// error, and also rolling back if fn panics (re-raising the panic afterwards).
func withTx(ctx context.Context, c *ent.Client, fn func(tx *ent.Tx) error) error {
	tx, err := c.Tx(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if v := recover(); v != nil {
			_ = tx.Rollback()
			panic(v)
		}
	}()
	if err := fn(tx); err != nil {
		if rerr := tx.Rollback(); rerr != nil {
			return fmt.Errorf("%w (rollback: %w)", err, rerr)
		}

		return err
	}

	return tx.Commit()
}

func seedInTx(
	ctx context.Context,
	db *ent.Client,
	cfg *config.Config,
	enf *middleware.Enforcer,
) error {
	// Users
	admin, err := getOrCreateUser(
		ctx,
		db,
		cfg.Server.AdminKeycloakID,
		"hackagon-admin",
		"Hackagon Admin",
		cfg.Server.AdminEmail,
	)
	if err != nil {
		return fmt.Errorf("admin: %w", err)
	}
	alice, err := getOrCreateUser(
		ctx,
		db,
		aliceKeycloakID,
		"alice",
		"Alice Wonderland",
		"alice@mail.com",
	)
	if err != nil {
		return fmt.Errorf("alice: %w", err)
	}
	bob, err := getOrCreateUser(ctx, db, bobKeycloakID, "bob", "Bob Henderson", "bob@mail.org")
	if err != nil {
		return fmt.Errorf("bob: %w", err)
	}
	charles, err := getOrCreateUser(
		ctx,
		db,
		charlesKeycloakID,
		"charles",
		"Charles Whitfield",
		"charles@mail.net",
	)
	if err != nil {
		return fmt.Errorf("charles: %w", err)
	}

	now := time.Now()

	// alice is the organizer of H1; she creates it and manages its content
	if err := seedH1(ctx, db, now, admin, alice, bob, charles, enf); err != nil {
		return fmt.Errorf("h1: %w", err)
	}
	// admin runs H2 and H3; charles does not participate in these
	if err := seedH2(ctx, db, now, admin, alice, bob, enf); err != nil {
		return fmt.Errorf("h2: %w", err)
	}
	if err := seedH3(ctx, db, now, admin, alice, enf); err != nil {
		return fmt.Errorf("h3: %w", err)
	}
	// alice runs H4 too — the large team-formation fixture, where the other
	// hundred participants exist only in Postgres and cannot log in.
	if err := seedH4(ctx, db, now, admin, alice, bob, charles, enf); err != nil {
		return fmt.Errorf("h4: %w", err)
	}

	return nil
}

// seedH1 seeds the upcoming public AI Innovation Challenge hackathon.
// alice acts as organizer (creator); charles is waitlisted.
func seedH1(
	ctx context.Context,
	db *ent.Client,
	now time.Time,
	admin, alice, bob, charles *ent.User,
	enf *middleware.Enforcer,
) error {
	h, err := db.Hackathon.Create().
		SetName(sentinelHackathon).
		SetVisibility(hackathon.VisibilityPublic).
		SetDescription("A 3-day hackathon focused on building AI-powered applications. Open to all skill levels.").
		SetStartsAt(now.AddDate(0, 0, 19)).
		SetEndsAt(now.AddDate(0, 0, 21)).
		SetCreator(alice).
		SetModifier(alice).
		// Ownership is stored twice and both halves have to be written. The
		// casbin `owner` role (granted further down) is what the enforcer reads
		// and what the participants list labels people by; this `owners` edge is
		// what RemoveOwner counts when it refuses to remove the last owner.
		// HackathonService.Create writes creator, casbin role and this edge, so
		// a seeded hackathon that skips it looks owned in the UI while the
		// backend believes it has no owners at all.
		AddOwners(alice).
		Save(ctx)
	if err != nil {
		return err
	}

	if _, err := seedPhases(ctx, db, h, alice, []phaseSeed{
		{
			"Ideation", "Define your project idea and form your team.",
			now.AddDate(0, 0, 19).Add(9 * time.Hour), now.AddDate(0, 0, 19).Add(18 * time.Hour),
			[]string{capPropose, capTeamPrefs},
		},
		{
			"Hacking", "Build your project. Mentors available throughout the day.",
			now.AddDate(0, 0, 20).Add(9 * time.Hour), now.AddDate(0, 0, 20).Add(21 * time.Hour),
			[]string{capSubmissions},
		},
		{
			"Judging", "Present your project to the judges. Top 3 teams win prizes.",
			now.AddDate(0, 0, 21).Add(10 * time.Hour), now.AddDate(0, 0, 21).Add(16 * time.Hour),
			[]string{capVote, capViewResults},
		},
	}); err != nil {
		return err
	}

	for i, pg := range []struct {
		title, content string
		visible        bool
	}{
		{
			"Welcome",
			"# Welcome to AI Innovation Challenge 2026\n\nJoin us for three days of hacking, learning, and building the future with AI. Whether you are an expert or just getting started, there is a track for you.",
			true,
		},
		{
			"Schedule",
			"## Day 1 – Ideation\n- 09:00 Opening ceremony\n- 10:00 Team formation\n- 14:00 Hacking begins\n\n## Day 2 – Hacking\n- All-day hacking with mentor office hours every 2 hours\n\n## Day 3 – Judging\n- 10:00 Submission deadline\n- 11:00 Presentations (5 min per team)\n- 15:00 Award ceremony",
			true,
		},
		{
			"Rules & Guidelines",
			"- Teams of 2–5 people\n- All code must be written during the hackathon\n- Use of open-source libraries is permitted\n- Submissions must include a working demo and a short write-up",
			false,
		},
	} {
		if _, err := db.Page.Create().
			SetTitle(pg.title).
			SetContent(pg.content).
			SetVisible(pg.visible).
			SetOrder(i + 1).
			SetHackathon(h).
			SetCreator(alice).
			SetModifier(alice).
			Save(ctx); err != nil {
			return fmt.Errorf("page %q: %w", pg.title, err)
		}
	}

	trackML, err := db.Track.Create().
		SetName("Machine Learning").
		SetDescription("Projects leveraging ML models, training pipelines, and deployment infrastructure.").
		SetHackathon(h).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("track ML: %w", err)
	}
	trackNLP, err := db.Track.Create().
		SetName("Natural Language Processing").
		SetDescription("Chatbots, summarization, translation, and other language-powered applications.").
		SetHackathon(h).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("track NLP: %w", err)
	}
	trackCV, err := db.Track.Create().
		SetName("Computer Vision").
		SetDescription("Image recognition, object detection, video analysis, and visual AI applications.").
		SetHackathon(h).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("track CV: %w", err)
	}

	projAutoML, err := db.Project.Create().
		SetTitle("AutoML Pipeline Builder").
		SetDescription("A no-code platform that automatically selects and trains the best ML model for a given dataset, with one-click deployment.").
		SetStatus(project.StatusApproved).
		SetTrack(trackML).
		SetHackathon(h).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("project AutoML: %w", err)
	}
	if _, err := enf.AddRole(alice.KeycloakID, middleware.Owner, h.ID.String(), middleware.WithProject(projAutoML.ID.String())); err != nil {
		return fmt.Errorf("assign AutoML owner: %w", err)
	}
	projFederated, err := db.Project.Create().
		SetTitle("Federated Learning Framework").
		SetDescription("Privacy-preserving ML training across distributed data sources without ever sharing raw data with a central server.").
		SetStatus(project.StatusProposed).
		SetTrack(trackML).
		SetHackathon(h).
		SetCreator(bob).
		SetModifier(bob).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("project Federated: %w", err)
	}
	if _, err := enf.AddRole(bob.KeycloakID, middleware.Owner, h.ID.String(), middleware.WithProject(projFederated.ID.String())); err != nil {
		return fmt.Errorf("assign Federated owner: %w", err)
	}
	projChatbot, err := db.Project.Create().
		SetTitle("Multilingual Chatbot").
		SetDescription("A customer support chatbot that handles queries in 12 languages using a fine-tuned LLM, with automatic language detection.").
		SetStatus(project.StatusApproved).
		SetTrack(trackNLP).
		SetHackathon(h).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("project Chatbot: %w", err)
	}
	if _, err := enf.AddRole(alice.KeycloakID, middleware.Owner, h.ID.String(), middleware.WithProject(projChatbot.ID.String())); err != nil {
		return fmt.Errorf("assign Chatbot owner: %w", err)
	}
	projDocSum, err := db.Project.Create().
		SetTitle("Document Summarizer").
		SetDescription("Automatic abstractive summarization of legal and scientific documents using transformer models, with citation tracking.").
		SetStatus(project.StatusProposed).
		SetTrack(trackNLP).
		SetHackathon(h).
		SetCreator(bob).
		SetModifier(bob).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("project DocSummarizer: %w", err)
	}
	if _, err := enf.AddRole(bob.KeycloakID, middleware.Owner, h.ID.String(), middleware.WithProject(projDocSum.ID.String())); err != nil {
		return fmt.Errorf("assign DocSummarizer owner: %w", err)
	}
	projObjectDet, err := db.Project.Create().
		SetTitle("Real-time Object Detection").
		SetDescription("Edge-deployed object detection for retail shelf monitoring, running on low-power ARM hardware with under 50 ms latency.").
		SetStatus(project.StatusApproved).
		SetTrack(trackCV).
		SetHackathon(h).
		SetCreator(bob).
		SetModifier(admin).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("project ObjectDetection: %w", err)
	}
	if _, err := enf.AddRole(bob.KeycloakID, middleware.Owner, h.ID.String(), middleware.WithProject(projObjectDet.ID.String())); err != nil {
		return fmt.Errorf("assign ObjectDetection owner: %w", err)
	}

	// alice (organizer) and bob confirmed; charles waitlisted; admin also confirmed
	for _, p := range []struct {
		u         *ent.User
		isWaiting bool
	}{
		{admin, false},
		{alice, false},
		{bob, false},
		{charles, true},
	} {
		if _, err := db.Participant.Create().
			SetHackathon(h).
			SetUser(p.u).
			SetIsWaiting(p.isWaiting).
			Save(ctx); err != nil {
			return fmt.Errorf("participant %s: %w", p.u.Username, err)
		}
	}

	// Teams
	teamAlpha, err := db.Team.Create().
		SetName("Team Alpha").
		SetDescription("Building the AutoML Pipeline Builder").
		SetProject(projAutoML).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("team Alpha: %w", err)
	}
	for _, u := range []*ent.User{alice, admin} {
		if _, err := db.TeamParticipant.Create().SetTeam(teamAlpha).SetUser(u).Save(ctx); err != nil {
			return fmt.Errorf("team Alpha member %s: %w", u.Username, err)
		}
		if _, err := enf.AddRole(u.KeycloakID, middleware.Member, h.ID.String(), middleware.WithTeam(teamAlpha.ID.String())); err != nil {
			return fmt.Errorf("assign Alpha member %s: %w", u.Username, err)
		}
	}

	teamBeta, err := db.Team.Create().
		SetName("Team Beta").
		SetDescription("Working on the Multilingual Chatbot").
		SetProject(projChatbot).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("team Beta: %w", err)
	}
	// bob, not alice. Nobody in this fixture belongs to two teams: a person
	// works on one project, and alice already has Team Alpha. It also sharpens
	// the cross-team read case — bob is a plain Member of Team Beta with no
	// policy row matching Team Alpha's domain, where alice's hackathon-wide
	// Owner made every such read succeed for the wrong reason.
	// See mydocs/docs/backend-tickets/submission-cross-team-read.md.
	if _, err := db.TeamParticipant.Create().SetTeam(teamBeta).SetUser(bob).Save(ctx); err != nil {
		return fmt.Errorf("team Beta member bob: %w", err)
	}
	if _, err := enf.AddRole(bob.KeycloakID, middleware.Member, h.ID.String(), middleware.WithTeam(teamBeta.ID.String())); err != nil {
		return fmt.Errorf("assign Beta member bob: %w", err)
	}

	// Submissions for team Alpha: draft v1, then final v2
	if _, err := db.Submission.Create().
		SetVersion(1).
		SetStatus(submission.StatusDraft).
		SetTeam(teamAlpha).
		SetProject(projAutoML).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx); err != nil {
		return fmt.Errorf("submission Alpha v1: %w", err)
	}
	result := "https://github.com/team-alpha/automl-pipeline"
	if _, err := db.Submission.Create().
		SetVersion(2).
		SetStatus(submission.StatusFinal).
		SetResult(result).
		SetTeam(teamAlpha).
		SetProject(projAutoML).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx); err != nil {
		return fmt.Errorf("submission Alpha v2: %w", err)
	}

	for _, ra := range []struct {
		id   string
		role middleware.Role
	}{
		// Alice owns this hackathon and also takes part in it. Both rows are
		// needed, not one: the casbin model has no role inheritance, so Owner
		// does not imply Member, and every capability seedCapabilities grants
		// above is granted to Member. Owner alone leaves her able to administer
		// the hackathon but unable to vote, propose or set a preference in it —
		// which reads as a broken role assignment rather than a deliberate one.
		{alice.KeycloakID, middleware.Owner},
		{alice.KeycloakID, middleware.Member},
		{admin.KeycloakID, middleware.Member},
		{bob.KeycloakID, middleware.Member},
	} {
		if _, err := enf.AddRole(ra.id, ra.role, h.ID.String()); err != nil {
			return fmt.Errorf("assign role %s to %s in h1: %w", ra.role, ra.id, err)
		}
	}

	// Upcoming: sign-ups are open, ideas are being proposed, and participants say
	// which project they would like to work on — all of which happen before the
	// doors open. Submissions stay shut until there is something to submit;
	// voting and results until it is over.
	//
	// Submissions are enabled anyway because the fixture already contains team
	// Alpha's two submissions, and a capability that contradicts the data on
	// screen is more confusing than one that is early.
	//
	// No current phase: the doors have not opened, so the hackathon is not "in"
	// any of its three phases yet. The one fixture that exercises an empty
	// `current_phase_id`.
	if err := seedCapabilities(ctx, db, enf, h, alice, capabilities{
		register:           true,
		proposeProjects:    true,
		teamPreferences:    true,
		projectSubmissions: true,
		vote:               false,
		viewResults:        false,
	}, nil); err != nil {
		return err
	}

	return nil
}

// seedH2 seeds the ongoing public Climate Tech hackathon.
func seedH2(
	ctx context.Context,
	db *ent.Client,
	now time.Time,
	admin, alice, bob *ent.User,
	enf *middleware.Enforcer,
) error {
	h, err := db.Hackathon.Create().
		SetName("Climate Tech Hackathon 2026").
		SetVisibility(hackathon.VisibilityPublic).
		SetDescription("Build solutions to address climate change through technology. Focus on energy, agriculture, and sustainability.").
		SetStartsAt(now.AddDate(0, 0, -2)).
		SetEndsAt(now.AddDate(0, 0, 2)).
		SetCreator(admin).
		SetModifier(admin).
		// See H1 — the `owners` edge is the half RemoveOwner counts.
		AddOwners(admin).
		Save(ctx)
	if err != nil {
		return err
	}

	phases, err := seedPhases(ctx, db, h, admin, []phaseSeed{
		{
			"Ideation", "Research the problem space and define your approach.",
			now.AddDate(0, 0, -2), now.AddDate(0, 0, -1),
			[]string{capPropose, capTeamPrefs},
		},
		{
			"Hacking", "Build your climate tech solution with support from domain experts.",
			now.AddDate(0, 0, 0), now.AddDate(0, 0, 1),
			[]string{capSubmissions},
		},
		{
			"Judging", "Demo day: present your solution to a panel of sustainability experts.",
			now.AddDate(0, 0, 2).Add(9 * time.Hour), now.AddDate(0, 0, 2).Add(17 * time.Hour),
			[]string{capVote, capViewResults},
		},
	})
	if err != nil {
		return err
	}

	for i, pg := range []struct {
		title, content string
		visible        bool
	}{
		{
			"About",
			"# Climate Tech Hackathon 2026\n\nJoin engineers, scientists, and designers to build technology that addresses the climate crisis. All projects must have a measurable environmental impact.",
			true,
		},
		{
			"Judging Criteria",
			"## How we evaluate projects\n\n1. **Impact** (40%) – How significant is the environmental benefit?\n2. **Feasibility** (30%) – Can this be implemented and scaled?\n3. **Innovation** (30%) – Is the approach novel or significantly better than existing solutions?",
			true,
		},
		{
			"Resources",
			"## Useful datasets and APIs\n\n- [IPCC Data Portal](https://data.ipcc.ch)\n- [Open Power System Data](https://open-power-system-data.org)\n- [Copernicus Climate Data Store](https://cds.climate.copernicus.eu)\n- [Global Forest Watch API](https://www.globalforestwatch.org/help/developers/)",
			true,
		},
	} {
		if _, err := db.Page.Create().
			SetTitle(pg.title).
			SetContent(pg.content).
			SetVisible(pg.visible).
			SetOrder(i + 1).
			SetHackathon(h).
			SetCreator(admin).
			SetModifier(admin).
			Save(ctx); err != nil {
			return fmt.Errorf("page %q: %w", pg.title, err)
		}
	}

	trackEnergy, err := db.Track.Create().
		SetName("Energy").
		SetDescription("Renewable energy generation, smart grids, energy efficiency, and storage solutions.").
		SetHackathon(h).
		SetCreator(admin).
		SetModifier(admin).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("track Energy: %w", err)
	}
	trackAgri, err := db.Track.Create().
		SetName("Agriculture & Food").
		SetDescription("Sustainable farming, food waste reduction, supply chain transparency, and soil health monitoring.").
		SetHackathon(h).
		SetCreator(admin).
		SetModifier(admin).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("track AgriFood: %w", err)
	}

	projSolar, err := db.Project.Create().
		SetTitle("Solar Panel Optimizer").
		SetDescription("ML-based system that maximises solar panel output by predicting optimal tilt angles based on hyperlocal weather forecasts.").
		SetStatus(project.StatusApproved).
		SetTrack(trackEnergy).
		SetHackathon(h).
		SetCreator(bob).
		SetModifier(bob).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("project Solar: %w", err)
	}
	if _, err := enf.AddRole(bob.KeycloakID, middleware.Owner, h.ID.String(), middleware.WithProject(projSolar.ID.String())); err != nil {
		return fmt.Errorf("assign Solar owner: %w", err)
	}
	projSmartGrid, err := db.Project.Create().
		SetTitle("Smart Grid Monitor").
		SetDescription("Real-time dashboard for detecting grid imbalances and automating load shedding decisions using time-series anomaly detection.").
		SetStatus(project.StatusProposed).
		SetTrack(trackEnergy).
		SetHackathon(h).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("project SmartGrid: %w", err)
	}
	if _, err := enf.AddRole(alice.KeycloakID, middleware.Owner, h.ID.String(), middleware.WithProject(projSmartGrid.ID.String())); err != nil {
		return fmt.Errorf("assign SmartGrid owner: %w", err)
	}
	projCropDisease, err := db.Project.Create().
		SetTitle("Crop Disease Detector").
		SetDescription("Mobile app using computer vision to identify crop diseases from field photos, providing treatment recommendations and outbreak tracking.").
		SetStatus(project.StatusApproved).
		SetTrack(trackAgri).
		SetHackathon(h).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("project CropDisease: %w", err)
	}
	if _, err := enf.AddRole(alice.KeycloakID, middleware.Owner, h.ID.String(), middleware.WithProject(projCropDisease.ID.String())); err != nil {
		return fmt.Errorf("assign CropDisease owner: %w", err)
	}

	// Participants: all three confirmed
	for _, u := range []*ent.User{admin, alice, bob} {
		if _, err := db.Participant.Create().
			SetHackathon(h).
			SetUser(u).
			SetIsWaiting(false).
			Save(ctx); err != nil {
			return fmt.Errorf("participant %s: %w", u.Username, err)
		}
	}

	teamGamma, err := db.Team.Create().
		SetName("Team Gamma").
		SetDescription("Optimizing solar panel performance with ML").
		SetProject(projSolar).
		SetCreator(bob).
		SetModifier(bob).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("team Gamma: %w", err)
	}
	for _, u := range []*ent.User{bob, admin} {
		if _, err := db.TeamParticipant.Create().SetTeam(teamGamma).SetUser(u).Save(ctx); err != nil {
			return fmt.Errorf("team Gamma member %s: %w", u.Username, err)
		}
		if _, err := enf.AddRole(u.KeycloakID, middleware.Member, h.ID.String(), middleware.WithTeam(teamGamma.ID.String())); err != nil {
			return fmt.Errorf("assign Gamma member %s: %w", u.Username, err)
		}
	}

	result := "https://github.com/team-gamma/solar-optimizer"
	if _, err := db.Submission.Create().
		SetVersion(1).
		SetStatus(submission.StatusFinal).
		SetResult(result).
		SetTeam(teamGamma).
		SetProject(projSolar).
		SetCreator(bob).
		SetModifier(bob).
		Save(ctx); err != nil {
		return fmt.Errorf("submission Gamma v1: %w", err)
	}

	for _, ra := range []struct {
		id   string
		role middleware.Role
	}{
		{admin.KeycloakID, middleware.Owner},
		{alice.KeycloakID, middleware.Member},
		{bob.KeycloakID, middleware.Member},
	} {
		if _, err := enf.AddRole(ra.id, ra.role, h.ID.String()); err != nil {
			return fmt.Errorf("assign role %s to %s in h2: %w", ra.role, ra.id, err)
		}
	}

	// Ongoing: everything a running hackathon needs open. Registration is shut,
	// since this one started two days ago — H1 is where joining is testable.
	// Voting and results wait for the judging phase.
	//
	// This is the hackathon to test preferences in: admin owns it, and alice and
	// bob are both confirmed members.
	//
	// Current phase is Hacking, which is also the phase today's date falls in — so
	// the declared phase and the one derived from dates agree here. They are
	// separate mechanisms and can disagree; H3 is where that shows.
	if err := seedCapabilities(ctx, db, enf, h, admin, capabilities{
		register:           false,
		proposeProjects:    true,
		teamPreferences:    true,
		projectSubmissions: true,
		vote:               false,
		viewResults:        false,
	}, phases["Hacking"]); err != nil {
		return err
	}

	return nil
}

// seedH3 seeds the past private Internal Product Sprint hackathon.
func seedH3(
	ctx context.Context,
	db *ent.Client,
	now time.Time,
	admin, alice *ent.User,
	enf *middleware.Enforcer,
) error {
	h, err := db.Hackathon.Create().
		SetName("Internal Product Sprint").
		SetVisibility(hackathon.VisibilityPrivate).
		SetDescription("An internal sprint to improve developer tooling and data infrastructure.").
		SetStartsAt(now.AddDate(0, -1, -20)).
		SetEndsAt(now.AddDate(0, -1, -18)).
		SetCreator(admin).
		SetModifier(admin).
		// See H1 — the `owners` edge is the half RemoveOwner counts.
		AddOwners(admin).
		Save(ctx)
	if err != nil {
		return err
	}

	phases, err := seedPhases(ctx, db, h, admin, []phaseSeed{
		{
			"Ideation", "Identify pain points in the current developer workflow and scope your proposal.",
			now.AddDate(0, -1, -20).Add(9 * time.Hour), now.AddDate(0, -1, -20).Add(18 * time.Hour),
			[]string{capPropose, capTeamPrefs},
		},
		{
			"Building", "Implement your improvement prototype.",
			now.AddDate(0, -1, -19).Add(9 * time.Hour), now.AddDate(0, -1, -19).Add(21 * time.Hour),
			[]string{capSubmissions},
		},
		{
			"Demo", "Present your prototype and gather feedback from the team.",
			now.AddDate(0, -1, -18).
				Add(10 * time.Hour),
			now.AddDate(0, -1, -18).Add(16 * time.Hour),
			[]string{capVote, capViewResults},
		},
	})
	if err != nil {
		return err
	}

	for i, pg := range []struct {
		title, content string
		visible        bool
	}{
		{
			"Overview",
			"# Internal Product Sprint\n\nA focused 3-day sprint to improve developer experience and data infrastructure. Small teams, big impact.",
			true,
		},
		{
			"Technical Specs",
			"## Our Stack\n\n- **Backend**: Go + gRPC + Ent ORM\n- **Frontend**: SvelteKit\n- **Database**: PostgreSQL\n- **Auth**: Keycloak (OIDC)\n- **Infra**: Nix + process-compose",
			true,
		},
		{
			"Timeline",
			"**Day 1** – Problem definition and scoping\n**Day 2** – Implementation\n**Day 3** – Demo + retrospective\n\nAll outputs should be committed to the monorepo before the demo.",
			true,
		},
	} {
		if _, err := db.Page.Create().
			SetTitle(pg.title).
			SetContent(pg.content).
			SetVisible(pg.visible).
			SetOrder(i + 1).
			SetHackathon(h).
			SetCreator(admin).
			SetModifier(admin).
			Save(ctx); err != nil {
			return fmt.Errorf("page %q: %w", pg.title, err)
		}
	}

	trackDevTools, err := db.Track.Create().
		SetName("Developer Tools").
		SetDescription("CLI tools, IDE plugins, testing frameworks, and workflow automation.").
		SetHackathon(h).
		SetCreator(admin).
		SetModifier(admin).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("track DevTools: %w", err)
	}
	trackData, err := db.Track.Create().
		SetName("Data Platform").
		SetDescription("Data pipelines, observability, schema management, and analytics infrastructure.").
		SetHackathon(h).
		SetCreator(admin).
		SetModifier(admin).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("track Data: %w", err)
	}

	projCLI, err := db.Project.Create().
		SetTitle("CLI Code Generator").
		SetDescription("A command-line tool that scaffolds new microservices from a YAML spec, generating proto definitions, ent schemas, and CI configuration automatically.").
		SetStatus(project.StatusApproved).
		SetTrack(trackDevTools).
		SetHackathon(h).
		SetCreator(admin).
		SetModifier(admin).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("project CLI: %w", err)
	}
	if _, err := enf.AddRole(admin.KeycloakID, middleware.Owner, h.ID.String(), middleware.WithProject(projCLI.ID.String())); err != nil {
		return fmt.Errorf("assign CLI owner: %w", err)
	}
	projTestCoverage, err := db.Project.Create().
		SetTitle("Test Coverage Dashboard").
		SetDescription("A web dashboard that tracks test coverage trends across all repositories over time and surfaces regressions directly in CI checks.").
		SetStatus(project.StatusProposed).
		SetTrack(trackDevTools).
		SetHackathon(h).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("project TestCoverage: %w", err)
	}
	if _, err := enf.AddRole(alice.KeycloakID, middleware.Owner, h.ID.String(), middleware.WithProject(projTestCoverage.ID.String())); err != nil {
		return fmt.Errorf("assign TestCoverage owner: %w", err)
	}
	projPipelineViz, err := db.Project.Create().
		SetTitle("Data Pipeline Visualizer").
		SetDescription("Interactive graph visualization of data pipeline dependencies with live execution status, SLA tracking, and error highlighting.").
		SetStatus(project.StatusApproved).
		SetTrack(trackData).
		SetHackathon(h).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("project PipelineViz: %w", err)
	}
	if _, err := enf.AddRole(alice.KeycloakID, middleware.Owner, h.ID.String(), middleware.WithProject(projPipelineViz.ID.String())); err != nil {
		return fmt.Errorf("assign PipelineViz owner: %w", err)
	}

	// Participants: admin + alice confirmed
	for _, u := range []*ent.User{admin, alice} {
		if _, err := db.Participant.Create().
			SetHackathon(h).
			SetUser(u).
			SetIsWaiting(false).
			Save(ctx); err != nil {
			return fmt.Errorf("participant %s: %w", u.Username, err)
		}
	}

	teamDelta, err := db.Team.Create().
		SetName("Team Delta").
		SetDescription("Building the CLI Code Generator").
		SetProject(projCLI).
		SetCreator(admin).
		SetModifier(admin).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("team Delta: %w", err)
	}
	// One member each, and deliberately not the same person as Team Epsilon.
	// SubmitVote refuses a vote on a submission by a team you belong to
	// (vote_service.go, submitSingleVote), so putting both participants in both
	// teams — which is what this fixture used to do — leaves H3 with voting
	// enabled and nobody able to cast a single vote, in the one hackathon where
	// voting is testable at all. Split one apiece and each can vote for the
	// other, which is also what the two seeded votes below record.
	for _, u := range []*ent.User{alice} {
		if _, err := db.TeamParticipant.Create().SetTeam(teamDelta).SetUser(u).Save(ctx); err != nil {
			return fmt.Errorf("team Delta member %s: %w", u.Username, err)
		}
		if _, err := enf.AddRole(u.KeycloakID, middleware.Member, h.ID.String(), middleware.WithTeam(teamDelta.ID.String())); err != nil {
			return fmt.Errorf("assign Delta member %s: %w", u.Username, err)
		}
	}

	if _, err := db.Submission.Create().
		SetVersion(1).
		SetStatus(submission.StatusDraft).
		SetTeam(teamDelta).
		SetProject(projCLI).
		// alice, because she is the one on Team Delta now.
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx); err != nil {
		return fmt.Errorf("submission Delta v1: %w", err)
	}
	result := "https://github.com/internal/cli-code-gen"
	if _, err := db.Submission.Create().
		SetVersion(2).
		SetStatus(submission.StatusFinal).
		SetResult(result).
		SetTeam(teamDelta).
		SetProject(projCLI).
		SetCreator(alice).
		SetModifier(alice).
		Save(ctx); err != nil {
		return fmt.Errorf("submission Delta v2: %w", err)
	}

	// Team Epsilon for projPipelineViz (a second submission for voting demo)
	teamEpsilon, err := db.Team.Create().
		SetName("Team Epsilon").
		SetDescription("Building the Data Pipeline Visualizer").
		SetProject(projPipelineViz).
		SetCreator(admin).
		SetModifier(admin).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("team Epsilon: %w", err)
	}
	// admin, not alice — see Team Delta above.
	for _, u := range []*ent.User{admin} {
		if _, err := db.TeamParticipant.Create().SetTeam(teamEpsilon).SetUser(u).Save(ctx); err != nil {
			return fmt.Errorf("team Epsilon member %s: %w", u.Username, err)
		}
		if _, err := enf.AddRole(u.KeycloakID, middleware.Member, h.ID.String(), middleware.WithTeam(teamEpsilon.ID.String())); err != nil {
			return fmt.Errorf("assign Epsilon member %s: %w", u.Username, err)
		}
	}
	pipelineResult := "https://github.com/internal/data-pipeline-viz"
	if _, err := db.Submission.Create().
		SetVersion(1).
		SetStatus(submission.StatusFinal).
		SetResult(pipelineResult).
		SetTeam(teamEpsilon).
		SetProject(projPipelineViz).
		SetCreator(admin).
		SetModifier(admin).
		Save(ctx); err != nil {
		return fmt.Errorf("submission Epsilon v1: %w", err)
	}

	// Vote category and results — "Best Project" single-choice vote
	voteCat, err := db.VoteCategory.Create().
		SetName("Best Project").
		SetDescription("Vote for the project you found most interesting or useful.").
		SetVotingMethod(votecategory.VotingMethodSingleChoice).
		SetVoterType(votecategory.VoterTypeAllParticipants).
		SetHackathon(h).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("vote category Best Project: %w", err)
	}

	// admin votes for CLI Code Generator, alice votes for Data Pipeline
	// Visualizer — each for the team they are *not* on, which is the only kind
	// of vote SubmitVote would accept. Written through ent rather than the
	// handler, so nothing enforces that here; keep it true by hand.
	subDelta, err := db.Submission.Query().
		Where(submission.HasTeamWith(team.IDEQ(teamDelta.ID))).
		Order(ent.Desc(submission.FieldVersion)).
		First(ctx)
	if err != nil {
		return fmt.Errorf("query Delta submission: %w", err)
	}
	subEpsilon, err := db.Submission.Query().
		Where(submission.HasTeamWith(team.IDEQ(teamEpsilon.ID))).
		Order(ent.Desc(submission.FieldVersion)).
		First(ctx)
	if err != nil {
		return fmt.Errorf("query Epsilon submission: %w", err)
	}

	// admin → CLI Code Generator
	if _, err := db.Vote.Create().
		SetCategory(voteCat).
		SetVoter(admin).
		SetSubmission(subDelta).
		SetVoteType(entvote.VoteTypeSingleChoice).
		Save(ctx); err != nil {
		return fmt.Errorf("vote admin: %w", err)
	}
	// alice → Data Pipeline Visualizer
	if _, err := db.Vote.Create().
		SetCategory(voteCat).
		SetVoter(alice).
		SetSubmission(subEpsilon).
		SetVoteType(entvote.VoteTypeSingleChoice).
		Save(ctx); err != nil {
		return fmt.Errorf("vote alice: %w", err)
	}

	// Vote results: CLI Code Generator tied for 1st (1 vote from admin), Data Pipeline tied for 1st (1 vote from alice)
	_, err = db.VoteResult.Create().
		SetVoteCategoryID(voteCat.ID).
		SetSubmission(subDelta).
		SetPosition(1).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("vote result CLI: %w", err)
	}
	_, err = db.VoteResult.Create().
		SetVoteCategoryID(voteCat.ID).
		SetSubmission(subEpsilon).
		SetPosition(1).
		Save(ctx)
	if err != nil {
		return fmt.Errorf("vote result PipelineViz: %w", err)
	}

	for _, ra := range []struct {
		id   string
		role middleware.Role
	}{
		{admin.KeycloakID, middleware.Owner},
		{alice.KeycloakID, middleware.Member},
	} {
		if _, err := enf.AddRole(ra.id, ra.role, h.ID.String()); err != nil {
			return fmt.Errorf("assign role %s to %s in h3: %w", ra.role, ra.id, err)
		}
	}

	// Over a month past: nothing left to do but look at what happened. Results
	// only — this is the fixture for a hackathon where every write is refused
	// because the event has ended, not because anything is misconfigured.
	//
	// Current phase stays on Demo, the last one it reached. Every phase is in the
	// past, so a date-derived reading calls them all "completed" while the declared
	// phase still names one — the case that shows the two are different mechanisms.
	if err := seedCapabilities(ctx, db, enf, h, admin, capabilities{
		register:           false,
		proposeProjects:    false,
		teamPreferences:    false,
		projectSubmissions: false,
		vote:               true,
		viewResults:        true,
	}, phases["Demo"]); err != nil {
		return err
	}

	return nil
}

// dataForGoodParticipants is how many synthetic participants seedH4 creates.
//
// They exist in Postgres only — there is no matching Keycloak account, so none
// of them can log in, and that is the point: they are bulk, not actors. The
// four dev users take part in the same hackathon so there is always somebody
// you can actually sign in as to look at what the bulk produced.
const dataForGoodParticipants = 100

// dataForGoodSeed fixes the PRNG that shapes the preference distribution.
// Everything else in this file is deterministic; re-running the seed must not
// quietly produce a different fixture, so the randomness comes from a constant
// and never from the clock.
const dataForGoodSeed = 20260421

// dfgProject is one of the fifteen project ideas seedH4 proposes.
//
// `weight` is how strongly a synthetic participant is drawn to it, and the
// spread is the whole reason this fixture exists: a team-formation algorithm
// run against an even distribution is not being exercised at all. Three
// projects are heavily oversubscribed, three attract almost nobody, and the
// rest sit in between — so the fixture contains both the project that needs
// splitting into two teams and the one that will never reach quorum.
type dfgProject struct {
	title, desc string
	weight      int
}

// pickPreferences draws n distinct project indices, weighted, without
// replacement. rng is seeded from dataForGoodSeed, so the same fixture comes
// out of every run.
func pickPreferences(rng *rand.Rand, weights []int, n int) []int {
	remaining := make([]int, len(weights))
	copy(remaining, weights)

	total := 0
	for _, w := range remaining {
		total += w
	}

	picked := make([]int, 0, n)
	for len(picked) < n && total > 0 {
		r := rng.Intn(total)
		for i, w := range remaining {
			if w == 0 {
				continue
			}
			if r < w {
				picked = append(picked, i)
				total -= w
				remaining[i] = 0

				break
			}
			r -= w
		}
	}

	return picked
}

// seedH4 seeds the Data for Good Hackathon: the large fixture, and the only one
// sitting in team formation.
//
// Registration has closed, a hundred people are confirmed in, fifteen projects
// are on the table and everybody has said which ones they would like to work
// on — and no team exists yet. That is the input a team-assignment algorithm
// takes, and none of the other three hackathons provide it: H1 and H2 have
// their teams pre-baked, H3 is over.
//
// Deliberately absent, do not "fix":
//
//   - No teams and no submissions. The state being modelled is the moment
//     before teams exist.
//   - The hundred synthetic users hold `Member` and nothing else. No hackathon
//     `Owner`, no project-scoped `Owner` — they are participants, and an
//     organizer view that looks wrong at a hundred owners is not the thing
//     being tested here.
//   - alice owns this one and holds no participant row in it. She proposes ten
//     of the fifteen projects as the organizer and names no preferences of her
//     own, because she is not after a team. H1-H3 all have their owner
//     participating as well, so this is the only fixture for an organizer who
//     sits their own hackathon out.
//   - `register` is off. Sign-up closed three days ago; this is the fixture
//     where `Join` is refused because the window shut, not because the
//     hackathon is misconfigured.
//   - No tracks. Every project here carries none, because this is the fixture
//     for a hackathon that runs without them — the shape the first client
//     needs. H1-H3 keep their tracks, so both shapes stay covered.
func seedH4(
	ctx context.Context,
	db *ent.Client,
	now time.Time,
	admin, alice, bob, charles *ent.User,
	enf *middleware.Enforcer,
) error {
	h, err := db.Hackathon.Create().
		SetName("Data for Good Hackathon 2026").
		SetVisibility(hackathon.VisibilityPublic).
		SetDescription("A week-long hackathon putting open data to work on public-interest problems. Registration is closed; teams are being formed from participants' project preferences.").
		SetStartsAt(now.AddDate(0, 0, 5)).
		SetEndsAt(now.AddDate(0, 0, 8)).
		SetCreator(alice).
		SetModifier(alice).
		// See H1 — the `owners` edge is the half RemoveOwner counts.
		AddOwners(alice).
		Save(ctx)
	if err != nil {
		return err
	}

	phases, err := seedPhases(ctx, db, h, alice, []phaseSeed{
		{
			"Registration", "Sign up and tell us which projects interest you.",
			now.AddDate(0, 0, -21), now.AddDate(0, 0, -3),
			[]string{capRegister},
		},
		{
			"Team Formation", "Organizers group participants into teams based on the preferences they expressed.",
			now.AddDate(0, 0, -3), now.AddDate(0, 0, 4),
			[]string{capPropose, capTeamPrefs},
		},
		{
			"Hacking", "Build your project with your new team.",
			now.AddDate(0, 0, 5).Add(9 * time.Hour), now.AddDate(0, 0, 7).Add(18 * time.Hour),
			[]string{capSubmissions},
		},
		{
			"Demo", "Show what you built and vote on the others.",
			now.AddDate(0, 0, 8).Add(10 * time.Hour), now.AddDate(0, 0, 8).Add(17 * time.Hour),
			[]string{capVote, capViewResults},
		},
	})
	if err != nil {
		return err
	}

	for i, pg := range []struct {
		title, content string
		visible        bool
	}{
		{
			"About",
			"# Data for Good Hackathon 2026\n\nOne week, fifteen projects, and a hundred participants working with open data on problems that matter: public health, education, and civic transparency.\n\nRegistration has closed. We are now forming teams from the project preferences you gave us.",
			true,
		},
		{
			"How teams are formed",
			"## From preferences to teams\n\nEveryone picked between one and four projects they would like to work on. Organizers now assign each participant to exactly **one** team, weighing:\n\n1. Your stated preferences, highest first\n2. Team size — we aim for 4–6 people per project\n3. A spread of skills within each team\n\nProjects that nobody picked will not run. Projects that everybody picked may be split into two teams.",
			true,
		},
		{
			"Code of Conduct",
			"Be decent to each other. Harassment of any kind ends your participation immediately. Report concerns to any organizer.",
			true,
		},
	} {
		if _, err := db.Page.Create().
			SetTitle(pg.title).
			SetContent(pg.content).
			SetVisible(pg.visible).
			SetOrder(i + 1).
			SetHackathon(h).
			SetCreator(alice).
			SetModifier(alice).
			Save(ctx); err != nil {
			return fmt.Errorf("page %q: %w", pg.title, err)
		}
	}

	// Fifteen ideas. The weights are the fixture: 12, 11 and 10 are the three
	// everyone wants, 1 apiece are the three nobody does. The blank lines group
	// them by theme and mean nothing to the fixture — this hackathon has no
	// tracks, and the order projects are created in is not significant.
	specs := []dfgProject{
		{
			"Outbreak Early Warning",
			"Fuse wastewater sampling, pharmacy sales and clinic visits into a signal that flags a local outbreak days before case counts do.",
			12,
		},
		{
			"Vaccine Desert Mapper",
			"Map travel time to the nearest vaccination site by public transport, and rank neighbourhoods by how badly they are served.",
			6,
		},
		{
			"Clinical Trial Matcher",
			"Plain-language search that matches a patient's condition and location to trials currently recruiting.",
			4,
		},
		{
			"Air Quality & Asthma",
			"Correlate street-level air quality readings with paediatric asthma admissions and publish the per-school picture.",
			3,
		},
		{
			"Ambulance Response Equity",
			"Analyse response times by district and income band; a small dashboard for the health authority.",
			1,
		},

		{
			"Open Textbook Search",
			"One search across every openly licensed textbook, filtered by curriculum, reading level and language.",
			11,
		},
		{
			"Dropout Early Signal",
			"A model over attendance and grade trajectories that flags students at risk while there is still time to act.",
			7,
		},
		{
			"School Meal Coverage",
			"Show which schools have meal programmes, which qualify but have none, and what the gap costs.",
			5,
		},
		{
			"Sign Language Tutor",
			"Webcam-based practice tool that gives immediate feedback on fingerspelling.",
			3,
		},
		{
			"Classroom Energy Audit",
			"Cheap sensor kit plus a report template so a class can audit its own building.",
			1,
		},

		{
			"Open Budget Explorer",
			"Make a municipal budget legible: where the money goes, how it changed, and who decided.",
			10,
		},
		{
			"Bike Lane Gap Finder",
			"Find the missing links in a cycle network by routing real trips and measuring the detours they are forced into.",
			8,
		},
		{
			"Rental Listing Watchdog",
			"Track listing prices over time and surface the ones that jump right after a tenant leaves.",
			5,
		},
		{
			"Pothole Report Triage",
			"Cluster citizen reports, dedupe them, and rank streets by how much damage they are doing.",
			2,
		},
		{
			"Council Minutes Search",
			"Full-text search across a decade of council minutes, with speaker and topic filters.",
			1,
		},
	}

	projects := make([]*ent.Project, 0, len(specs))
	weights := make([]int, 0, len(specs))
	for i, s := range specs {
		// alice proposes as organizer; every third is bob's, so the fixture
		// also has projects proposed by a plain participant — and he gets the
		// project-scoped Owner that goes with having proposed one.
		author := alice
		if i%3 == 0 {
			author = bob
		}
		p, err := db.Project.Create().
			SetTitle(s.title).
			SetDescription(s.desc).
			SetStatus(project.StatusApproved).
			SetHackathon(h).
			SetCreator(author).
			SetModifier(author).
			Save(ctx)
		if err != nil {
			return fmt.Errorf("project %q: %w", s.title, err)
		}
		if _, err := enf.AddRole(author.KeycloakID, middleware.Owner, h.ID.String(), middleware.WithProject(p.ID.String())); err != nil {
			return fmt.Errorf("assign %q owner: %w", s.title, err)
		}
		projects = append(projects, p)
		weights = append(weights, s.weight)
	}

	// Three of the four dev users, then the hundred — alice is left out on
	// purpose, see the note on seedH4: she runs this hackathon rather than
	// taking part in it. Everybody listed is confirmed: the waitlist case lives
	// in H1, and a waitlisted row here would just be noise in the input to team
	// formation.
	// Combined index-wise: 20 × 20 = 400 distinct pairs, so the first
	// dataForGoodParticipants of them are unique in both display name and
	// username.
	firstNames := []string{
		"Amara", "Bruno", "Chiara", "Dmitri", "Elena",
		"Farid", "Greta", "Hassan", "Ines", "Jonas",
		"Kavita", "Lars", "Mira", "Nikolai", "Olga",
		"Priya", "Quentin", "Rosa", "Sven", "Tamar",
	}
	lastNames := []string{
		"Abela", "Berger", "Costa", "Duarte", "Egger",
		"Fournier", "Gruber", "Haldar", "Iversen", "Jensen",
		"Keller", "Lindqvist", "Moreau", "Nakamura", "Oduya",
		"Petrov", "Quesada", "Rossi", "Steiner", "Toldeo",
	}

	participants := []*ent.User{admin, bob, charles}
	for i := range dataForGoodParticipants {
		first := firstNames[i%len(firstNames)]
		last := lastNames[(i/len(firstNames))%len(lastNames)]
		username := strings.ToLower(first + "." + last)

		u, err := getOrCreateUser(
			ctx,
			db,
			fmt.Sprintf("seed-dfg-%03d", i+1),
			username,
			first+" "+last,
			username+"@example.org",
		)
		if err != nil {
			return fmt.Errorf("synthetic participant %s: %w", username, err)
		}
		participants = append(participants, u)
	}

	for _, u := range participants {
		if _, err := db.Participant.Create().
			SetHackathon(h).
			SetUser(u).
			SetIsWaiting(false).
			Save(ctx); err != nil {
			return fmt.Errorf("participant %s: %w", u.Username, err)
		}
		// Member, and only Member — see the note on seedH4. Without it the row
		// exists and the person can do nothing, which reads as a handler bug.
		if _, err := enf.AddRole(u.KeycloakID, middleware.Member, h.ID.String()); err != nil {
			return fmt.Errorf("assign member %s in h4: %w", u.Username, err)
		}
	}
	// alice runs this one: Owner and nothing else, because she has no
	// participant row to carry Member. Casbin has no inheritance, so the
	// capabilities seedCapabilities grants below — every one of them to Member
	// — do not reach her. Proposing still does: Owner carries `Project:Propose`
	// from the default policy, which is the role the ten projects above are
	// hers under. Setting a preference does not, which is what a non-
	// participating organizer should find.
	if _, err := enf.AddRole(alice.KeycloakID, middleware.Owner, h.ID.String()); err != nil {
		return fmt.Errorf("assign alice owner in h4: %w", err)
	}

	// Preferences. Each participant names one to four projects; the counts are
	// skewed towards two and three so the fixture is neither everyone-picks-one
	// nor everyone-picks-everything.
	// The fixture has to be reproducible, which is the opposite of what a
	// crypto source gives you.
	//nolint:gosec // deterministic fixture, not security
	rng := rand.New(rand.NewSource(dataForGoodSeed))
	countFor := func() int {
		switch n := rng.Intn(100); {
		case n < 10:
			return 1
		case n < 45:
			return 2
		case n < 80:
			return 3
		default:
			return 4
		}
	}

	for _, u := range participants {
		picks := pickPreferences(rng, weights, countFor())

		update := db.User.UpdateOne(u)
		for _, i := range picks {
			update = update.AddPreferredProjects(projects[i])
		}
		if _, err := update.Save(ctx); err != nil {
			return fmt.Errorf("preferences for %s: %w", u.Username, err)
		}
	}

	// Team formation: registration shut, preferences open so an organizer can
	// still correct one, proposals open so a late idea can land. Submissions,
	// voting and results all wait on teams that do not exist yet.
	if err := seedCapabilities(ctx, db, enf, h, alice, capabilities{
		register:           false,
		proposeProjects:    true,
		teamPreferences:    true,
		projectSubmissions: false,
		vote:               false,
		viewResults:        false,
	}, phases["Team Formation"]); err != nil {
		return err
	}

	return nil
}

func getOrCreateUser(
	ctx context.Context,
	db *ent.Client,
	keycloakID, username, displayName, email string,
) (*ent.User, error) {
	u, err := db.User.Query().Where(user.KeycloakIDEQ(keycloakID)).Only(ctx)
	if err == nil {
		return u, nil
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}

	return db.User.Create().
		SetKeycloakID(keycloakID).
		SetUsername(username).
		SetDisplayName(displayName).
		SetEmail(email).
		Save(ctx)
}
