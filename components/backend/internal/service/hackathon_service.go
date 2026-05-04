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
		UnimplementedHackathonServiceServer: hackathon.UnimplementedHackathonServiceServer{},
		dbClient:                            dbClient,
		enforcer:                            enf,
	}
}

func (s *HackathonService) Create(
	ctx context.Context,
	req *msgs.CreateRequest,
) (*msgs.CreateResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(ctx, "*", m.Hackathon, m.Create); err != nil {
		return nil, err
	}

	creator, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
	}

	visibility, ok := VisibilityToEnt(req.GetVisibility())
	if !ok {
		return nil, status.Errorf(
			codes.InvalidArgument,
			"unknown visibility: %s",
			req.GetVisibility().String(),
		)
	}

	q := s.dbClient.Hackathon.Create().
		SetName(req.GetName()).
		SetVisibility(visibility).
		SetCreator(creator).
		SetModifier(creator)
	if desc := req.GetDescription(); desc != "" {
		q = q.SetNillableDescription(&desc)
	}
	if req.GetStartsAt() != nil {
		q = q.SetStartsAt(req.GetStartsAt().AsTime())
	}
	if req.GetEndsAt() != nil {
		q = q.SetEndsAt(req.GetEndsAt().AsTime())
	}
	if req.GetLogo() != "" {
		q = q.SetLogo(req.GetLogo())
	}
	h, err := q.Save(ctx)
	if err != nil {
		slog.Error("create hackathon", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't create hackathon in database")
	}

	if _, err := s.enforcer.AddRole(uid, m.Owner.String(), h.ID.String()); err != nil {
		slog.Error("add hackathon owner", "err", err)
		err := s.dbClient.Hackathon.DeleteOne(h).Exec(ctx)
		if err != nil {
			slog.Error("cleanup hackathon creation error", "err", err)
		}

		return nil, status.Errorf(codes.Internal, "couldn't set hackathon owner")
	}

	return &msgs.CreateResponse{HackathonId: h.ID.String()}, nil
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
			return nil, status.Errorf(
				codes.NotFound,
				"hackathon %s not found",
				req.GetHackathonId(),
			)
		}
		slog.Error("query hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	entry := hackathonEntryFromEnt(h, time.Now())

	entry.Creator = userEntryFromEnt(h.Edges.Creator)
	entry.Modifier = userEntryFromEnt(h.Edges.Modifier)

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

func (s *HackathonService) Join(
	ctx context.Context,
	req *msgs.JoinRequest,
) (*msgs.JoinResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	// Reject anonymous users - write operations require real authentication
	if uid == m.AnonSubject {
		return nil, status.Error(codes.Unauthenticated, "anonymous users cannot join hackathons")
	}

	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check if hackathon exists and get it
	h, err := s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(id)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"hackathon %s not found",
				req.GetHackathonId(),
			)
		}
		slog.Error("query hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// First ensure user exists and get their entity ID
	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user %s not found", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Check if user already exists in hackathon (approved or waitlisted)
	_, err = s.dbClient.Participant.Query().Where(
		entparticipant.HackathonIDEQ(id),
		entparticipant.UserID(user.ID),
	).Only(ctx)
	if err == nil {
		// Already a participant - return success with existing hackathon ID
		return &msgs.JoinResponse{HackathonId: h.ID.String()}, nil
	}
	if !ent.IsNotFound(err) {
		slog.Error("check existing participant", "err", err)

		return nil, status.Error(codes.Internal, "couldn't check participant status")
	}

	// User doesn't have a participant record - create new participant with is_waiting=true (pending approval)
	_, err = s.dbClient.Participant.Create().
		SetHackathonID(id).
		SetUserID(user.ID).
		SetIsWaiting(true).
		Save(ctx)
	if err != nil {
		slog.Error("create participant", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't join hackathon")
	}

	return &msgs.JoinResponse{HackathonId: h.ID.String()}, nil
}

func (s *HackathonService) ApproveParticipant(
	ctx context.Context,
	req *msgs.ApproveParticipantRequest,
) (*msgs.ApproveParticipantResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	// Reject anonymous users
	if uid == m.AnonSubject {
		return nil, status.Error(
			codes.Unauthenticated,
			"anonymous users cannot remove participants",
		)
	}

	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Write permission on hackathon
	if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}

	// Verify hackathon exists
	_, err = s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(id)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"hackathon %s not found",
				req.GetHackathonId(),
			)
		}
		slog.Error("query hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Find the user to approve by keycloak ID
	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(req.GetUserId())).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user %s not found", req.GetUserId())
		}
		slog.Error("query user to approve", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Update participant record to set is_waiting=false (approved)
	_, err = s.dbClient.Participant.Update().
		Where(
			entparticipant.HackathonIDEQ(id),
			entparticipant.UserID(user.ID),
		).
		SetIsWaiting(false).
		Save(ctx)
	if err != nil {
		slog.Error("update participant", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't approve participant")
	}

	return &msgs.ApproveParticipantResponse{}, nil
}

func (s *HackathonService) RemoveParticipant(
	ctx context.Context,
	req *msgs.RemoveParticipantRequest,
) (*msgs.RemoveParticipantResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	// Reject anonymous users
	if uid == m.AnonSubject {
		return nil, status.Error(
			codes.Unauthenticated,
			"anonymous users cannot remove participants",
		)
	}

	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Write permission on hackathon (owners/organizers only)
	if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}

	// Verify hackathon exists
	_, err = s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(id)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"hackathon %s not found",
				req.GetHackathonId(),
			)
		}
		slog.Error("query hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Find the user to remove by keycloak ID
	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(req.GetUserId())).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user %s not found", req.GetUserId())
		}
		slog.Error("query user to remove", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Delete the participant record
	_, err = s.dbClient.Participant.Delete().
		Where(
			entparticipant.HackathonIDEQ(id),
			entparticipant.UserID(user.ID),
		).
		Exec(ctx)
	if err != nil {
		slog.Error("delete participant", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't remove participant")
	}

	return &msgs.RemoveParticipantResponse{}, nil
}

func (s *HackathonService) List(
	ctx context.Context,
	req *msgs.ListRequest,
) (*msgs.ListResponse, error) {
	q := s.dbClient.Hackathon.Query()
	if vf := req.GetVisibilityFilter(); vf != ents.Visibility_VISIBILITY_UNSPECIFIED {
		entV, ok := VisibilityToEnt(vf)
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
			return nil, status.Errorf(
				codes.InvalidArgument,
				"invalid participant_id: %v",
				participantID,
			)
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
			if _, ok := wanted[e.GetStatus()]; !ok {
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
