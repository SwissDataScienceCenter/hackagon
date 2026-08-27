package main

// H2 — Climate Tech Hackathon 2026. Ongoing, public, the admin's.
//
// The fixture for a hackathon in flight: registration shut, everything a
// running event needs open, and a declared current phase that agrees with the
// one its dates imply. It is also the place to test preferences, since admin
// owns it and alice and bob are both confirmed members.

import (
	"fmt"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	hackMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
)

// seedH2 builds the ongoing public Climate Tech hackathon.
//
// admin owns it and does not take part in it — owning a hackathon is a job, not
// a seat. That also retires the oddest row this fixture used to carry: a
// participant holding Owner and no hackathon-level Member, which put the
// no-inheritance trap *in* the seed rather than under test by it.
func (h *harness) seedH2(now time.Time, admin, alice, bob, yuki *actor) error {
	created, err := h.hackathon.Create(admin.ctx, &hackMsgs.CreateRequest{
		Name:       climateHackathon,
		Visibility: hackEnts.Visibility_VISIBILITY_PUBLIC,
		Description: ptr(
			"Build solutions to address climate change through technology. Focus on energy, agriculture, and sustainability.",
		),
		StartsAt: timestamppb.New(now.AddDate(0, 0, -2)),
		EndsAt:   timestamppb.New(now.AddDate(0, 0, 2)),
		Logo:     nil,
	})
	if err != nil {
		return fmt.Errorf("create: %w", err)
	}
	id := created.GetHackathonId()

	// `register` is on only while the three of them sign up. This hackathon
	// started two days ago and its final state has registration shut, so the
	// last call below takes it away again — the fixture for a hackathon nobody
	// can join any more.
	if err := h.setCaps(admin, id,
		hackEnts.Capability_CAPABILITY_REGISTER,
		hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
		hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
	); err != nil {
		return err
	}

	phases, err := h.createPhases(admin, id, []phaseSpec{
		{
			name:        "Ideation",
			description: "Research the problem space and define your approach.",
			startsAt:    timestamppb.New(now.AddDate(0, 0, -2)),
			endsAt:      timestamppb.New(now.AddDate(0, 0, -1)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
				hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES,
			},
		},
		{
			name:        "Hacking",
			description: "Build your climate tech solution with support from domain experts.",
			startsAt:    timestamppb.New(now),
			endsAt:      timestamppb.New(now.AddDate(0, 0, 1)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
			},
		},
		{
			name:        "Judging",
			description: "Demo day: present your solution to a panel of sustainability experts.",
			startsAt:    timestamppb.New(now.AddDate(0, 0, 2).Add(9 * time.Hour)),
			endsAt:      timestamppb.New(now.AddDate(0, 0, 2).Add(17 * time.Hour)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_VOTE,
				hackEnts.Capability_CAPABILITY_VIEW_RESULTS,
			},
		},
	})
	if err != nil {
		return err
	}

	if err := h.createPages(admin, id, []pageSpec{
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
	}); err != nil {
		return err
	}

	tracks, err := h.createTracks(admin, id, []trackSpec{
		{
			"Energy",
			"Renewable energy generation, smart grids, energy efficiency, and storage solutions.",
		},
		{
			"Agriculture & Food",
			"Sustainable farming, food waste reduction, supply chain transparency, and soil health monitoring.",
		},
	})
	if err != nil {
		return err
	}

	// All three confirmed. Signing up has to come before proposing: proposing
	// needs the `Member` role, and only approval grants it.
	if err := h.joinAndApprove(admin, id, alice, bob, yuki); err != nil {
		return err
	}

	// A closed form: registration ends up off, so nobody new can answer these
	// and every participant already has. The counterpart to H1's partly-filled
	// one.
	questions, err := h.createQuestions(admin, id, []questionSpec{
		{
			key:           "affiliation",
			label:         "Which university or company are you with?",
			qType:         hackEnts.QuestionType_QUESTION_TYPE_TEXT,
			mandatory:     true,
			options:       nil,
			publicAnswers: true,
		},
		{
			key:           "experience_level",
			label:         "How much hackathon experience do you have?",
			qType:         hackEnts.QuestionType_QUESTION_TYPE_ENUM,
			mandatory:     true,
			options:       []string{"First time", "A few", "Many"},
			publicAnswers: false,
		},
	})
	if err != nil {
		return fmt.Errorf("questions: %w", err)
	}

	for _, a := range []struct {
		who     *actor
		answers []answerSpec
	}{
		{alice, []answerSpec{
			text("affiliation", "ETH Zurich"),
			text("experience_level", "Many"),
		}},
		{bob, []answerSpec{
			text("affiliation", "Independent"),
			text("experience_level", "A few"),
		}},
		{yuki, []answerSpec{
			text("affiliation", "EPFL"),
			text("experience_level", "First time"),
		}},
	} {
		if err := h.submitAnswers(a.who, id, questions, a.answers); err != nil {
			return err
		}
	}

	projects, err := h.proposeProjects(id, tracks, []projectSpec{
		{
			by:           bob,
			title:        "Solar Panel Optimizer",
			description:  "ML-based system that maximises solar panel output by predicting optimal tilt angles based on hyperlocal weather forecasts.",
			track:        "Energy",
			approvedBy:   admin,
			rejectedBy:   nil,
			rejectReason: "",
		},
		{
			by:           alice,
			title:        "Smart Grid Monitor",
			description:  "Real-time dashboard for detecting grid imbalances and automating load shedding decisions using time-series anomaly detection.",
			track:        "Energy",
			approvedBy:   nil,
			rejectedBy:   nil,
			rejectReason: "",
		},
		{
			by:           alice,
			title:        "Crop Disease Detector",
			description:  "Mobile app using computer vision to identify crop diseases from field photos, providing treatment recommendations and outbreak tracking.",
			track:        "Agriculture & Food",
			approvedBy:   admin,
			rejectedBy:   nil,
			rejectReason: "",
		},
		// The rejected one, and the only project in the seed carrying a review
		// note. bob proposed it, so signing in as bob lands on a rejection an
		// author can actually read the reason for.
		{
			by:          bob,
			title:       "Carbon Offset Marketplace",
			description: "Peer-to-peer carbon credit trading platform for small-scale renewable energy producers.",
			track:       "Energy",
			approvedBy:  nil,
			rejectedBy:  admin,
			rejectReason: "Carbon credit trading sits outside this hackathon's " +
				"scope — we're after tools that cut emissions directly rather " +
				"than markets for offsetting them. Worth proposing again if you " +
				"can angle it at measurement.",
		},
	})
	if err != nil {
		return err
	}

	teams, err := h.createTeams(admin, projects, []teamSpec{
		{
			name:        "Team Gamma",
			description: "Optimizing solar panel performance with ML",
			project:     "Solar Panel Optimizer",
			members:     []*actor{bob, yuki},
		},
	})
	if err != nil {
		return err
	}

	// bob submits, as a member of the team — the one submission in this fixture
	// authored by somebody who is not an organizer.
	if _, err := h.createSubmissions(teams, projects, []submissionSpec{
		{
			by:      bob,
			team:    "Team Gamma",
			project: "Solar Panel Optimizer",
			result:  "https://github.com/team-gamma/solar-optimizer",
			final:   true,
		},
	}); err != nil {
		return err
	}

	// Current phase is Hacking, which is also the phase today's date falls in —
	// so the declared phase and the one derived from dates agree here. They are
	// separate mechanisms and can disagree; H3 is where that shows.
	if err := h.setCurrentPhase(admin, id, phases["Hacking"]); err != nil {
		return err
	}

	// Ongoing: everything a running hackathon needs open. Registration is shut,
	// since this one started two days ago — H1 is where joining is testable.
	// Voting and results wait for the judging phase.
	return h.setCaps(admin, id,
		hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
		hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES,
		hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
	)
}
