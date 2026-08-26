package main

// H1 — AI Innovation Challenge 2026. Upcoming, public, alice's.
//
// The fixture for the registration flow: the one hackathon with `register` on,
// so it is where join-and-answer is exercised, and the one with a waitlisted
// participant to tell apart from a confirmed one.

import (
	"fmt"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	hackMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
)

// seedH1 builds the upcoming public AI Innovation Challenge.
//
// admin appears here only to approve one project. He administers the platform,
// not this hackathon, and holds no participant row anywhere — so that approval
// is the global-admin escape hatch being exercised by somebody genuinely
// outside the hackathon rather than by a member in disguise.
func (h *harness) seedH1(now time.Time, admin, alice, bob, charles, dana *actor) error {
	created, err := h.hackathon.Create(alice.ctx, &hackMsgs.CreateRequest{
		Name:       sentinelHackathon,
		Visibility: hackEnts.Visibility_VISIBILITY_PUBLIC,
		Description: ptr(
			"A 3-day hackathon focused on building AI-powered applications. Open to all skill levels.",
		),
		StartsAt: timestamppb.New(now.AddDate(0, 0, 19)),
		EndsAt:   timestamppb.New(now.AddDate(0, 0, 21)),
		Logo:     nil,
	})
	if err != nil {
		return fmt.Errorf("create: %w", err)
	}
	id := created.GetHackathonId()

	// Nothing below can be done unless the capability behind it is on at the
	// time. All three are on in the end as well, so this hackathon never has to
	// switch one back off.
	if err := h.setCaps(alice, id,
		hackEnts.Capability_CAPABILITY_REGISTER,
		hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
		hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
	); err != nil {
		return err
	}

	if _, err := h.createPhases(alice, id, []phaseSpec{
		{
			name:        "Ideation",
			description: "Define your project idea and form your team.",
			startsAt:    timestamppb.New(now.AddDate(0, 0, 19).Add(9 * time.Hour)),
			endsAt:      timestamppb.New(now.AddDate(0, 0, 19).Add(18 * time.Hour)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
				hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES,
			},
		},
		{
			name:        "Hacking",
			description: "Build your project. Mentors available throughout the day.",
			startsAt:    timestamppb.New(now.AddDate(0, 0, 20).Add(9 * time.Hour)),
			endsAt:      timestamppb.New(now.AddDate(0, 0, 20).Add(21 * time.Hour)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
			},
		},
		{
			name:        "Judging",
			description: "Present your project to the judges. Top 3 teams win prizes.",
			startsAt:    timestamppb.New(now.AddDate(0, 0, 21).Add(10 * time.Hour)),
			endsAt:      timestamppb.New(now.AddDate(0, 0, 21).Add(16 * time.Hour)),
			capabilities: []hackEnts.Capability{
				hackEnts.Capability_CAPABILITY_VOTE,
				hackEnts.Capability_CAPABILITY_VIEW_RESULTS,
			},
		},
	}); err != nil {
		return err
	}

	if err := h.createPages(alice, id, []pageSpec{
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
	}); err != nil {
		return err
	}

	tracks, err := h.createTracks(alice, id, []trackSpec{
		{
			"Machine Learning",
			"Projects leveraging ML models, training pipelines, and deployment infrastructure.",
		},
		{
			"Natural Language Processing",
			"Chatbots, summarization, translation, and other language-powered applications.",
		},
		{
			"Computer Vision",
			"Image recognition, object detection, video analysis, and visual AI applications.",
		},
	})
	if err != nil {
		return err
	}

	// Signups come before the registration form exists, which is what leaves
	// charles with a waitlisted row and no answers on file. Join validates
	// mandatory questions, so once the form below is in place an empty signup is
	// refused — and "has not filled it in" is one of the two states an organizer
	// has to be able to tell apart.
	if err := h.joinAndApprove(alice, id, alice, bob, dana); err != nil {
		return err
	}
	if err := h.join(charles, id); err != nil {
		return err
	}

	// The registration form. Mandatory questions are deliberate: they are what
	// makes Join refuse an empty signup, and until that path was fixed a
	// hackathon asking anything mandatory could not be joined at all.
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
			key:           "dietary",
			label:         "Any dietary requirements?",
			qType:         hackEnts.QuestionType_QUESTION_TYPE_TEXT,
			mandatory:     false,
			options:       nil,
			publicAnswers: false,
		},
		{
			key:           "code_of_conduct",
			label:         "I accept the Code of Conduct",
			qType:         hackEnts.QuestionType_QUESTION_TYPE_BOOL,
			mandatory:     true,
			options:       nil,
			publicAnswers: false,
		},
	})
	if err != nil {
		return fmt.Errorf("questions: %w", err)
	}

	// bob skips `dietary`, which is the other of the two states: filled it in
	// and left the optional parts blank.
	for _, a := range []struct {
		who     *actor
		answers []answerSpec
	}{
		{alice, []answerSpec{
			text("affiliation", "ETH Zurich"),
			text("tshirt_size", "M"),
			text("dietary", "Vegetarian"),
			yes("code_of_conduct"),
		}},
		{bob, []answerSpec{
			text("affiliation", "Independent"),
			text("tshirt_size", "L"),
			yes("code_of_conduct"),
		}},
		{dana, []answerSpec{
			text("affiliation", "University of Zurich"),
			text("tshirt_size", "S"),
			text("dietary", "No nuts"),
			yes("code_of_conduct"),
		}},
	} {
		if err := h.submitAnswers(a.who, id, questions, a.answers); err != nil {
			return err
		}
	}

	// Five ideas, three approved. alice approves what she runs; admin approves
	// the third from outside. Federated Learning and Document Summarizer stay
	// proposed — the fixture for an idea still waiting on an organizer.
	projects, err := h.proposeProjects(id, tracks, []projectSpec{
		{
			by:          alice,
			title:       "AutoML Pipeline Builder",
			description: "A no-code platform that automatically selects and trains the best ML model for a given dataset, with one-click deployment.",
			track:       "Machine Learning",
			approvedBy:  alice,
			rejectedBy:  nil,
		},
		{
			by:          bob,
			title:       "Federated Learning Framework",
			description: "Privacy-preserving ML training across distributed data sources without ever sharing raw data with a central server.",
			track:       "Machine Learning",
			approvedBy:  nil,
			rejectedBy:  nil,
		},
		{
			by:          alice,
			title:       "Multilingual Chatbot",
			description: "A customer support chatbot that handles queries in 12 languages using a fine-tuned LLM, with automatic language detection.",
			track:       "Natural Language Processing",
			approvedBy:  alice,
			rejectedBy:  nil,
		},
		{
			by:          bob,
			title:       "Document Summarizer",
			description: "Automatic abstractive summarization of legal and scientific documents using transformer models, with citation tracking.",
			track:       "Natural Language Processing",
			approvedBy:  nil,
			rejectedBy:  nil,
		},
		{
			by:          bob,
			title:       "Real-time Object Detection",
			description: "Edge-deployed object detection for retail shelf monitoring, running on low-power ARM hardware with under 50 ms latency.",
			track:       "Computer Vision",
			approvedBy:  admin,
			rejectedBy:  nil,
		},
	})
	if err != nil {
		return err
	}

	// Nobody belongs to two teams: a person works on one project, and alice
	// already has Team Alpha. It also sharpens the cross-team read case — bob is
	// a plain member of Team Beta with no policy row matching Team Alpha's
	// domain, where alice's hackathon-wide ownership made every such read
	// succeed for the wrong reason.
	// See mydocs/docs/backend-tickets/submission-cross-team-read.md.
	teams, err := h.createTeams(alice, projects, []teamSpec{
		{
			name:        "Team Alpha",
			description: "Building the AutoML Pipeline Builder",
			project:     "AutoML Pipeline Builder",
			members:     []*actor{alice, dana},
		},
		{
			name:        "Team Beta",
			description: "Working on the Multilingual Chatbot",
			project:     "Multilingual Chatbot",
			members:     []*actor{bob},
		},
	})
	if err != nil {
		return err
	}

	// Team Alpha submits twice: a first attempt left as a draft, then a second
	// one finalized.
	if _, err := h.createSubmissions(teams, projects, []submissionSpec{
		{
			by:      alice,
			team:    "Team Alpha",
			project: "AutoML Pipeline Builder",
			result:  "",
			final:   false,
		},
		{
			by:      alice,
			team:    "Team Alpha",
			project: "AutoML Pipeline Builder",
			result:  "https://github.com/team-alpha/automl-pipeline",
			final:   true,
		},
	}); err != nil {
		return err
	}

	// Upcoming: sign-ups are open, ideas are being proposed, and participants say
	// which project they would like to work on — all of which happen before the
	// doors open. Voting and results stay shut until it is over.
	//
	// Submissions are on because the fixture already contains team Alpha's two:
	// a capability that contradicts the data on screen is more confusing than
	// one that is early.
	//
	// No current phase is ever set, because the doors have not opened — the one
	// fixture that exercises an empty `current_phase_id`.
	return h.setCaps(alice, id,
		hackEnts.Capability_CAPABILITY_REGISTER,
		hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
		hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES,
		hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
	)
}

// ptr is for the optional fields the generated requests take as pointers.
func ptr[T any](v T) *T {
	return &v
}
