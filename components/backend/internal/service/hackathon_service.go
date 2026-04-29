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
