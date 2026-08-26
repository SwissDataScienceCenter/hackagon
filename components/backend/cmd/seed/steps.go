package main

// The moves a seeded hackathon is built out of. Each one is a short sequence of
// RPCs that the fixture needs often enough to be worth a name.

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	hackMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	pageMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/page_svc"
	phaseMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/phase_svc"
	projectMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/project_svc"
	teamMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/team_svc"
	trackMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/track_svc"
	voteEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote/entities"
	voteMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote/messages/vote_svc"
)

// answerWriteFailure is what SubmitAnswers says when its upsert fails to parse.
// Matching on it is deliberately narrow: any other refusal means the fixture is
// wrong, not the backend. See answer-upsert-sql.
const answerWriteFailure = "couldn't save answer"

// allCapabilities is every capability there is.
//
// setCaps names all of them on every call because SetCapabilities only touches
// the ones the request lists: a capability left out keeps whatever value it had,
// so stating the whole set is what makes the call a declaration of a
// hackathon's state rather than a patch on top of an unknown one.
func allCapabilities() []hackEnts.Capability {
	return []hackEnts.Capability{
		hackEnts.Capability_CAPABILITY_REGISTER,
		hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
		hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES,
		hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
		hackEnts.Capability_CAPABILITY_VOTE,
		hackEnts.Capability_CAPABILITY_VIEW_RESULTS,
	}
}

// setCaps declares which capabilities a hackathon has switched on. Everything
// named is enabled, everything else disabled.
//
// This is the one call that writes both halves of a capability — the boolean on
// the state row and the casbin policy the enforcer actually reads — which is
// why the seed goes through it instead of writing either.
func (h *harness) setCaps(owner *actor, hackathonID string, on ...hackEnts.Capability) error {
	wanted := make(map[hackEnts.Capability]bool, len(on))
	for _, c := range on {
		wanted[c] = true
	}

	all := allCapabilities()
	states := make([]*hackMsgs.CapabilityState, 0, len(all))
	for _, c := range all {
		states = append(states, &hackMsgs.CapabilityState{
			Capability: c,
			Enabled:    wanted[c],
		})
	}

	_, err := h.hackathon.SetCapabilities(owner.ctx, &hackMsgs.SetCapabilitiesRequest{
		HackathonId:  hackathonID,
		Capabilities: states,
	})
	if err != nil {
		return fmt.Errorf("set capabilities: %w", err)
	}

	return nil
}

// createInvite mints one invitation to a hackathon and hands back its token.
//
// Only a private hackathon needs one: `Join` lets anybody through who can
// already read the hackathon, which on a public one is everybody. On a private
// one nobody outside can, so an invite is the only way in — see joinWithInvite.
//
// `ExpiresAt` is left unset deliberately. CreateInvite then defaults it to the
// hackathon's own `ends_at`, which is the answer the fixture wants anyway and
// the one an organizer accepting the default would get.
func (h *harness) createInvite(owner *actor, hackathonID string) (string, error) {
	resp, err := h.hackathon.CreateInvite(owner.ctx, &hackMsgs.CreateInviteRequest{
		HackathonId: hackathonID,
		Note:        ptr("Seeded invite — how the fixture's participants got in."),
		ExpiresAt:   nil,
	})
	if err != nil {
		return "", fmt.Errorf("create invite: %w", err)
	}

	return resp.GetInvite().GetToken(), nil
}

// join signs somebody up. Join always writes a waitlisted row — approval is a
// separate act — so this on its own is the fixture's waitlisted participant.
//
// It sends no answers, which only works while the hackathon asks nothing
// mandatory. Where the fixture wants both a registration form and somebody who
// never filled it in, the form is created after the signups, and the people who
// did answer send theirs with submitAnswers.
func (h *harness) join(who *actor, hackathonID string) error {
	return h.joinWithInvite(who, hackathonID, "")
}

// joinWithInvite is join, carrying an invitation.
//
// An empty token means none, which is what every public hackathon sends: Join
// only looks at the token when the hackathon is private, and admits anyone who
// can read the hackathon regardless. Pass a real one and it is the token that
// gets somebody into a hackathon they cannot see.
func (h *harness) joinWithInvite(who *actor, hackathonID, token string) error {
	// Absent rather than empty on the wire. The handler compares the token
	// against "" before parsing it as a uuid, so an empty string would take the
	// same path — but a set-but-empty optional field says the caller had a token
	// and it was blank, which is not what is being said here.
	var invite *string
	if token != "" {
		invite = ptr(token)
	}

	if _, err := h.hackathon.Join(who.ctx, &hackMsgs.JoinRequest{
		HackathonId: hackathonID,
		Answers:     nil,
		InviteToken: invite,
	}); err != nil {
		return fmt.Errorf("%s joins: %w", who.username, err)
	}

	return nil
}

// joinAndApprove signs people up and confirms them, which is what it takes to
// hold the `Member` role every capability is granted to. A participant row on
// its own leaves somebody able to do nothing, which reads as a handler bug.
func (h *harness) joinAndApprove(owner *actor, hackathonID string, who ...*actor) error {
	return h.joinAndApproveWithInvite(owner, hackathonID, "", who...)
}

// joinAndApproveWithInvite is joinAndApprove for a hackathon nobody can see.
//
// The same invitation admits everyone in `who`: an invite is a link rather than
// a per-person ticket, and one link passed around is how a private hackathon
// actually fills up.
func (h *harness) joinAndApproveWithInvite(
	owner *actor,
	hackathonID, token string,
	who ...*actor,
) error {
	for _, w := range who {
		if err := h.joinWithInvite(w, hackathonID, token); err != nil {
			return err
		}
		if _, err := h.hackathon.ApproveParticipant(owner.ctx, &hackMsgs.ApproveParticipantRequest{
			HackathonId: hackathonID,
			UserId:      w.id,
		}); err != nil {
			return fmt.Errorf("approve %s: %w", w.username, err)
		}
	}

	return nil
}

// questionSpec is one field of a registration form.
type questionSpec struct {
	key       string
	label     string
	qType     hackEnts.QuestionType
	mandatory bool
	options   []string
}

// createQuestions writes a hackathon's registration form and returns the
// question ids by key, so answers can address them by name rather than index.
//
// `order` is the slice position: the fixture never wants a gap, and deriving it
// here stops the two from disagreeing.
func (h *harness) createQuestions(
	owner *actor,
	hackathonID string,
	specs []questionSpec,
) (map[string]string, error) {
	out := make(map[string]string, len(specs))
	for i, spec := range specs {
		resp, err := h.hackathon.CreateQuestion(owner.ctx, &hackMsgs.CreateQuestionRequest{
			HackathonId: hackathonID,
			Key:         spec.key,
			Label:       spec.label,
			Type:        spec.qType,
			Mandatory:   spec.mandatory,
			Order:       int32(i + 1), //nolint:gosec // a form has a handful of fields
			Options:     spec.options,
		})
		if err != nil {
			return nil, fmt.Errorf("question %s: %w", spec.key, err)
		}
		out[spec.key] = resp.GetQuestionId()
	}

	return out, nil
}

// submitAnswers records one participant's answers to the form.
//
// This is the seed's one remaining direct write, and it is not a choice:
// **no answer can be stored through the API at all**. Both writes that exist —
// `Join` and `SubmitAnswers` — build their upsert with no conflict target, which
// Postgres rejects at parse time, so every call carrying an answer returns
// `Internal: couldn't save answer`. See
// mydocs/docs/backend-tickets/answer-upsert-sql.md, which names the three-line
// fix. Until it lands, a seed that went through SubmitAnswers would have no
// answers in it, and the registration-form fixture would be empty.
//
// So it calls SubmitAnswers anyway and only falls back to ent on exactly that
// failure. The handler validates before it writes — mandatory questions
// answered, values matching their question's type, enum values among their
// options — so a fixture answer the API would have refused still gets refused
// here, and only the broken write is worked around. The day the ticket lands
// this call succeeds, the fallback stops running, and the duplicate write shows
// up as a unique-constraint error rather than passing silently.
//
// TODO(backend: answer-upsert-sql): delete everything below the RPC call.
func (h *harness) submitAnswers(
	who *actor,
	hackathonID string,
	questions map[string]string,
	answers []answerSpec,
) error {
	req := &hackMsgs.SubmitAnswersRequest{
		HackathonId: hackathonID,
		Answers:     make([]*hackEnts.Answer, 0, len(answers)),
	}
	for _, a := range answers {
		qID, ok := questions[a.key]
		if !ok {
			return fmt.Errorf("answer for unknown question %q", a.key)
		}
		req.Answers = append(req.Answers, a.toProto(qID))
	}

	_, err := h.hackathon.SubmitAnswers(who.ctx, req)
	switch {
	case err == nil:
		// answer-upsert-sql is fixed: the handler stored them.
		return nil
	case status.Code(err) == codes.Internal &&
		strings.Contains(err.Error(), answerWriteFailure):
		// The known broken write. Everything before it passed, so the answers
		// themselves are sound — fall through and store them.
	default:
		return fmt.Errorf("answers for %s: %w", who.username, err)
	}

	userID, err := uuid.Parse(who.id)
	if err != nil {
		return fmt.Errorf("user id for %s: %w", who.username, err)
	}

	for _, a := range req.GetAnswers() {
		qID, err := uuid.Parse(a.GetQuestionId())
		if err != nil {
			return fmt.Errorf("question id in answer for %s: %w", who.username, err)
		}
		if _, err := h.db.Answer.Create().
			SetQuestionID(qID).
			SetUserID(userID).
			SetValue(answerValue(a)).
			Save(h.ctx); err != nil {
			return fmt.Errorf("answer for %s: %w", who.username, err)
		}
	}

	return nil
}

// answerValue is protoAnswerValueToDB (internal/service/mappers.go:546), which
// is unexported. Keep the two the same: it decides what an answer looks like in
// the column, and a fixture that spells a bool differently reads back as
// something no handler would have written.
func answerValue(a *hackEnts.Answer) string {
	switch v := a.GetValue().(type) {
	case *hackEnts.Answer_BoolValue:
		if v.BoolValue {
			return "true"
		}

		return "false"
	case *hackEnts.Answer_TextValue:
		return v.TextValue
	default:
		return ""
	}
}

// answerSpec is one answer, keyed by the question it belongs to.
type answerSpec struct {
	key  string
	text string
	flag bool
	// isBool picks which of the two above is meant, since a false flag and an
	// empty text are both legitimate answers.
	isBool bool
}

func text(key, value string) answerSpec {
	return answerSpec{key: key, text: value, flag: false, isBool: false}
}

func yes(key string) answerSpec {
	return answerSpec{key: key, text: "", flag: true, isBool: true}
}

func (a answerSpec) toProto(questionID string) *hackEnts.Answer {
	if a.isBool {
		return &hackEnts.Answer{
			QuestionId:    questionID,
			ParticipantId: "",
			Value:         &hackEnts.Answer_BoolValue{BoolValue: a.flag},
		}
	}

	return &hackEnts.Answer{
		QuestionId:    questionID,
		ParticipantId: "",
		Value:         &hackEnts.Answer_TextValue{TextValue: a.text},
	}
}

// phaseSpec is one phase of a hackathon.
type phaseSpec struct {
	name         string
	description  string
	startsAt     *timestamppb.Timestamp
	endsAt       *timestamppb.Timestamp
	capabilities []hackEnts.Capability
}

// createPhases writes a hackathon's phases.
//
// Each one takes two calls because Create throws its dates away — see
// mydocs/docs/backend-tickets/phase-create-drops-dates.md. Edit is what applies
// them, so a phase is created and then immediately given its window.
// TODO(backend: phase-create-drops-dates): fold this back into one Create.
func (h *harness) createPhases(
	owner *actor,
	hackathonID string,
	specs []phaseSpec,
) (map[string]string, error) {
	ids := make(map[string]string, len(specs))
	for _, spec := range specs {
		created, err := h.phase.Create(owner.ctx, &phaseMsgs.CreateRequest{
			HackathonId:  hackathonID,
			Name:         spec.name,
			Description:  spec.description,
			Capabilities: spec.capabilities,
			// Create throws these away; the Edit below is what applies them.
			StartsAt: nil,
			EndsAt:   nil,
			PageId:   nil,
		})
		if err != nil {
			return nil, fmt.Errorf("phase %s: %w", spec.name, err)
		}
		id := created.GetPhaseId()

		if _, err := h.phase.Edit(owner.ctx, &phaseMsgs.EditRequest{
			PhaseId:      id,
			StartsAt:     spec.startsAt,
			EndsAt:       spec.endsAt,
			Name:         nil,
			Description:  nil,
			PageId:       nil,
			Capabilities: nil,
		}); err != nil {
			return nil, fmt.Errorf("phase %s dates: %w", spec.name, err)
		}
		ids[spec.name] = id
	}

	return ids, nil
}

// pageSpec is one content page.
type pageSpec struct {
	title   string
	content string
	visible bool
}

// createPages writes a hackathon's pages. Order is the creation order — the
// handler assigns max(order) + 1, starting at 0.
func (h *harness) createPages(owner *actor, hackathonID string, specs []pageSpec) error {
	for _, spec := range specs {
		if _, err := h.page.Create(owner.ctx, &pageMsgs.CreateRequest{
			HackathonId: hackathonID,
			Title:       spec.title,
			Content:     spec.content,
			Visible:     spec.visible,
		}); err != nil {
			return fmt.Errorf("page %q: %w", spec.title, err)
		}
	}

	return nil
}

// trackSpec is one track.
type trackSpec struct {
	name        string
	description string
}

// createTracks writes a hackathon's tracks and returns their ids by name.
func (h *harness) createTracks(
	owner *actor,
	hackathonID string,
	specs []trackSpec,
) (map[string]string, error) {
	out := make(map[string]string, len(specs))
	for _, spec := range specs {
		resp, err := h.track.Create(owner.ctx, &trackMsgs.CreateRequest{
			HackathonId: hackathonID,
			Name:        spec.name,
			Description: spec.description,
		})
		if err != nil {
			return nil, fmt.Errorf("track %s: %w", spec.name, err)
		}
		out[spec.name] = resp.GetTrackId()
	}

	return out, nil
}

// projectSpec is one project idea.
//
// `by` is who proposes it, which is what makes them its owner — a project has
// no other way to acquire one. `approvedBy` nil leaves it proposed, which is
// the fixture for an idea still waiting on an organizer.
type projectSpec struct {
	by          *actor
	title       string
	description string
	track       string
	approvedBy  *actor
	rejectedBy  *actor
}

// proposeProjects proposes and optionally approves a hackathon's projects,
// returning their ids by title.
func (h *harness) proposeProjects(
	hackathonID string,
	tracks map[string]string,
	specs []projectSpec,
) (map[string]string, error) {
	out := make(map[string]string, len(specs))
	for _, spec := range specs {
		req := &projectMsgs.ProposeRequest{
			HackathonId: hackathonID,
			Title:       spec.title,
			Description: spec.description,
			TrackId:     nil,
			Image:       nil,
		}
		if spec.track != "" {
			trackID, ok := tracks[spec.track]
			if !ok {
				return nil, fmt.Errorf("project %q names unknown track %q", spec.title, spec.track)
			}
			req.TrackId = &trackID
		}

		resp, err := h.project.Propose(spec.by.ctx, req)
		if err != nil {
			return nil, fmt.Errorf("project %q: %w", spec.title, err)
		}
		out[spec.title] = resp.GetProjectId()

		if spec.approvedBy != nil {
			if _, err := h.project.Approve(spec.approvedBy.ctx, &projectMsgs.ApproveRequest{
				ProjectId: resp.GetProjectId(),
			}); err != nil {
				return nil, fmt.Errorf("approve %q: %w", spec.title, err)
			}
		}
		if spec.rejectedBy != nil {
			if _, err := h.project.Reject(spec.rejectedBy.ctx, &projectMsgs.RejectRequest{
				ProjectId:     resp.GetProjectId(),
				ReviewComment: nil,
			}); err != nil {
				return nil, fmt.Errorf("reject %q: %w", spec.title, err)
			}
		}
	}

	return out, nil
}

// teamSpec is one team and who is on it.
type teamSpec struct {
	name        string
	description string
	project     string
	members     []*actor
}

// createTeams creates a hackathon's teams and staffs them, returning their ids
// by name.
//
// Both calls are the owner's: `team:create` and `team:write` are granted to
// `owner` and to nobody else, and no capability widens that. A team put
// together by one of its own members is not a state the API can produce.
func (h *harness) createTeams(
	owner *actor,
	projects map[string]string,
	specs []teamSpec,
) (map[string]string, error) {
	out := make(map[string]string, len(specs))
	for _, spec := range specs {
		projectID, ok := projects[spec.project]
		if !ok {
			return nil, fmt.Errorf("team %q names unknown project %q", spec.name, spec.project)
		}

		resp, err := h.team.Create(owner.ctx, &teamMsgs.CreateRequest{
			ProjectId:   projectID,
			Name:        spec.name,
			Description: spec.description,
		})
		if err != nil {
			return nil, fmt.Errorf("team %q: %w", spec.name, err)
		}
		out[spec.name] = resp.GetTeamId()

		for _, m := range spec.members {
			if _, err := h.team.AssignUser(owner.ctx, &teamMsgs.AssignUserRequest{
				TeamId: resp.GetTeamId(),
				UserId: m.id,
			}); err != nil {
				return nil, fmt.Errorf("team %q member %s: %w", spec.name, m.username, err)
			}
		}
	}

	return out, nil
}

// submissionSpec is one submission attempt.
//
// Versions are not stated because they are not the seed's to choose: the
// handler counts what the team has already submitted for the project, so the
// order of the specs is the version order. `final` finalizes it afterwards;
// without it the submission stays a draft.
type submissionSpec struct {
	by      *actor
	team    string
	project string
	result  string
	final   bool
}

// createSubmissions writes submissions in order and returns each team's last
// one by team name — which is the submission a vote is cast on.
func (h *harness) createSubmissions(
	teams, projects map[string]string,
	specs []submissionSpec,
) (map[string]string, error) {
	latest := make(map[string]string, len(specs))
	for _, spec := range specs {
		teamID, ok := teams[spec.team]
		if !ok {
			return nil, fmt.Errorf("submission names unknown team %q", spec.team)
		}
		projectID, ok := projects[spec.project]
		if !ok {
			return nil, fmt.Errorf("submission names unknown project %q", spec.project)
		}

		req := &teamMsgs.CreateSubmissionRequest{
			TeamId:    teamID,
			ProjectId: projectID,
			Result:    nil,
		}
		if spec.result != "" {
			req.Result = &spec.result
		}

		resp, err := h.team.CreateSubmission(spec.by.ctx, req)
		if err != nil {
			return nil, fmt.Errorf("submission for %q: %w", spec.team, err)
		}
		latest[spec.team] = resp.GetId()

		if spec.final {
			if _, err := h.team.FinalizeSubmission(
				spec.by.ctx,
				&teamMsgs.FinalizeSubmissionRequest{SubmissionId: resp.GetId()},
			); err != nil {
				return nil, fmt.Errorf("finalize submission for %q: %w", spec.team, err)
			}
		}
	}

	return latest, nil
}

// setCurrentPhase declares which phase a hackathon is in.
//
// Display state only: it gates nothing, and it is deliberately independent of
// both the phase dates and the capabilities. A hackathon whose declared phase
// disagrees with the one its dates imply is a legitimate fixture — H3 is that
// case.
func (h *harness) setCurrentPhase(owner *actor, hackathonID, phaseID string) error {
	if _, err := h.hackathon.SetCurrentPhase(owner.ctx, &hackMsgs.SetCurrentPhaseRequest{
		HackathonId: hackathonID,
		PhaseId:     phaseID,
	}); err != nil {
		return fmt.Errorf("set current phase: %w", err)
	}

	return nil
}

// backdate moves a hackathon's window into the past.
//
// It exists because `Join` refuses a hackathon that has already ended, so a
// past hackathon cannot be populated as one. H3 is therefore created with a
// live window, filled, and only then moved back — which is also what actually
// happened to any real hackathon that is now over.
func (h *harness) backdate(
	owner *actor,
	hackathonID string,
	startsAt, endsAt time.Time,
) error {
	if _, err := h.hackathon.Edit(owner.ctx, &hackMsgs.EditRequest{
		HackathonId: hackathonID,
		StartsAt:    timestamppb.New(startsAt),
		EndsAt:      timestamppb.New(endsAt),
		Name:        nil,
		Description: nil,
		Visibility:  nil,
		Logo:        nil,
	}); err != nil {
		return fmt.Errorf("backdate: %w", err)
	}

	return nil
}

// voteCategorySpec is one thing people vote on.
type voteCategorySpec struct {
	name        string
	description string
	method      voteEnts.VotingMethod
	voterType   voteEnts.VoterType
}

// createVoteCategory opens a category for voting and returns its id.
func (h *harness) createVoteCategory(
	owner *actor,
	hackathonID string,
	spec voteCategorySpec,
) (string, error) {
	resp, err := h.vote.CreateVoteCategory(owner.ctx, &voteMsgs.CreateVoteCategoryRequest{
		HackathonId:   hackathonID,
		Name:          spec.name,
		Description:   spec.description,
		VotingMethod:  spec.method,
		VoterType:     spec.voterType,
		MaxPoints:     nil,
		JuryMemberIds: nil,
	})
	if err != nil {
		return "", fmt.Errorf("vote category %q: %w", spec.name, err)
	}

	return resp.GetVoteCategory().GetId(), nil
}

// submitSingleChoiceVote casts one vote.
//
// The handler refuses a vote on a submission by a team the voter belongs to, so
// who votes for what is checked here rather than merely intended.
func (h *harness) submitSingleChoiceVote(voter *actor, categoryID, submissionID string) error {
	if _, err := h.vote.SubmitVote(voter.ctx, &voteMsgs.SubmitVoteRequest{
		CategoryId: categoryID,
		Vote: &voteMsgs.SubmitVoteRequest_SingleChoice{
			SingleChoice: &voteMsgs.SingleChoiceVote{SubmissionId: submissionID},
		},
	}); err != nil {
		return fmt.Errorf("vote by %s: %w", voter.username, err)
	}

	return nil
}

// createVoteResult records a placement.
func (h *harness) createVoteResult(
	owner *actor,
	categoryID, submissionID string,
	position int32,
) error {
	if _, err := h.vote.CreateVoteResult(owner.ctx, &voteMsgs.CreateVoteResultRequest{
		CategoryId:   categoryID,
		SubmissionId: submissionID,
		Position:     position,
		Title:        nil,
	}); err != nil {
		return fmt.Errorf("vote result: %w", err)
	}

	return nil
}

// setPreference records that somebody would like to work on a project.
func (h *harness) setPreference(who *actor, projectID string) error {
	if _, err := h.project.SetPreference(who.ctx, &projectMsgs.SetPreferenceRequest{
		ProjectId: projectID,
	}); err != nil {
		return fmt.Errorf("preference for %s: %w", who.username, err)
	}

	return nil
}

// boolAnswer is `yes` when the answer might be no: a false bool is an answer,
// distinct from not having answered at all.
func boolAnswer(key string, value bool) answerSpec {
	return answerSpec{key: key, text: "", flag: value, isBool: true}
}
