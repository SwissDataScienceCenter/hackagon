package service

import (
	"time"

	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// The public projection: what a visitor with no account is shown, defined in
// one file so the question "what does the public see?" has one answer.
//
// Every function here builds its message field by field from scratch. None of
// them copies a participant-facing message and clears things, and that
// direction is the point: a field added to the Hackathon, Team or Project
// messages tomorrow is absent from the public view until somebody comes here
// and adds it deliberately.
//
// These return the Public* message family, which has no user type anywhere in
// it, so none of them can leak an email address or a Keycloak id even by
// mistake. See api/proto/hackathon/entities/public_hackathon.proto.

// publicHackathonSummaryFromEnt maps one row of the public directory.
func publicHackathonSummaryFromEnt(
	h *ent.Hackathon,
	now time.Time,
) *ents.PublicHackathonSummary {
	return &ents.PublicHackathonSummary{
		Id:          h.ID.String(),
		Name:        h.Name,
		Description: h.Description,
		Status:      computeHackathonStatus(h.StartsAt, h.EndsAt, now),
		Logo:        optionalString(h.Logo),
		StartsAt:    optionalTime(h.StartsAt),
		EndsAt:      optionalTime(h.EndsAt),
	}
}

// publicHackathonFromEnt maps one public hackathon and everything published
// about it.
func publicHackathonFromEnt(
	h *ent.Hackathon,
	teams []*ent.Team,
	now time.Time,
) *ents.PublicHackathon {
	e := &ents.PublicHackathon{
		Id:          h.ID.String(),
		Name:        h.Name,
		Description: h.Description,
		Status:      computeHackathonStatus(h.StartsAt, h.EndsAt, now),
		Logo:        optionalString(h.Logo),
		StartsAt:    optionalTime(h.StartsAt),
		EndsAt:      optionalTime(h.EndsAt),
		Pages:       make([]*ents.PublicPage, 0, len(h.Edges.Pages)),
		Tracks:      make([]*ents.PublicTrack, 0, len(h.Edges.Tracks)),
		Phases:      make([]*ents.PublicPhase, 0, len(h.Edges.Phases)),
		Projects:    make([]*ents.PublicProject, 0, len(h.Edges.Projects)),
		Teams:       make([]*ents.PublicTeam, 0, len(teams)),
	}

	for _, p := range h.Edges.Pages {
		e.Pages = append(e.Pages, publicPageFromEnt(p))
	}
	for _, t := range h.Edges.Tracks {
		e.Tracks = append(e.Tracks, publicTrackFromEnt(t))
	}
	for _, p := range h.Edges.Phases {
		e.Phases = append(e.Phases, publicPhaseFromEnt(p))
	}
	for _, p := range h.Edges.Projects {
		e.Projects = append(e.Projects, publicProjectFromEnt(p))
	}
	for _, t := range teams {
		e.Teams = append(e.Teams, publicTeamFromEnt(t))
	}

	return e
}

// publicPageFromEnt maps a page the organizers have published.
func publicPageFromEnt(p *ent.Page) *ents.PublicPage {
	// Computed before the literal so the message is built once and returned,
	// rather than assigned and then corrected.
	var phaseID *string
	if p.Edges.Phase != nil {
		phaseID = optionalString(p.Edges.Phase.ID.String())
	}

	return &ents.PublicPage{
		Id:      p.ID.String(),
		Title:   p.Title,
		Content: p.Content,
		//nolint:gosec // page ordering will never overflow an int32
		Order:   int32(p.Order),
		PhaseId: phaseID,
	}
}

func publicTrackFromEnt(t *ent.Track) *ents.PublicTrack {
	return &ents.PublicTrack{
		Id:          t.ID.String(),
		Name:        t.Name,
		Description: t.Description,
	}
}

// publicPhaseFromEnt maps a phase without its capabilities.
func publicPhaseFromEnt(p *ent.Phase) *ents.PublicPhase {
	return &ents.PublicPhase{
		Id:          p.ID.String(),
		Name:        p.Name,
		Description: optionalString(p.Description),
		StartsAt:    optionalTime(p.StartsAt),
		EndsAt:      optionalTime(p.EndsAt),
	}
}

// publicProjectFromEnt maps an approved project.
func publicProjectFromEnt(p *ent.Project) *ents.PublicProject {
	// A project need not sit in a track.
	trackID := ""
	if p.Edges.Track != nil {
		trackID = p.Edges.Track.ID.String()
	}

	return &ents.PublicProject{
		Id:          p.ID.String(),
		Title:       p.Title,
		Description: p.Description,
		Image:       optionalString(p.Image),
		TrackId:     trackID,
	}
}

// publicTeamFromEnt maps a team as a count of people rather than a list of
// them.
func publicTeamFromEnt(t *ent.Team) *ents.PublicTeam {
	projectID := ""
	if t.Edges.Project != nil {
		projectID = t.Edges.Project.ID.String()
	}

	submissions := make([]*ents.PublicSubmission, 0, len(t.Edges.Submissions))
	for _, s := range t.Edges.Submissions {
		submissions = append(submissions, publicSubmissionFromEnt(s))
	}

	return &ents.PublicTeam{
		Id:          t.ID.String(),
		Name:        t.Name,
		Description: optionalString(t.Description),
		ProjectId:   projectID,
		//nolint:gosec // a team will never have more than an int32 of members
		MemberCount: int32(len(t.Edges.Members)),
		Submissions: submissions,
	}
}

// publicSubmissionFromEnt maps a submission a team has marked final.
func publicSubmissionFromEnt(s *ent.Submission) *ents.PublicSubmission {
	return &ents.PublicSubmission{
		Id:        s.ID.String(),
		Result:    optionalString(s.Result),
		CreatedAt: timestamppb.New(s.CreatedAt),
	}
}
