package main

// H6 — Open Science Hackathon 2026. Ongoing, public, alice's, and the voting
// fixture: building is over, every team has demoed, and voting is open now.
//
// H3 votes too, but it is over, and nobody who can sign in has a ballot left
// there. This one exists so that voting can be tested as a participant would
// meet it, with enough submissions for a points split to mean something, and
// with both kinds of category the voting page can cast: single choice and
// points.
//
// Deliberately absent, do not "fix":
//
//   - No results, and `view results` off. Votes are in, placements are not:
//     going from tallies to published results (close voting, make the results
//     final, then publish) is the organizer flow this
//     fixture is for, and it starts at the beginning. H3 is the hackathon whose
//     results are already published.
//   - bob and charles have voted in nothing. They are the two accounts you can
//     sign in as, and a ballot somebody else has already filled in tests
//     nothing — a points vote cannot even be changed once cast.
//   - charles is on no team. He is the plain voter: every submission is on
//     his ballot.
//   - No jury category and no ranked one. The backend has both, but the
//     platform offers neither, so a seeded one could only be looked at.
//   - One team never finalized. Its draft is all it has, so it is on no ballot
//     and has no votes — the case an organizer looking at submissions has to
//     see, and a voter must not.
//   - No tracks and no registration form. H1–H4 cover both; this fixture is
//     about what happens after the building stops.

import (
	"fmt"
	"math/rand"
	"strings"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	hackMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	voteEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote/entities"
)

// openScienceParticipants is how many synthetic participants seedH6 creates,
// on top of bob and charles. Like H4's hundred they have no Keycloak account
// and cannot log in. Twenty-seven of them fill the nine teams, three a side;
// the last three are on no team.
const openScienceParticipants = 30

// openScienceNameOffset is where in the dfgNames pairs the thirty start. H4
// uses the first hundred, so starting at 200 keeps every username distinct
// from theirs.
const openScienceNameOffset = 200

// openScienceVoteSeed fixes the PRNG behind who votes for what, so re-seeding
// reproduces the same tallies.
const openScienceVoteSeed = 20261013

// osProject is one project, the team building it, and how strongly voters are
// drawn to it.
//
// `weight` is spread on purpose, as in H4: a clear favourite, two close enough
// to tie, and one at the bottom that hardly anybody picks. Tallies that come
// out even would leave SuggestResults with nothing to decide.
type osProject struct {
	title, desc, team, repo string
	weight                  int
	// drafts is how many submissions come before the final one. A team with
	// final false never finalizes; its last draft is all it has.
	drafts int
	final  bool
}

func osProjects() []osProject {
	return []osProject{
		{
			"Reproducibility Checker",
			"Re-run a paper's notebooks in a clean container and report which of its figures still come out the same.",
			"Team Zeta",
			"reproducibility-checker",
			9,
			1,
			true,
		},
		{
			"Dataset Citation Graph",
			"Follow datasets through the papers that cite them, and show which ones the field quietly depends on.",
			"Team Eta",
			"dataset-citation-graph",
			7,
			0,
			true,
		},
		{
			"Open Peer Review Feed",
			"One feed of the open peer reviews published across journals, searchable by paper, field and reviewer.",
			"Team Theta",
			"open-peer-review-feed",
			6,
			0,
			true,
		},
		{
			"Lab Notebook to Paper",
			"Turn an electronic lab notebook into a methods section, with every step linked back to the entry it came from.",
			"Team Iota",
			"notebook-to-paper",
			5,
			1,
			true,
		},
		{
			"FAIR Metadata Linter",
			"Check a dataset's metadata against the FAIR principles before it is deposited, and say what is missing.",
			"Team Kappa",
			"fair-metadata-linter",
			5,
			0,
			true,
		},
		{
			"Plain-Language Preprints",
			"A short plain-language summary for every new preprint in a field, written for the people it affects.",
			"Team Lambda",
			"plain-language-preprints",
			4,
			0,
			true,
		},
		{
			"Research Software Directory",
			"Find the research software a group has written, how it is licensed, and whether anybody still maintains it.",
			"Team Mu",
			"research-software-directory",
			3,
			1,
			true,
		},
		{
			"Retraction Alerts",
			"Warn an author when a paper they cite is retracted, with the reason and the passages that relied on it.",
			"Team Nu",
			"retraction-alerts",
			2,
			0,
			true,
		},
		{
			"Grant Data Explorer",
			"Browse public research funding by institution, field and year.",
			"Team Xi", "grant-data-explorer", 1, 1, false,
		},
	}
}

// seedH6 builds the Open Science Hackathon: the one where voting is open now.
func (h *harness) seedH6(now time.Time, alice, bob, charles *actor) error {
	created, err := h.hackathon.Create(alice.ctx, &hackMsgs.CreateRequest{
		Name:       openScience,
		Visibility: hackEnts.Visibility_VISIBILITY_PUBLIC,
		Description: ptr(
			"A week of making research more open and reproducible. Building is over and every team has demoed — voting stays open until the end of the week.",
		),
		// Voting runs to day +4 rather than closing tomorrow, so the fixture still
		// reads as "voting is open" for a few days after a seed — the dev cluster
		// is not reseeded every day.
		StartsAt: timestamppb.New(now.AddDate(0, 0, -3)),
		EndsAt:   timestamppb.New(now.AddDate(0, 0, 4)),
		Logo:     nil,
	})
	if err != nil {
		return fmt.Errorf("create: %w", err)
	}
	id := created.GetHackathonId()

	// Everything the history below needs: sign-up for the participants,
	// proposals for the projects, submissions for the teams and voting for the
	// votes. The last call puts it into the state the fixture is for.
	if err := h.setCaps(alice, id,
		hackEnts.Capability_CAPABILITY_REGISTER,
		hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
		hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
		hackEnts.Capability_CAPABILITY_VOTE,
		hackEnts.Capability_CAPABILITY_VIEW_TEAMS,
	); err != nil {
		return err
	}

	phases, err := h.createPhases(alice, id, []phaseSpec{
		{
			name:        "Hacking",
			description: "Build your project and submit it before the demos.",
			startsAt:    timestamppb.New(now.AddDate(0, 0, -3)),
			endsAt:      timestamppb.New(now.AddDate(0, 0, -1)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
			},
		},
		{
			name:        "Demo & Voting",
			description: "Every team demos; then everyone votes.",
			startsAt:    timestamppb.New(now.AddDate(0, 0, -1)),
			endsAt:      timestamppb.New(now.AddDate(0, 0, 4)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_VOTE,
				hackEnts.Capability_CAPABILITY_VIEW_RESULTS,
			},
		},
	})
	if err != nil {
		return err
	}

	if err := h.createPages(alice, id, []pageSpec{
		{
			"About",
			"# Open Science Hackathon 2026\n\nNine teams spent two days on tools that make research easier to check, find and reuse. The demos are done — now it is your turn to vote.",
			true,
		},
		{
			"How voting works",
			"## Two prizes\n\n- **Audience Favourite** — pick the one project you liked best.\n- **Best Use of Open Data** — spread 10 points across the projects you think used open data best. Points cannot be changed once given.\n\nYou cannot vote for your own team's project.",
			true,
		},
	}); err != nil {
		return err
	}

	// The thirty, registered the way anybody registers. bob and charles are
	// already known; alice is not here, she runs this one.
	firstNames, lastNames := dfgNames()
	synthetic := make([]*actor, 0, openScienceParticipants)
	for i := range openScienceParticipants {
		n := openScienceNameOffset + i
		first := firstNames[n%len(firstNames)]
		last := lastNames[(n/len(firstNames))%len(lastNames)]
		username := strings.ToLower(first + "." + last)

		who, err := h.register(
			fmt.Sprintf("seed-osh-%03d", i+1),
			username,
			first+" "+last,
			username+"@example.org",
		)
		if err != nil {
			return err
		}
		synthetic = append(synthetic, who)
	}

	if err := h.joinAndApprove(
		alice,
		id,
		append([]*actor{bob, charles}, synthetic...)...); err != nil {
		return err
	}

	// alice proposes every project as the organizer, and approves it: who
	// proposed what is H1 and H4's concern, not this fixture's.
	specs := osProjects()
	projectSpecs := make([]projectSpec, 0, len(specs))
	for _, s := range specs {
		projectSpecs = append(projectSpecs, projectSpec{
			by:           alice,
			title:        s.title,
			description:  s.desc,
			track:        "",
			approvedBy:   alice,
			rejectedBy:   nil,
			rejectReason: "",
		})
	}
	projects, err := h.proposeProjects(id, nil, projectSpecs)
	if err != nil {
		return err
	}

	// Three a side, in order. bob joins the first team — the favourite — so the
	// refusal to vote for your own team is met on the submission most people
	// would pick. The three left over are on no team.
	teamSize := 3
	teamOf := make(map[*actor]int, len(synthetic))
	teamSpecs := make([]teamSpec, 0, len(specs))
	for t, s := range specs {
		members := synthetic[t*teamSize : (t+1)*teamSize]
		if t == 0 {
			members = append([]*actor{bob}, members...)
		}
		for _, m := range members {
			teamOf[m] = t
		}
		teamSpecs = append(teamSpecs, teamSpec{
			name:        s.team,
			description: "Building " + s.title,
			project:     s.title,
			members:     members,
		})
	}

	teams, err := h.createTeams(alice, projects, teamSpecs)
	if err != nil {
		return err
	}

	// Each team's submissions, made by a synthetic member — bob's team included,
	// so his own ballot is untouched. Drafts carry no link or description, as an
	// early draft often does not.
	var subSpecs []submissionSpec
	for t, s := range specs {
		author := synthetic[t*teamSize]
		for range s.drafts {
			subSpecs = append(subSpecs, submissionSpec{
				by:                  author,
				team:                s.team,
				project:             s.title,
				result:              "",
				description:         "",
				attachmentFolderURL: "",
				final:               false,
			})
		}
		if s.final {
			subSpecs = append(subSpecs, submissionSpec{
				by:                  author,
				team:                s.team,
				project:             s.title,
				result:              "https://github.com/open-science-hack/" + s.repo,
				description:         "Final submission of " + s.title,
				attachmentFolderURL: "https://drive.example.com/open-science-hack/" + s.repo,
				final:               true,
			})
		}
	}
	latest, err := h.createSubmissions(teams, projects, subSpecs)
	if err != nil {
		return err
	}

	// What can be voted on: each team's final submission, by team index. The
	// team that never finalized has none, and weight 0 keeps it off every
	// ballot below.
	finals := make([]string, len(specs))
	weights := make([]int, len(specs))
	for t, s := range specs {
		if s.final {
			finals[t] = latest[s.team]
			weights[t] = s.weight
		}
	}

	if err := h.castVotes(id, alice, synthetic, teamOf, finals, weights); err != nil {
		return err
	}

	if err := h.setCurrentPhase(alice, id, phases["Demo & Voting"]); err != nil {
		return err
	}

	// Voting: sign-up, proposals and submissions are closed. Teams stay visible,
	// because the ballot is built from them. Results stay hidden: the platform
	// lets them be published only once they are final, and making them final
	// is the organizer flow this fixture is for — close voting, make the
	// results final, then publish.
	return h.setCaps(alice, id,
		hackEnts.Capability_CAPABILITY_VOTE,
		hackEnts.Capability_CAPABILITY_VIEW_TEAMS,
	)
}

// castVotes opens H6's two categories and fills them with the synthetic
// participants' votes. bob and charles are left with every ballot empty.
func (h *harness) castVotes(
	hackathonID string,
	alice *actor,
	voters []*actor,
	teamOf map[*actor]int,
	finals []string,
	weights []int,
) error {
	audience, err := h.createVoteCategory(alice, hackathonID, voteCategorySpec{
		name:        "Audience Favourite",
		description: "Pick the one project you liked best.",
		method:      voteEnts.VotingMethod_VOTING_METHOD_SINGLE_CHOICE,
		maxPoints:   0,
	})
	if err != nil {
		return err
	}
	openData, err := h.createVoteCategory(alice, hackathonID, voteCategorySpec{
		name:        "Best Use of Open Data",
		description: "Spread 10 points across the projects that used open data best.",
		method:      voteEnts.VotingMethod_VOTING_METHOD_POINTS,
		maxPoints:   10,
	})
	if err != nil {
		return err
	}

	// Never anybody's own team: the handler refuses that, so it is left out of
	// the weights rather than drawn and rejected. The three on no team have
	// nothing to leave out.
	weightsFor := func(who *actor) []int {
		w := make([]int, len(weights))
		copy(w, weights)
		if t, ok := teamOf[who]; ok {
			w[t] = 0
		}
		return w
	}
	ids := func(picked []int) []string {
		out := make([]string, 0, len(picked))
		for _, i := range picked {
			out = append(out, finals[i])
		}
		return out
	}
	// How a points budget of 10 is split across one, two or three projects.
	// Not every voter spends all of it; the budget is a ceiling.
	splits := map[int][][]int32{
		1: {{10}, {8}},
		2: {{6, 4}, {5, 5}, {7, 3}},
		3: {{5, 3, 2}, {4, 3, 3}, {4, 4, 2}},
	}

	//nolint:gosec // deterministic fixture, not security
	rng := rand.New(rand.NewSource(openScienceVoteSeed))

	// Most people vote, not everybody, and fewer bother with the categories
	// that take more thought — so each tally has its own turnout.
	for _, v := range voters {
		w := weightsFor(v)

		if rng.Intn(5) > 0 {
			if err := h.submitSingleChoiceVote(
				v,
				audience,
				ids(pickPreferences(rng, w, 1))[0],
			); err != nil {
				return err
			}
		}

		if rng.Intn(3) > 0 {
			picked := ids(pickPreferences(rng, w, 1+rng.Intn(3)))
			options := splits[len(picked)]
			split := options[rng.Intn(len(options))]
			ballot := make([]pointsFor, 0, len(picked))
			for i, sub := range picked {
				ballot = append(ballot, pointsFor{submission: sub, points: split[i]})
			}
			if err := h.submitPointsVote(v, openData, ballot); err != nil {
				return err
			}
		}
	}

	return nil
}
