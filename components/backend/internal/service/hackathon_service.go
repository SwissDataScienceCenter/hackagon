package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type HackathonService struct {
	hackathon.UnimplementedHackathonServiceServer
	dbClient *ent.Client
	enforcer *m.Enforcer
}

func NewHackathonService(dbClient *ent.Client, enf *m.Enforcer) *HackathonService {
	return &HackathonService{
		dbClient: dbClient,
		enforcer: enf,
	}
}

func visibilityFromEnt(v enthackathon.Visibility) ents.Visibility {
	switch v {
	case enthackathon.VisibilityPublic:
		return ents.Visibility_VISIBILITY_PUBLIC
	case enthackathon.VisibilityPrivate:
		return ents.Visibility_VISIBILITY_PRIVATE
	default:
		return ents.Visibility_VISIBILITY_UNSPECIFIED
	}
}

func visibilityToEnt(v ents.Visibility) (enthackathon.Visibility, bool) {
	switch v {
	case ents.Visibility_VISIBILITY_PUBLIC:
		return enthackathon.VisibilityPublic, true
	case ents.Visibility_VISIBILITY_PRIVATE:
		return enthackathon.VisibilityPrivate, true
	default:
		return "", false
	}
}

func computeHackathonStatus(startsAt, endsAt *time.Time, now time.Time) ents.HackathonStatus {
	if startsAt == nil || now.Before(*startsAt) {
		return ents.HackathonStatus_HACKATHON_STATUS_PENDING
	}
	if endsAt != nil && !now.Before(*endsAt) {
		return ents.HackathonStatus_HACKATHON_STATUS_FINISHED
	}
	return ents.HackathonStatus_HACKATHON_STATUS_ACTIVE
}

func hackathonEntryFromEnt(h *ent.Hackathon, now time.Time) *ents.Hackathon {
	e := &ents.Hackathon{
		Id:         h.ID.String(),
		Name:       h.Name,
		CreatedAt:  timestamppb.New(h.CreatedAt),
		ModifiedAt: timestamppb.New(h.ModifiedAt),
		Visibility: visibilityFromEnt(h.Visibility),
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

func trackEntryFromEnt(t *ent.Track, hackathonID uuid.UUID) *ents.Track {
	return &ents.Track{
		Id:          t.ID.String(),
		Name:        t.Name,
		Description: t.Description,
		CreatedAt:   timestamppb.New(t.CreatedAt),
		ModifiedAt:  timestamppb.New(t.ModifiedAt),
		HackathonId: hackathonID.String(),
	}
}

func projectStatusFromEnt(s string) ents.ProjectStatus {
	switch s {
	case "proposed":
		return ents.ProjectStatus_PROJECT_STATUS_PROPOSED
	case "approved":
		return ents.ProjectStatus_PROJECT_STATUS_APPROVED
	default:
		return ents.ProjectStatus_PROJECT_STATUS_UNSPECIFIED
	}
}

func projectEntryFromEnt(p *ent.Project, hackathonID uuid.UUID) *ents.Project {
	e := &ents.Project{
		Id:          p.ID.String(),
		Title:       p.Title,
		Description: p.Description,
		Status:      projectStatusFromEnt(p.Status.String()),
		CreatedAt:   timestamppb.New(p.CreatedAt),
		ModifiedAt:  timestamppb.New(p.ModifiedAt),
		HackathonId: hackathonID.String(),
		TrackId:     p.Edges.Track.ID.String(),
		CreatorId:   p.Edges.Creator.ID.String(),
	}
	if p.Image != "" {
		img := p.Image
		e.Image = &img
	}
	if p.Edges.Modifier != nil {
		mid := p.Edges.Modifier.ID.String()
		e.ModifierId = &mid
	}
	return e
}

func pageEntryFromEnt(p *ent.Page, hackathonID uuid.UUID) *ents.Page {
	e := &ents.Page{
		Id:          p.ID.String(),
		Title:       p.Title,
		Content:     p.Content,
		Visible:     p.Visible,
		Order:       int32(p.Order),
		CreatedAt:   timestamppb.New(p.CreatedAt),
		ModifiedAt:  timestamppb.New(p.ModifiedAt),
		HackathonId: hackathonID.String(),
		CreatorId:   p.Edges.Creator.ID.String(),
	}
	if p.Edges.Phase != nil {
		pid := p.Edges.Phase.ID.String()
		e.PhaseId = &pid
	}
	if p.Edges.Modifier != nil {
		mid := p.Edges.Modifier.ID.String()
		e.ModifierId = &mid
	}
	return e
}

func phaseEntryFromEnt(p *ent.Phase, hackathonID uuid.UUID) *ents.Phase {
	e := &ents.Phase{
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
	if p.Edges.Modifier != nil {
		mid := p.Edges.Modifier.ID.String()
		e.ModifierId = &mid
	}
	return e
}

func (s *HackathonService) Get(
	ctx context.Context,
	req *msgs.GetRequest,
) (*msgs.GetResponse, error) {
	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Read); err != nil {
		return nil, err
	}

	h, err := s.dbClient.Hackathon.Query().
		Where(enthackathon.IDEQ(id)).
		WithCreator().
		WithModifier().
		WithTracks().
		WithProjects(func(q *ent.ProjectQuery) { q.WithCreator().WithModifier().WithTrack() }).
		WithPages(func(q *ent.PageQuery) { q.WithCreator().WithModifier().WithPhase() }).
		WithPhases(func(q *ent.PhaseQuery) { q.WithCreator().WithModifier().WithPage() }).
		WithParticipants(func(q *ent.ParticipantQuery) { q.WithUser() }).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "hackathon %s not found", req.GetHackathonId())
		}
		slog.Error("query hackathon", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	entry := hackathonEntryFromEnt(h, time.Now())

	entry.Creator = userEntryFromEnt(h.Edges.Creator)
	if h.Edges.Modifier != nil {
		entry.Modifier = userEntryFromEnt(h.Edges.Modifier)
	}

	entry.Tracks = make([]*ents.Track, 0, len(h.Edges.Tracks))
	for _, t := range h.Edges.Tracks {
		entry.Tracks = append(entry.Tracks, trackEntryFromEnt(t, id))
	}

	entry.Projects = make([]*ents.Project, 0, len(h.Edges.Projects))
	for _, p := range h.Edges.Projects {
		entry.Projects = append(entry.Projects, projectEntryFromEnt(p, id))
	}

	entry.Pages = make([]*ents.Page, 0, len(h.Edges.Pages))
	for _, p := range h.Edges.Pages {
		entry.Pages = append(entry.Pages, pageEntryFromEnt(p, id))
	}

	entry.Phases = make([]*ents.Phase, 0, len(h.Edges.Phases))
	for _, p := range h.Edges.Phases {
		entry.Phases = append(entry.Phases, phaseEntryFromEnt(p, id))
	}

	entry.Members = make([]*ents.HackathonMember, 0, len(h.Edges.Participants))
	for _, p := range h.Edges.Participants {
		role, err := s.enforcer.GetHackathonRole(p.Edges.User.KeycloakID, id.String())
		if err != nil {
			slog.Error("get hackathon role", "err", err)
			return nil, status.Error(codes.Internal, "couldn't resolve member roles")
		}
		entry.Members = append(entry.Members, &ents.HackathonMember{
			User:      userEntryFromEnt(p.Edges.User),
			Role:      role,
			IsWaiting: p.IsWaiting,
			JoinedAt:  timestamppb.New(p.CreatedAt),
		})
	}

	return &msgs.GetResponse{Hackathon: entry}, nil
}

func (s *HackathonService) List(
	ctx context.Context,
	req *msgs.ListRequest,
) (*msgs.ListResponse, error) {
	q := s.dbClient.Hackathon.Query()
	if vf := req.GetVisibilityFilter(); vf != ents.Visibility_VISIBILITY_UNSPECIFIED {
		entV, ok := visibilityToEnt(vf)
		if !ok {
			return nil, status.Errorf(codes.InvalidArgument, "unknown visibility: %v", vf)
		}
		q = q.Where(enthackathon.VisibilityEQ(entV))
	}
	if ownerID := req.GetOwnerId(); ownerID != "" {
		uid, err := uuid.Parse(ownerID)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid owner_id: %v", ownerID)
		}
		q = q.Where(enthackathon.HasCreatorWith(entuser.IDEQ(uid)))
	}

	var participantUID *uuid.UUID
	if participantID := req.GetParticipantId(); participantID != "" {
		uid, err := uuid.Parse(participantID)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid participant_id: %v", participantID)
		}
		participantUID = &uid
		q = q.Where(enthackathon.HasParticipantsWith(entparticipant.UserIDEQ(uid))).
			WithParticipants(func(pq *ent.ParticipantQuery) {
				pq.Where(entparticipant.UserIDEQ(uid)).WithUser()
			})
	}
	hs, err := q.Order(ent.Asc(enthackathon.FieldCreatedAt)).All(ctx)
	if err != nil {
		slog.Error("query hackathon", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	now := time.Now()
	wanted := make(map[ents.HackathonStatus]struct{}, len(req.GetStatusFilter()))
	for _, sf := range req.GetStatusFilter() {
		wanted[sf] = struct{}{}
	}

	entries := make([]*ents.Hackathon, 0, len(hs))
	for _, h := range hs {
		if h.Visibility == enthackathon.VisibilityPrivate {
			ok, err := s.enforcer.Enforce(ctx, h.ID.String(), m.Hackathon, m.Read)
			if err != nil {
				slog.Error("enforce list hackathon", "err", err)
				return nil, status.Error(codes.Internal, "authorization error")
			}
			if !ok {
				continue
			}
		}
		e := hackathonEntryFromEnt(h, now)
		if len(wanted) > 0 {
			if _, ok := wanted[e.Status]; !ok {
				continue
			}
		}
		if participantUID != nil && len(h.Edges.Participants) > 0 {
			p := h.Edges.Participants[0]
			role, err := s.enforcer.GetHackathonRole(p.Edges.User.KeycloakID, h.ID.String())
			if err != nil {
				slog.Error("get hackathon role for viewer_membership", "err", err)
				return nil, status.Error(codes.Internal, "couldn't resolve member role")
			}
			e.ViewerMembership = &ents.HackathonMember{
				User:      userEntryFromEnt(p.Edges.User),
				Role:      role,
				IsWaiting: p.IsWaiting,
				JoinedAt:  timestamppb.New(p.CreatedAt),
			}
		}
		entries = append(entries, e)
	}
	return &msgs.ListResponse{Hackathons: entries}, nil
}
