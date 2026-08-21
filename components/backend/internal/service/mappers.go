package service

import (
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entquestion "github.com/swissdatasciencecenter/hackagon/components/backend/ent/question"
	entvote "github.com/swissdatasciencecenter/hackagon/components/backend/ent/vote"
	entvotecategory "github.com/swissdatasciencecenter/hackagon/components/backend/ent/votecategory"
	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	userEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
	voteEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote/entities"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func userEntryFromEnt(u *ent.User) *userEnts.User {
	return &userEnts.User{
		Id:          u.ID.String(),
		Username:    u.Username,
		KeycloakId:  u.KeycloakID,
		DisplayName: u.DisplayName,
		Email:       u.Email,
		CreatedAt:   timestamppb.New(u.CreatedAt),
		ModifiedAt:  timestamppb.New(u.ModifiedAt),
	}
}

func VisibilityFromEnt(v enthackathon.Visibility) hackEnts.Visibility {
	switch v {
	case enthackathon.VisibilityPublic:
		return hackEnts.Visibility_VISIBILITY_PUBLIC
	case enthackathon.VisibilityPrivate:
		return hackEnts.Visibility_VISIBILITY_PRIVATE
	default:
		return hackEnts.Visibility_VISIBILITY_UNSPECIFIED
	}
}

func VisibilityToEnt(v hackEnts.Visibility) (enthackathon.Visibility, bool) {
	switch v {
	case hackEnts.Visibility_VISIBILITY_PUBLIC:
		return enthackathon.VisibilityPublic, true
	case hackEnts.Visibility_VISIBILITY_PRIVATE:
		return enthackathon.VisibilityPrivate, true
	case hackEnts.Visibility_VISIBILITY_UNSPECIFIED:
		return "", false
	default:
		return "", false
	}
}

func computeHackathonStatus(startsAt, endsAt *time.Time, now time.Time) hackEnts.HackathonStatus {
	if startsAt == nil || now.Before(*startsAt) {
		return hackEnts.HackathonStatus_HACKATHON_STATUS_PENDING
	}
	if endsAt != nil && !now.Before(*endsAt) {
		return hackEnts.HackathonStatus_HACKATHON_STATUS_FINISHED
	}

	return hackEnts.HackathonStatus_HACKATHON_STATUS_ACTIVE
}

func hackathonEntryFromEnt(h *ent.Hackathon, now time.Time) *hackEnts.Hackathon {
	e := &hackEnts.Hackathon{
		Id:         h.ID.String(),
		Name:       h.Name,
		CreatedAt:  timestamppb.New(h.CreatedAt),
		ModifiedAt: timestamppb.New(h.ModifiedAt),
		Visibility: VisibilityFromEnt(h.Visibility),
		Status:     computeHackathonStatus(h.StartsAt, h.EndsAt, now),
	}
	if h.StartsAt != nil {
		e.StartsAt = timestamppb.New(*h.StartsAt)
	}
	if h.EndsAt != nil {
		e.EndsAt = timestamppb.New(*h.EndsAt)
	}
	if h.Description != "" {
		d := h.Description
		e.Description = &d
	}
	if h.Logo != "" {
		l := h.Logo
		e.Logo = &l
	}

	return e
}

func trackEntryFromEnt(t *ent.Track, hackathonID uuid.UUID) *hackEnts.Track {
	return &hackEnts.Track{
		Id:          t.ID.String(),
		Name:        t.Name,
		Description: t.Description,
		CreatedAt:   timestamppb.New(t.CreatedAt),
		ModifiedAt:  timestamppb.New(t.ModifiedAt),
		HackathonId: hackathonID.String(),
	}
}

func projectStatusFromEnt(s string) hackEnts.ProjectStatus {
	switch s {
	case "proposed":
		return hackEnts.ProjectStatus_PROJECT_STATUS_PROPOSED
	case "approved":
		return hackEnts.ProjectStatus_PROJECT_STATUS_APPROVED
	default:
		return hackEnts.ProjectStatus_PROJECT_STATUS_UNSPECIFIED
	}
}

func projectEntryFromEnt(p *ent.Project, hackathonID uuid.UUID) *hackEnts.Project {
	trackID := ""
	if p.Edges.Track != nil {
		trackID = p.Edges.Track.ID.String()
	}
	e := &hackEnts.Project{
		Id:          p.ID.String(),
		Title:       p.Title,
		Description: p.Description,
		Status:      projectStatusFromEnt(p.Status.String()),
		CreatedAt:   timestamppb.New(p.CreatedAt),
		ModifiedAt:  timestamppb.New(p.ModifiedAt),
		HackathonId: hackathonID.String(),
		TrackId:     trackID,
		CreatorId:   p.Edges.Creator.ID.String(),
	}
	if p.Image != "" {
		img := p.Image
		e.Image = &img
	}
	e.ModifierId = p.Edges.Modifier.ID.String()

	return e
}

func projectWithPreferencesEntryFromEnt(
	p *ent.Project,
	hackathonID uuid.UUID,
) *hackEnts.ProjectWithPreferences {
	e := &hackEnts.ProjectWithPreferences{
		Id:          p.ID.String(),
		Title:       p.Title,
		Description: p.Description,
		Status:      projectStatusFromEnt(string(p.Status)),
		CreatedAt:   timestamppb.New(p.CreatedAt),
		ModifiedAt:  timestamppb.New(p.ModifiedAt),
		HackathonId: hackathonID.String(),
	}
	if p.Edges.Track != nil {
		trackID := p.Edges.Track.ID.String()
		e.TrackId = trackID
	}
	if p.Image != "" {
		e.Image = &p.Image
	}
	if len(p.Edges.PreferredByUsers) > 0 {
		e.Preferences = make([]*userEnts.User, 0, len(p.Edges.PreferredByUsers))
		for _, u := range p.Edges.PreferredByUsers {
			e.Preferences = append(e.Preferences, userEntryFromEnt(u))
		}
	}

	return e
}

func pageEntryFromEnt(p *ent.Page, hackathonID uuid.UUID) *hackEnts.Page {
	e := &hackEnts.Page{
		Id:      p.ID.String(),
		Title:   p.Title,
		Content: p.Content,
		Visible: p.Visible,
		Order: int32(
			p.Order, //nolint:gosec // G115: Order is a bounded position index, overflow not possible
		),
		CreatedAt:   timestamppb.New(p.CreatedAt),
		ModifiedAt:  timestamppb.New(p.ModifiedAt),
		HackathonId: hackathonID.String(),
		CreatorId:   p.Edges.Creator.ID.String(),
	}
	if p.Edges.Phase != nil {
		pid := p.Edges.Phase.ID.String()
		e.PhaseId = &pid
	}
	e.ModifierId = p.Edges.Modifier.ID.String()

	return e
}

func submissionStatusFromEnt(s string) hackEnts.SubmissionStatus {
	switch s {
	case "draft":
		return hackEnts.SubmissionStatus_SUBMISSION_STATUS_DRAFT
	case "final":
		return hackEnts.SubmissionStatus_SUBMISSION_STATUS_FINAL
	default:
		return hackEnts.SubmissionStatus_SUBMISSION_STATUS_UNSPECIFIED
	}
}

func submissionEntryFromEnt(s *ent.Submission) *hackEnts.Submission {
	e := &hackEnts.Submission{
		Id:         s.ID.String(),
		Status:     submissionStatusFromEnt(s.Status.String()),
		Version:    int32(s.Version),
		CreatedAt:  timestamppb.New(s.CreatedAt),
		ModifiedAt: timestamppb.New(s.ModifiedAt),
		TeamId:     s.Edges.Team.ID.String(),
		ProjectId:  s.Edges.Project.ID.String(),
		CreatorId:  s.Edges.Creator.ID.String(),
	}
	if s.Result != "" {
		res := s.Result
		e.Result = &res
	}
	if s.Edges.Modifier != nil {
		modID := s.Edges.Modifier.ID.String()
		e.ModifierId = &modID
	}
	return e
}

func teamEntryFromEnt(t *ent.Team) *hackEnts.Team {
	e := &hackEnts.Team{
		Id:         t.ID.String(),
		Name:       t.Name,
		CreatedAt:  timestamppb.New(t.CreatedAt),
		ModifiedAt: timestamppb.New(t.ModifiedAt),
		ProjectId:  t.Edges.Project.ID.String(),
		CreatorId:  t.Edges.Creator.ID.String(),
	}
	if t.Description != "" {
		d := t.Description
		e.Description = &d
	}
	if t.Edges.Modifier != nil {
		modID := t.Edges.Modifier.ID.String()
		e.ModifierId = &modID
	}
	if len(t.Edges.Members) > 0 {
		e.Members = make([]*userEnts.User, 0, len(t.Edges.Members))
		for _, u := range t.Edges.Members {
			e.Members = append(e.Members, userEntryFromEnt(u))
		}
	}
	if len(t.Edges.Submissions) > 0 {
		e.Submissions = make([]*hackEnts.Submission, 0, len(t.Edges.Submissions))
		for _, s := range t.Edges.Submissions {
			e.Submissions = append(e.Submissions, submissionEntryFromEnt(s))
		}
	}

	return e
}

func phaseEntryFromEnt(p *ent.Phase, hackathonID uuid.UUID) *hackEnts.Phase {
	e := &hackEnts.Phase{
		Id:          p.ID.String(),
		Name:        p.Name,
		CreatedAt:   timestamppb.New(p.CreatedAt),
		ModifiedAt:  timestamppb.New(p.ModifiedAt),
		HackathonId: hackathonID.String(),
		CreatorId:   p.Edges.Creator.ID.String(),
	}
	if p.Description != "" {
		d := p.Description
		e.Description = &d
	}
	if p.StartsAt != nil {
		e.StartsAt = timestamppb.New(*p.StartsAt)
	}
	if p.EndsAt != nil {
		e.EndsAt = timestamppb.New(*p.EndsAt)
	}
	if p.Edges.Page != nil {
		pid := p.Edges.Page.ID.String()
		e.PageId = &pid
	}
	e.ModifierId = p.Edges.Modifier.ID.String()
	if len(p.Capabilities) > 0 {
		e.Capabilities = make([]hackEnts.Capability, len(p.Capabilities))
		for i, c := range p.Capabilities {
			e.Capabilities[i] = dbCapabilityToProto(c)
		}
	}

	return e
}

// dbCapabilityToProto converts a DB string capability to proto enum.
func dbCapabilityToProto(s string) hackEnts.Capability {
	switch s {
	case "register":
		return hackEnts.Capability_CAPABILITY_REGISTER
	case "propose_projects":
		return hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS
	case "set_team_preferences":
		return hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES
	case "create_project_submissions":
		return hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS
	case "vote":
		return hackEnts.Capability_CAPABILITY_VOTE
	case "view_results":
		return hackEnts.Capability_CAPABILITY_VIEW_RESULTS
	default:
		return hackEnts.Capability_CAPABILITY_UNSPECIFIED
	}
}

func stateEntryFromEnt(s *ent.HackathonState) *hackEnts.HackathonState {
	var currentPhaseID string
	if s.CurrentPhaseID != uuid.Nil {
		currentPhaseID = s.CurrentPhaseID.String()
	}

	return &hackEnts.HackathonState{
		Id:             s.ID.String(),
		CreatedAt:      timestamppb.New(s.CreatedAt),
		ModifiedAt:     timestamppb.New(s.ModifiedAt),
		CurrentPhaseId: currentPhaseID,
		Capabilities: []*hackEnts.CapabilityState{
			{Capability: hackEnts.Capability_CAPABILITY_REGISTER, Enabled: s.RegistrationsEnabled},
			{Capability: hackEnts.Capability_CAPABILITY_VOTE, Enabled: s.VotingEnabled},
			{
				Capability: hackEnts.Capability_CAPABILITY_PROPOSE_PROJECTS,
				Enabled:    s.ProposeProjectsEnabled,
			},
			{
				Capability: hackEnts.Capability_CAPABILITY_SET_TEAM_PREFERENCES,
				Enabled:    s.SetTeamPreferencesEnabled,
			},
			{
				Capability: hackEnts.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS,
				Enabled:    s.CreateProjectSubmissionsEnabled,
			},
			{
				Capability: hackEnts.Capability_CAPABILITY_VIEW_RESULTS,
				Enabled:    s.ViewResultsEnabled,
			},
		},
	}
}

func votingMethodFromEnt(v entvotecategory.VotingMethod) voteEnts.VotingMethod {
	switch v {
	case entvotecategory.VotingMethodSingleChoice:
		return voteEnts.VotingMethod_VOTING_METHOD_SINGLE_CHOICE
	case entvotecategory.VotingMethodRanked:
		return voteEnts.VotingMethod_VOTING_METHOD_RANKED
	case entvotecategory.VotingMethodPoints:
		return voteEnts.VotingMethod_VOTING_METHOD_POINTS
	default:
		return voteEnts.VotingMethod_VOTING_METHOD_UNSPECIFIED
	}
}

func votingMethodToEnt(v voteEnts.VotingMethod) (entvotecategory.VotingMethod, bool) {
	switch v {
	case voteEnts.VotingMethod_VOTING_METHOD_UNSPECIFIED:
		return "", false
	case voteEnts.VotingMethod_VOTING_METHOD_SINGLE_CHOICE:
		return entvotecategory.VotingMethodSingleChoice, true
	case voteEnts.VotingMethod_VOTING_METHOD_RANKED:
		return entvotecategory.VotingMethodRanked, true
	case voteEnts.VotingMethod_VOTING_METHOD_POINTS:
		return entvotecategory.VotingMethodPoints, true
	default:
		return "", false
	}
}

func voterTypeFromEnt(v entvotecategory.VoterType) voteEnts.VoterType {
	switch v {
	case entvotecategory.VoterTypeAllParticipants:
		return voteEnts.VoterType_VOTER_TYPE_ALL_PARTICIPANTS
	case entvotecategory.VoterTypeJury:
		return voteEnts.VoterType_VOTER_TYPE_JURY
	default:
		return voteEnts.VoterType_VOTER_TYPE_UNSPECIFIED
	}
}

func voterTypeToEnt(v voteEnts.VoterType) (entvotecategory.VoterType, bool) {
	switch v {
	case voteEnts.VoterType_VOTER_TYPE_UNSPECIFIED:
		return "", false
	case voteEnts.VoterType_VOTER_TYPE_ALL_PARTICIPANTS:
		return entvotecategory.VoterTypeAllParticipants, true
	case voteEnts.VoterType_VOTER_TYPE_JURY:
		return entvotecategory.VoterTypeJury, true
	default:
		return "", false
	}
}

func voteCategoryEntryFromEnt(c *ent.VoteCategory) *voteEnts.VoteCategory {
	entry := &voteEnts.VoteCategory{
		Id:           c.ID.String(),
		Name:         c.Name,
		VotingMethod: votingMethodFromEnt(c.VotingMethod),
		VoterType:    voterTypeFromEnt(c.VoterType),
		CreatedAt:    c.CreatedAt.Unix(),
		ModifiedAt:   c.ModifiedAt.Unix(),
	}
	if c.Description != "" {
		entry.Description = c.Description
	}
	if c.MaxPoints != 0 {
		v := int32(c.MaxPoints)
		entry.MaxPoints = &v
	}
	if c.Edges.Hackathon != nil {
		entry.HackathonId = c.Edges.Hackathon.ID.String()
	}
	if len(c.Edges.JuryMembers) > 0 {
		entry.JuryMembers = make([]*userEnts.User, 0, len(c.Edges.JuryMembers))
		for _, u := range c.Edges.JuryMembers {
			entry.JuryMembers = append(entry.JuryMembers, userEntryFromEnt(u))
		}
	}
	return entry
}

func voteEntryFromEnt(v *ent.Vote) *voteEnts.Vote {
	entry := &voteEnts.Vote{
		Id:         v.ID.String(),
		CreatedAt:  v.CreatedAt.Unix(),
		ModifiedAt: v.ModifiedAt.Unix(),
	}
	if v.Edges.Category != nil {
		entry.CategoryId = v.Edges.Category.ID.String()
	}
	if v.Edges.Voter != nil {
		entry.VoterId = v.Edges.Voter.KeycloakID
	}
	var submissionID string
	if v.Edges.Submission != nil {
		submissionID = v.Edges.Submission.ID.String()
	}
	switch v.VoteType {
	case entvote.VoteTypeSingleChoice:
		if submissionID != "" {
			entry.Vote = &voteEnts.Vote_SingleChoice{
				SingleChoice: &voteEnts.SingleChoiceVote{
					SubmissionId: submissionID,
				},
			}
		}
	case entvote.VoteTypeRanked:
		if submissionID != "" {
			entry.Vote = &voteEnts.Vote_Ranked{
				Ranked: &voteEnts.RankedVote{
					SubmissionId: submissionID,
					Rank:         int32(v.Value),
				},
			}
		}
	case entvote.VoteTypePoints:
		if submissionID != "" {
			entry.Vote = &voteEnts.Vote_Points{
				Points: &voteEnts.PointsVote{
					SubmissionId: submissionID,
					Points:       int32(v.Value),
				},
			}
		}
	}
	return entry
}

func voteResultEntryFromEnt(r *ent.VoteResult) *voteEnts.VoteResult {
	entry := &voteEnts.VoteResult{
		Id:         r.ID.String(),
		Position:   int32(r.Position),
		CreatedAt:  r.CreatedAt.Unix(),
		ModifiedAt: r.ModifiedAt.Unix(),
	}
	if r.Edges.VoteCategory != nil {
		entry.CategoryId = r.Edges.VoteCategory.ID.String()
	}
	if r.Edges.Submission != nil {
		entry.SubmissionId = r.Edges.Submission.ID.String()
	}
	if r.Title != "" {
		entry.Title = &r.Title
	}
	return entry
}

func questionTypeToEnt(t hackEnts.QuestionType) (entquestion.DataType, bool) {
	switch t {
	case hackEnts.QuestionType_QUESTION_TYPE_UNSPECIFIED:
		return "", false
	case hackEnts.QuestionType_QUESTION_TYPE_TEXT:
		return entquestion.DataTypeText, true
	case hackEnts.QuestionType_QUESTION_TYPE_BOOL:
		return entquestion.DataTypeBool, true
	default:
		return "", false
	}
}

func questionTypeFromEnt(t entquestion.DataType) hackEnts.QuestionType {
	switch t {
	case entquestion.DataTypeText:
		return hackEnts.QuestionType_QUESTION_TYPE_TEXT
	case entquestion.DataTypeBool:
		return hackEnts.QuestionType_QUESTION_TYPE_BOOL
	default:
		return hackEnts.QuestionType_QUESTION_TYPE_UNSPECIFIED
	}
}

func questionEntryFromEnt(q *ent.Question) *hackEnts.Question {
	return &hackEnts.Question{
		Id:        q.ID.String(),
		Key:       q.Key,
		Label:     q.Label,
		Type:      questionTypeFromEnt(q.DataType),
		Mandatory: q.Mandatory,
		Order:     int32(q.Order),
	}
}

func answerEntryFromEnt(a *ent.Answer) *hackEnts.Answer {
	return &hackEnts.Answer{
		QuestionId:    a.QuestionID.String(),
		ParticipantId: a.UserID.String(),
		Value:         a.Value,
	}
}
