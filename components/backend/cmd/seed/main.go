package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"time"

	_ "github.com/lib/pq"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/project"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/submission"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
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
		Save(ctx)
	if err != nil {
		return err
	}

	for _, ph := range []struct {
		name, desc string
		start, end time.Time
	}{
		{"Ideation", "Define your project idea and form your team.", now.AddDate(0, 0, 19).Add(9 * time.Hour), now.AddDate(0, 0, 19).Add(18 * time.Hour)},
		{"Hacking", "Build your project. Mentors available throughout the day.", now.AddDate(0, 0, 20).Add(9 * time.Hour), now.AddDate(0, 0, 20).Add(21 * time.Hour)},
		{"Judging", "Present your project to the judges. Top 3 teams win prizes.", now.AddDate(0, 0, 21).Add(10 * time.Hour), now.AddDate(0, 0, 21).Add(16 * time.Hour)},
	} {
		if _, err := db.Phase.Create().
			SetName(ph.name).
			SetDescription(ph.desc).
			SetStartsAt(ph.start).
			SetEndsAt(ph.end).
			SetHackathon(h).
			SetCreator(alice).
			SetModifier(alice).
			Save(ctx); err != nil {
			return fmt.Errorf("phase %q: %w", ph.name, err)
		}
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
	if _, err := db.TeamParticipant.Create().SetTeam(teamBeta).SetUser(alice).Save(ctx); err != nil {
		return fmt.Errorf("team Beta member alice: %w", err)
	}
	if _, err := enf.AddRole(alice.KeycloakID, middleware.Member, h.ID.String(), middleware.WithTeam(teamBeta.ID.String())); err != nil {
		return fmt.Errorf("assign Beta member alice: %w", err)
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
		{alice.KeycloakID, middleware.Owner},
		{admin.KeycloakID, middleware.Member},
		{bob.KeycloakID, middleware.Member},
	} {
		if _, err := enf.AddRole(ra.id, ra.role, h.ID.String()); err != nil {
			return fmt.Errorf("assign role %s to %s in h1: %w", ra.role, ra.id, err)
		}
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
		Save(ctx)
	if err != nil {
		return err
	}

	for _, ph := range []struct {
		name, desc string
		start, end time.Time
	}{
		{"Ideation", "Research the problem space and define your approach.", now.AddDate(0, 0, -2), now.AddDate(0, 0, -1)},
		{"Hacking", "Build your climate tech solution with support from domain experts.", now.AddDate(0, 0, 0), now.AddDate(0, 0, 1)},
		{"Judging", "Demo day: present your solution to a panel of sustainability experts.", now.AddDate(0, 0, 2).Add(9 * time.Hour), now.AddDate(0, 0, 2).Add(17 * time.Hour)},
	} {
		if _, err := db.Phase.Create().
			SetName(ph.name).
			SetDescription(ph.desc).
			SetStartsAt(ph.start).
			SetEndsAt(ph.end).
			SetHackathon(h).
			SetCreator(admin).
			SetModifier(admin).
			Save(ctx); err != nil {
			return fmt.Errorf("phase %q: %w", ph.name, err)
		}
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
		Save(ctx)
	if err != nil {
		return err
	}

	for _, ph := range []struct {
		name, desc string
		start, end time.Time
	}{
		{"Ideation", "Identify pain points in the current developer workflow and scope your proposal.", now.AddDate(0, -1, -20).Add(9 * time.Hour), now.AddDate(0, -1, -20).Add(18 * time.Hour)},
		{"Building", "Implement your improvement prototype.", now.AddDate(0, -1, -19).Add(9 * time.Hour), now.AddDate(0, -1, -19).Add(21 * time.Hour)},
		{"Demo", "Present your prototype and gather feedback from the team.", now.AddDate(0, -1, -18).Add(10 * time.Hour), now.AddDate(0, -1, -18).Add(16 * time.Hour)},
	} {
		if _, err := db.Phase.Create().
			SetName(ph.name).
			SetDescription(ph.desc).
			SetStartsAt(ph.start).
			SetEndsAt(ph.end).
			SetHackathon(h).
			SetCreator(admin).
			SetModifier(admin).
			Save(ctx); err != nil {
			return fmt.Errorf("phase %q: %w", ph.name, err)
		}
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
	for _, u := range []*ent.User{admin, alice} {
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
		SetCreator(admin).
		SetModifier(admin).
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
		SetCreator(admin).
		SetModifier(admin).
		Save(ctx); err != nil {
		return fmt.Errorf("submission Delta v2: %w", err)
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
