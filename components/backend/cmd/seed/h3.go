package main

// H3 — Internal Product Sprint. Past, private, the admin's.
//
// The fixture for a hackathon that is over: every write refused because the
// event has ended rather than because anything is misconfigured, and the only
// one carrying votes and results.

import (
	"fmt"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	hackMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	voteEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote/entities"
)

// seedH3 builds the past private Internal Product Sprint.
//
// It is created with a live window and moved into the past at the very end,
// because `Join` refuses a hackathon that has already finished — so a past
// hackathon cannot be populated as one. Every step below therefore happens
// while the sprint is still notionally open, which is also the order it
// happened in for real.
func (h *harness) seedH3(now time.Time, admin, alice, dana *actor) error {
	startsAt := now.AddDate(0, -1, -20)
	endsAt := now.AddDate(0, -1, -18)

	created, err := h.hackathon.Create(admin.ctx, &hackMsgs.CreateRequest{
		Name:       sprintHackathon,
		Visibility: hackEnts.Visibility_VISIBILITY_PRIVATE,
		Description: ptr(
			"An internal sprint to improve developer tooling and data infrastructure.",
		),
		// A live window for now; backdated once the fixture is populated.
		StartsAt: timestamppb.New(now),
		EndsAt:   timestamppb.New(now.AddDate(0, 0, 2)),
		Logo:     nil,
	})
	if err != nil {
		return fmt.Errorf("create: %w", err)
	}
	id := created.GetHackathonId()

	// Everything this sprint ever did, switched on at once: it ends with only
	// results left open, so all four of the others are taken away again below.
	// `vote` stays on, which is what lets the two votes be cast through
	// SubmitVote — including its refusal to let anyone vote for their own team.
	if err := h.setCaps(admin, id,
		hackEnts.Capability_CAPABILITY_REGISTER,
		hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
		hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
		hackEnts.Capability_CAPABILITY_VOTE,
		hackEnts.Capability_CAPABILITY_VIEW_RESULTS,
	); err != nil {
		return err
	}

	phases, err := h.createPhases(admin, id, []phaseSpec{
		{
			name:        "Ideation",
			description: "Identify pain points in the current developer workflow and scope your proposal.",
			startsAt:    timestamppb.New(startsAt.Add(9 * time.Hour)),
			endsAt:      timestamppb.New(startsAt.Add(18 * time.Hour)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
				hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES,
			},
		},
		{
			name:        "Building",
			description: "Implement your improvement prototype.",
			startsAt:    timestamppb.New(now.AddDate(0, -1, -19).Add(9 * time.Hour)),
			endsAt:      timestamppb.New(now.AddDate(0, -1, -19).Add(21 * time.Hour)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
			},
		},
		{
			name:        "Demo",
			description: "Present your prototype and gather feedback from the team.",
			startsAt:    timestamppb.New(endsAt.Add(10 * time.Hour)),
			endsAt:      timestamppb.New(endsAt.Add(16 * time.Hour)),
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
	}); err != nil {
		return err
	}

	tracks, err := h.createTracks(admin, id, []trackSpec{
		{
			"Developer Tools",
			"CLI tools, IDE plugins, testing frameworks, and workflow automation.",
		},
		{
			"Data Platform",
			"Data pipelines, observability, schema management, and analytics infrastructure.",
		},
	})
	if err != nil {
		return err
	}

	// Private, so getting in takes an invitation. `Join` admits anyone who can
	// already read the hackathon — which on the public fixtures is everybody —
	// and refuses everyone else outright unless they carry a valid invite token.
	// Neither alice nor dana holds a role here before joining, so without this
	// they are turned away with "invalid or expired invitation".
	//
	// admin owns the sprint and is therefore the one who can mint the link, the
	// same way an organizer would. It doubles as the fixture's only invite, so
	// the invites list an organizer sees has something in it.
	invite, err := h.createInvite(admin, id)
	if err != nil {
		return err
	}

	// alice and dana confirmed. admin owns this one and does not take part, so
	// dana holds the second seat — which the fixture cannot do without: see the
	// teams below, the two participants have to be two different people or the
	// votes have nobody to come from.
	if err := h.joinAndApproveWithInvite(admin, id, invite, alice, dana); err != nil {
		return err
	}

	projects, err := h.proposeProjects(id, tracks, []projectSpec{
		{
			by:          admin,
			title:       "CLI Code Generator",
			description: "A command-line tool that scaffolds new microservices from a YAML spec, generating proto definitions, ent schemas, and CI configuration automatically.",
			track:       "Developer Tools",
			approvedBy:  admin,
			rejectedBy:  nil,
		},
		{
			by:          alice,
			title:       "Test Coverage Dashboard",
			description: "A web dashboard that tracks test coverage trends across all repositories over time and surfaces regressions directly in CI checks.",
			track:       "Developer Tools",
			approvedBy:  nil,
			rejectedBy:  nil,
		},
		{
			by:          alice,
			title:       "Data Pipeline Visualizer",
			description: "Interactive graph visualization of data pipeline dependencies with live execution status, SLA tracking, and error highlighting.",
			track:       "Data Platform",
			approvedBy:  admin,
			rejectedBy:  nil,
		},
	})
	if err != nil {
		return err
	}

	// One member each, and deliberately not the same person on both. SubmitVote
	// refuses a vote on a submission by a team you belong to, so putting both
	// participants on both teams — which this fixture used to do — leaves H3
	// with voting enabled and nobody able to cast a single vote, in the one
	// hackathon where voting is testable at all. Split one apiece and each can
	// vote for the other, which is what the two votes below record.
	teams, err := h.createTeams(admin, projects, []teamSpec{
		{
			name:        "Team Delta",
			description: "Building the CLI Code Generator",
			project:     "CLI Code Generator",
			members:     []*actor{alice},
		},
		{
			name:        "Team Epsilon",
			description: "Building the Data Pipeline Visualizer",
			project:     "Data Pipeline Visualizer",
			members:     []*actor{dana},
		},
	})
	if err != nil {
		return err
	}

	// Each submission is authored by the person on that team — nobody can submit
	// for a team they are not on.
	latest, err := h.createSubmissions(teams, projects, []submissionSpec{
		{
			by:      alice,
			team:    "Team Delta",
			project: "CLI Code Generator",
			result:  "",
			final:   false,
		},
		{
			by:      alice,
			team:    "Team Delta",
			project: "CLI Code Generator",
			result:  "https://github.com/internal/cli-code-gen",
			final:   true,
		},
		{
			by:      dana,
			team:    "Team Epsilon",
			project: "Data Pipeline Visualizer",
			result:  "https://github.com/internal/data-pipeline-viz",
			final:   true,
		},
	})
	if err != nil {
		return err
	}

	category, err := h.createVoteCategory(admin, id, voteCategorySpec{
		name:        "Best Project",
		description: "Vote for the project you found most interesting or useful.",
		method:      voteEnts.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
		voterType:   voteEnts.VoterType_VOTER_TYPE_ALL_PARTICIPANTS,
	})
	if err != nil {
		return err
	}

	// Each votes for the team they are not on, which is the only kind of vote
	// SubmitVote accepts — and now the handler is the thing enforcing that
	// rather than a comment asking the fixture to stay honest.
	for _, v := range []struct {
		voter *actor
		team  string
	}{
		{dana, "Team Delta"},
		{alice, "Team Epsilon"},
	} {
		if err := h.submitSingleChoiceVote(v.voter, category, latest[v.team]); err != nil {
			return err
		}
	}

	// Both tied for first, one vote each.
	for _, team := range []string{"Team Delta", "Team Epsilon"} {
		if err := h.createVoteResult(admin, category, latest[team], 1); err != nil {
			return err
		}
	}

	// Current phase stays on Demo, the last one it reached. Every phase is in the
	// past, so a date-derived reading calls them all completed while the declared
	// phase still names one — the case that shows the two are different
	// mechanisms.
	if err := h.setCurrentPhase(admin, id, phases["Demo"]); err != nil {
		return err
	}

	// Over a month past: nothing left to do but look at what happened. Voting
	// stays on with the results, which is how the fixture used to read; what
	// actually stops a late vote now is the sprint being over.
	if err := h.setCaps(admin, id,
		hackEnts.Capability_CAPABILITY_VOTE,
		hackEnts.Capability_CAPABILITY_VIEW_RESULTS,
	); err != nil {
		return err
	}

	// Last of all, because everything above needed the sprint to be open.
	return h.backdate(admin, id, startsAt, endsAt)
}
