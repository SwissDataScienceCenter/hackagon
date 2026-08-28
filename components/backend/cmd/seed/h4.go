package main

// H4 — Data for Good Hackathon 2026. Upcoming, public, alice's, and the large
// one: a hundred people confirmed in, fifteen projects on the table, everybody
// has said which ones they would like to work on, and no team exists yet.
//
// That is the input a team-assignment algorithm takes, and none of the other
// three provide it: H1 and H2 have their teams pre-baked, H3 is over.
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
//     own, because she is not after a team. No owner takes part in the hackathon
//     they run, here or anywhere else in this fixture.
//   - hackagon-admin is not a participant either, in any of the four. He is the
//     platform operator, and the global-admin escape hatch is worth exercising
//     from outside a hackathon rather than from a member who also happens to be
//     an admin.
//   - `register` ends up off. Sign-up closed three days ago; this is the fixture
//     where `Join` is refused because the window shut, not because the
//     hackathon is misconfigured.
//   - No tracks. Every project here carries none, because this is the fixture
//     for a hackathon that runs without them — the shape the first client
//     needs. H1-H3 keep their tracks, so both shapes stay covered.

import (
	"fmt"
	"math/rand"
	"strings"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	hackMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
)

// dataForGoodParticipants is how many synthetic participants seedH4 creates.
//
// They have no Keycloak account, so none of them can log in, and that is the
// point: they are bulk, not actors. The seed can still act as every one of them
// because it signs its own tokens — see harness.go. bob and charles take part
// in the same hackathon and alice runs it, so there is always somebody you can
// actually sign in as to look at what the bulk produced.
const dataForGoodParticipants = 100

// dataForGoodSeed fixes the PRNG that shapes the preference distribution.
// Everything else here is deterministic; re-running the seed must not quietly
// produce a different fixture, so the randomness comes from a constant and
// never from the clock.
const dataForGoodSeed = 20260421

// dataForGoodAnswerSeed drives the registration answers. Its own stream on
// purpose: drawing them from dataForGoodSeed would shift every preference draw
// after it and silently rewrite a fixture other tests read.
const dataForGoodAnswerSeed = 20260422

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

// dfgProjects are the fifteen ideas. The blank lines group them by theme and
// mean nothing to the fixture — this hackathon has no tracks, and the order
// they are proposed in is not significant.
func dfgProjects() []dfgProject {
	return []dfgProject{
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
}

// dfgNames are the two 20-entry lists the hundred are built from. 20 × 20 = 400
// distinct pairs, so the first hundred are unique in both display name and
// username.
func dfgNames() (first, last []string) {
	return []string{
			"Amara", "Bruno", "Chiara", "Dmitri", "Elena",
			"Farid", "Greta", "Hassan", "Ines", "Jonas",
			"Kavita", "Lars", "Mira", "Nikolai", "Olga",
			"Priya", "Quentin", "Rosa", "Sven", "Tamar",
		}, []string{
			"Abela", "Berger", "Costa", "Duarte", "Egger",
			"Fournier", "Gruber", "Haldar", "Iversen", "Jensen",
			"Keller", "Lindqvist", "Moreau", "Nakamura", "Oduya",
			"Petrov", "Quesada", "Rossi", "Steiner", "Toldeo",
		}
}

// seedH4 builds the Data for Good Hackathon: the large fixture, and the only
// one sitting in team formation.
func (h *harness) seedH4(now time.Time, alice, bob, charles *actor) error {
	created, err := h.hackathon.Create(alice.ctx, &hackMsgs.CreateRequest{
		Name:       dataForGood,
		Visibility: hackEnts.Visibility_VISIBILITY_PUBLIC,
		Description: ptr(
			"A week-long hackathon putting open data to work on public-interest problems. Registration is closed; teams are being formed from participants' project preferences.",
		),
		StartsAt: timestamppb.New(now.AddDate(0, 0, 5)),
		EndsAt:   timestamppb.New(now.AddDate(0, 0, 8)),
		Logo:     nil,
	})
	if err != nil {
		return fmt.Errorf("create: %w", err)
	}
	id := created.GetHackathonId()

	// `register` is on only while the hundred and two sign up, and off in the
	// end — which is the state this fixture is for. Preferences and proposals
	// stay open, so the last call below only takes registration away.
	if err := h.setCaps(alice, id,
		hackEnts.Capability_CAPABILITY_REGISTER,
		hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
		hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES,
	); err != nil {
		return err
	}

	phases, err := h.createPhases(alice, id, []phaseSpec{
		{
			name:        "Registration",
			description: "Sign up and tell us which projects interest you.",
			startsAt:    timestamppb.New(now.AddDate(0, 0, -21)),
			endsAt:      timestamppb.New(now.AddDate(0, 0, -3)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_REGISTER,
			},
		},
		{
			name:        "Team Formation",
			description: "Organizers group participants into teams based on the preferences they expressed.",
			startsAt:    timestamppb.New(now.AddDate(0, 0, -3)),
			endsAt:      timestamppb.New(now.AddDate(0, 0, 4)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
				hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES,
			},
		},
		{
			name:        "Hacking",
			description: "Build your project with your new team.",
			startsAt:    timestamppb.New(now.AddDate(0, 0, 5).Add(9 * time.Hour)),
			endsAt:      timestamppb.New(now.AddDate(0, 0, 7).Add(18 * time.Hour)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
			},
		},
		{
			name:        "Demo",
			description: "Show what you built and vote on the others.",
			startsAt:    timestamppb.New(now.AddDate(0, 0, 8).Add(10 * time.Hour)),
			endsAt:      timestamppb.New(now.AddDate(0, 0, 8).Add(17 * time.Hour)),
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
	}); err != nil {
		return err
	}

	// The hundred, registered one at a time the way anybody registers. bob and
	// charles are already known; alice is not here, she runs this one.
	firstNames, lastNames := dfgNames()
	participants := []*actor{bob, charles}
	for i := range dataForGoodParticipants {
		first := firstNames[i%len(firstNames)]
		last := lastNames[(i/len(firstNames))%len(lastNames)]
		username := strings.ToLower(first + "." + last)

		who, err := h.register(
			fmt.Sprintf("seed-dfg-%03d", i+1),
			username,
			first+" "+last,
			username+"@example.org",
		)
		if err != nil {
			return err
		}
		participants = append(participants, who)
	}

	// Everybody confirmed: the waitlist case lives in H1, and a waitlisted row
	// here would just be noise in the input to team formation. Signing up has to
	// come before the projects, because proposing needs the `Member` role that
	// only approval grants — and five of the fifteen are bob's.
	if err := h.joinAndApprove(alice, id, participants...); err != nil {
		return err
	}

	// alice proposes as organizer; every third is bob's, so the fixture also has
	// projects proposed by a plain participant — and he gets the project-scoped
	// ownership that goes with having proposed one.
	specs := dfgProjects()
	projectSpecs := make([]projectSpec, 0, len(specs))
	weights := make([]int, 0, len(specs))
	for i, s := range specs {
		author := alice
		if i%3 == 0 {
			author = bob
		}
		projectSpecs = append(projectSpecs, projectSpec{
			by:           author,
			title:        s.title,
			description:  s.desc,
			track:        "",
			approvedBy:   alice,
			rejectedBy:   nil,
			rejectReason: "",
		})
		weights = append(weights, s.weight)
	}
	projects, err := h.proposeProjects(id, nil, projectSpecs)
	if err != nil {
		return err
	}

	// Registration answers at cohort scale. H4 is the only fixture large enough
	// to show what an organizer's roster actually looks like — including the
	// gap, since roughly one in seven never answered and only the people who
	// did appear in ListParticipantAnswers.
	questions, err := h.createQuestions(alice, id, []questionSpec{
		{
			key:           "affiliation",
			label:         "Which university or company are you with?",
			qType:         hackEnts.QuestionType_QUESTION_TYPE_TEXT,
			mandatory:     true,
			options:       nil,
			publicAnswers: true,
		},
		{
			key:           "tshirt_size",
			label:         "T-shirt size",
			qType:         hackEnts.QuestionType_QUESTION_TYPE_ENUM,
			mandatory:     true,
			options:       []string{"XS", "S", "M", "L", "XL", "XXL"},
			publicAnswers: false,
		},
		{
			key:           "experience",
			label:         "How much have you hacked before?",
			qType:         hackEnts.QuestionType_QUESTION_TYPE_ENUM,
			mandatory:     true,
			options:       []string{"First time", "A few", "Many"},
			publicAnswers: false,
		},
		{
			key:           "remote",
			label:         "I will be attending remotely",
			qType:         hackEnts.QuestionType_QUESTION_TYPE_BOOL,
			mandatory:     false,
			options:       nil,
			publicAnswers: true,
		},
	})
	if err != nil {
		return fmt.Errorf("questions: %w", err)
	}

	//nolint:gosec // deterministic fixture, not security
	answerRng := rand.New(rand.NewSource(dataForGoodAnswerSeed))
	affiliations := []string{
		"ETH Zurich", "EPFL", "University of Zurich", "University of Bern",
		"Independent", "SDSC", "University of Basel", "ZHAW",
	}
	sizes := []string{"XS", "S", "M", "L", "XL", "XXL"}
	// Weighted rather than uniform, because a cohort is mostly people in the
	// middle. An even third each would make spreading the newcomers across the
	// teams look like an easier problem than it is.
	experience := []string{
		"First time", "First time", "First time",
		"A few", "A few", "A few", "A few", "A few",
		"Many", "Many",
	}
	for _, who := range participants {
		// Not everyone answers. An organizer chasing people needs a roster where
		// some rows are genuinely empty, not one where everybody is done.
		if answerRng.Intn(7) == 0 {
			continue
		}
		answers := []answerSpec{
			text("affiliation", affiliations[answerRng.Intn(len(affiliations))]),
			text("tshirt_size", sizes[answerRng.Intn(len(sizes))]),
			text("experience", experience[answerRng.Intn(len(experience))]),
		}
		// The optional one is answered less often, and "no" is an answer —
		// distinct from not having answered at all.
		if answerRng.Intn(3) > 0 {
			answers = append(answers, boolAnswer("remote", answerRng.Intn(4) == 0))
		}
		if err := h.submitAnswers(who, id, questions, answers); err != nil {
			return err
		}
	}

	// Preferences. Each participant names one to four projects; the counts are
	// skewed towards two and three so the fixture is neither everyone-picks-one
	// nor everyone-picks-everything. Each is set by the participant themselves —
	// there is no RPC to express somebody else's preference.
	//
	// The fixture has to be reproducible, which is the opposite of what a crypto
	// source gives you.
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

	for _, who := range participants {
		for _, i := range pickPreferences(rng, weights, countFor()) {
			if err := h.setPreference(who, projects[specs[i].title]); err != nil {
				return err
			}
		}
	}

	if err := h.setCurrentPhase(alice, id, phases["Team Formation"]); err != nil {
		return err
	}

	// Team formation: registration shut, preferences open so an organizer can
	// still correct one, proposals open so a late idea can land. Submissions,
	// voting and results all wait on teams that do not exist yet.
	return h.setCaps(alice, id,
		hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
		hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES,
	)
}
