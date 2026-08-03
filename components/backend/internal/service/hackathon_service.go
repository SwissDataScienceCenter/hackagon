package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entcapability "github.com/swissdatasciencecenter/hackagon/components/backend/ent/capability"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/capability"
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

	// One row per capability, so the hackathon states its policy explicitly
	// rather than being ambiguously ungoverned, and every later edit is a plain
	// update instead of an upsert. See defaultCapabilityEnabled for the default.
	if err := createDefaultCapabilities(ctx, s.dbClient, h.ID, creator); err != nil {
		slog.Error("create hackathon capabilities", "err", err)
		if err := s.dbClient.Hackathon.DeleteOne(h).Exec(ctx); err != nil {
			slog.Error("cleanup hackathon creation error", "err", err)
		}

		return nil, status.Errorf(codes.Internal, "couldn't create hackathon capabilities")
	}

	if _, err := s.enforcer.AddRole(uid, m.Owner, h.ID.String()); err != nil {
		slog.Error("add hackathon owner", "err", err)
		err := s.dbClient.Hackathon.DeleteOne(h).Exec(ctx)
		if err != nil {
			slog.Error("cleanup hackathon creation error", "err", err)
		}

		return nil, status.Errorf(codes.Internal, "couldn't set hackathon owner")
	}

	// The casbin role above carries permissions only. Membership is read from the
	// participants table — Get builds members from it, and List filters on it —
	// so without this row the creator would be an owner nobody can see: absent
	// from members, and their own hackathon missing from their dashboard.
	if _, err := s.dbClient.Participant.Create().
		SetHackathonID(h.ID).
		SetUserID(creator.ID).
		SetIsWaiting(false).
		Save(ctx); err != nil {
		slog.Error("add creator as participant", "err", err)
		if _, rerr := s.enforcer.RemoveRole(uid, m.Owner, h.ID.String()); rerr != nil {
			slog.Error("cleanup hackathon owner role", "err", rerr)
		}
		if derr := s.dbClient.Hackathon.DeleteOne(h).Exec(ctx); derr != nil {
			slog.Error("cleanup hackathon creation error", "err", derr)
		}

		return nil, status.Errorf(codes.Internal, "couldn't add creator as participant")
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
		WithCapabilities(func(q *ent.CapabilityQuery) {
			q.WithModifier().WithOpensPhase().WithClosesPhase()
		}).
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

	// One instant for the whole response, so the status badge and the capability
	// states cannot disagree about what time it is.
	now := time.Now()
	entry := hackathonEntryFromEnt(h, now)

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

	// The organizer's declared phase outranks the dates when resolving COMING,
	// so the clock has to reach the mapper.
	clock := newCapabilityClock(phaseOrderFrom(h.Edges.Phases), h.CurrentPhaseID)
	entry.Capabilities = capabilityStatusesFromEnt(h.Edges.Capabilities, clock, now)

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

	if h.EndsAt.Before(time.Now()) {
		return nil, status.Error(codes.FailedPrecondition, "hackathon is already finished")
	}

	if err := requireCapability(
		ctx, s.dbClient, s.enforcer, id, capability.Register,
	); err != nil {
		return nil, err
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
	userId, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}
	h, err := s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(id)).WithParticipants(
		func(pq *ent.ParticipantQuery) {
			pq.Where(entparticipant.UserIDEQ(userId)).WithUser()
		},
	).Only(ctx)
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
	if len(h.Edges.Participants) == 0 {
		return nil, status.Errorf(codes.NotFound, "Participant %s not found", userId)
	}

	// Find the user to approve
	user, err := s.dbClient.User.Query().Where(entuser.IDEQ(userId)).Only(ctx)
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
	if _, err := s.enforcer.AddRole(user.KeycloakID, m.Member, h.ID.String()); err != nil {
		slog.Error("add hackathon member", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't set hackathon member permission")
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
	userId, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}
	h, err := s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(id)).
		WithParticipants(
			func(pq *ent.ParticipantQuery) {
				pq.Where(entparticipant.UserIDEQ(userId)).WithUser()
			},
		).Only(ctx)
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
	if len(h.Edges.Participants) == 0 {
		return nil, status.Errorf(codes.NotFound, "Participant %s not found", userId)
	}

	// Find the user to remove
	user, err := s.dbClient.User.Query().Where(entuser.IDEQ(userId)).Only(ctx)
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
	if _, err := s.enforcer.RemoveRole(user.KeycloakID, m.Member, h.ID.String()); err != nil {
		slog.Error("remove hackathon member", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't remove hackathon member permission")
	}

	return &msgs.RemoveParticipantResponse{}, nil
}

func (s *HackathonService) Edit(
	ctx context.Context,
	req *msgs.EditRequest,
) (*msgs.EditResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Get the hackathon to verify it exists and find its ID for permission checks
	h, err := s.dbClient.Hackathon.Query().
		Where(enthackathon.IDEQ(id)).
		WithCreator().
		WithModifier().
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

	// Check Write permission on hackathon
	if err := s.enforcer.RequirePermission(ctx, h.ID.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}

	// Ensure user exists and get their entity ID
	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Build the update query with only provided fields
	update := s.dbClient.Hackathon.Update().
		Where(enthackathon.IDEQ(id)).
		SetModifier(user)

	if req.Name != nil {
		update = update.SetName(req.GetName())
	}
	if req.Description != nil {
		update = update.SetDescription(req.GetDescription())
	}
	if req.Visibility != nil {
		entVis, ok := VisibilityToEnt(req.GetVisibility())
		if !ok {
			return nil, status.Errorf(
				codes.InvalidArgument,
				"unknown visibility: %s",
				req.GetVisibility().String(),
			)
		}
		update = update.SetVisibility(entVis)
	}
	if req.GetStartsAt() != nil {
		update = update.SetStartsAt(req.GetStartsAt().AsTime())
	}
	if req.GetEndsAt() != nil {
		update = update.SetEndsAt(req.GetEndsAt().AsTime())
	}
	if req.Logo != nil {
		update = update.SetLogo(req.GetLogo())
	}

	_, err = update.Save(ctx)
	if err != nil {
		slog.Error("update hackathon", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't update hackathon in database")
	}

	// Fetch the updated hackathon with creator and modifier
	updated, err := s.dbClient.Hackathon.Query().
		Where(enthackathon.IDEQ(id)).
		WithCreator().
		WithModifier().
		Only(ctx)
	if err != nil {
		slog.Error("query updated hackathon", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query updated hackathon")
	}

	entry := hackathonEntryFromEnt(updated, time.Now())
	entry.Creator = userEntryFromEnt(updated.Edges.Creator)
	entry.Modifier = userEntryFromEnt(updated.Edges.Modifier)

	return &msgs.EditResponse{Hackathon: entry}, nil
}

// EditCapability opens or closes one member-facing action.
//
// Only the flag is mutable: the capability itself identifies the row, and rows
// are pre-created with the hackathon, so this is deliberately an update and
// never an upsert.
func (s *HackathonService) EditCapability(
	ctx context.Context,
	req *msgs.EditCapabilityRequest,
) (*msgs.EditCapabilityResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}

	c, ok := CapabilityFromProto(req.GetCapability())
	if !ok {
		return nil, status.Errorf(codes.InvalidArgument, "unknown capability: %v", req.GetCapability())
	}
	entCapability, ok := capabilityToEnt(c)
	if !ok {
		return nil, status.Errorf(codes.InvalidArgument, "unknown capability: %v", req.GetCapability())
	}

	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Fetch first so a hackathon with no row for this capability reports
	// NotFound rather than silently updating zero rows.
	row, err := s.dbClient.Capability.Query().
		Where(
			entcapability.HasHackathonWith(enthackathon.IDEQ(id)),
			entcapability.CapabilityEQ(entCapability),
		).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"hackathon %s has no %s capability",
				req.GetHackathonId(), c,
			)
		}
		slog.Error("query capability", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	update := row.Update().SetModifier(user)

	if req.Enabled != nil {
		update = update.SetEnabled(req.GetEnabled())
	}

	// Empty string unlinks, a UUID links, unset leaves it alone. Linking never
	// opens anything — only `enabled` does — so these are safe to set at any time.
	if req.OpensPhaseId != nil {
		if err := applyPhaseLink(
			ctx, s.dbClient, id, req.GetOpensPhaseId(),
			update.ClearOpensPhase, update.SetOpensPhaseID,
		); err != nil {
			return nil, err
		}
	}
	if req.ClosesPhaseId != nil {
		if err := applyPhaseLink(
			ctx, s.dbClient, id, req.GetClosesPhaseId(),
			update.ClearClosesPhase, update.SetClosesPhaseID,
		); err != nil {
			return nil, err
		}
	}

	if _, err := update.Save(ctx); err != nil {
		slog.Error("update capability", "err", err)

		return nil, status.Error(codes.Internal, "couldn't update capability")
	}

	// Re-query: Save() returns no edges, and the response reports the schedule.
	updated, err := s.dbClient.Capability.Query().
		Where(entcapability.IDEQ(row.ID)).
		WithModifier().
		WithOpensPhase().
		WithClosesPhase().
		Only(ctx)
	if err != nil {
		slog.Error("re-query capability", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query updated capability")
	}

	order, err := phaseOrder(ctx, s.dbClient, id)
	if err != nil {
		return nil, err
	}
	hack, err := s.dbClient.Hackathon.Get(ctx, id)
	if err != nil {
		slog.Error("query hackathon for capability clock", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	return &msgs.EditCapabilityResponse{
		Capability: capabilityStatusFromEnt(
			updated,
			newCapabilityClock(order, hack.CurrentPhaseID),
			time.Now(),
		),
	}, nil
}

// AdvancePhase declares which phase a hackathon is now in, and switches its
// scheduled capabilities to match.
//
// One control instead of six checkboxes, because organizers reach for this at
// the busiest moment of an event. `enabled` stays the authoritative gate — this
// writes those flags rather than introducing a second source of truth, so every
// enforcement site keeps reading a single boolean.
//
// Capabilities with no opening phase are left exactly as they are. That is what
// keeps voting, which opens abruptly and by hand, immune to advancing.
func (s *HackathonService) AdvancePhase(
	ctx context.Context,
	req *msgs.AdvancePhaseRequest,
) (*msgs.AdvancePhaseResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	phaseID, err := uuid.Parse(req.GetPhaseId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid phase_id: %v", err)
	}

	if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}

	if err := phaseInHackathon(ctx, s.dbClient, id, phaseID); err != nil {
		return nil, err
	}

	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	order, err := phaseOrder(ctx, s.dbClient, id)
	if err != nil {
		return nil, err
	}
	target, ok := order[phaseID]
	if !ok {
		return nil, status.Errorf(codes.NotFound, "phase %s not found", req.GetPhaseId())
	}

	rows, err := s.dbClient.Capability.Query().
		Where(entcapability.HasHackathonWith(enthackathon.IDEQ(id))).
		WithModifier().
		WithOpensPhase().
		WithClosesPhase().
		All(ctx)
	if err != nil {
		slog.Error("query capabilities", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	desired := capability.Advance(advanceRows(rows, order), target)

	txn, err := s.dbClient.Tx(ctx)
	if err != nil {
		slog.Error("start transaction", "err", err)

		return nil, status.Error(codes.Internal, "couldn't start transaction")
	}
	rollback := func(cause error) {
		if rbErr := txn.Rollback(); rbErr != nil {
			slog.Error("rollback advance phase", "err", cause, "rollback", rbErr)
		}
	}

	for _, row := range rows {
		want, scheduled := desired[capability.Capability(row.Capability)]
		// Unscheduled, or already correct. Skipping the write keeps modified_at
		// and the modifier meaningful, and makes re-advancing a true no-op.
		if !scheduled || row.Enabled == want {
			continue
		}
		if _, err := txn.Capability.UpdateOne(row).
			SetEnabled(want).
			SetModifier(user).
			Save(ctx); err != nil {
			rollback(err)
			slog.Error("update capability during advance", "err", err)

			return nil, status.Error(codes.Internal, "couldn't update capabilities")
		}
	}

	if _, err := txn.Hackathon.UpdateOneID(id).
		SetCurrentPhaseID(phaseID).
		SetModifier(user).
		Save(ctx); err != nil {
		rollback(err)
		slog.Error("set current phase", "err", err)

		return nil, status.Error(codes.Internal, "couldn't set current phase")
	}

	if err := txn.Commit(); err != nil {
		slog.Error("commit advance phase", "err", err)

		return nil, status.Error(codes.Internal, "couldn't commit transaction")
	}

	updated, err := s.dbClient.Capability.Query().
		Where(entcapability.HasHackathonWith(enthackathon.IDEQ(id))).
		WithModifier().
		WithOpensPhase().
		WithClosesPhase().
		All(ctx)
	if err != nil {
		slog.Error("re-query capabilities", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query updated capabilities")
	}

	// Clock built from the phase just declared, so the response reports states
	// consistent with the move rather than with the old dates.
	clock := newCapabilityClock(order, &phaseID)

	return &msgs.AdvancePhaseResponse{
		CurrentPhaseId: phaseID.String(),
		Capabilities:   capabilityStatusesFromEnt(updated, clock, time.Now()),
	}, nil
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
	// Capabilities and phases, so a list can gate its own buttons instead of
	// firing a mutation to discover it is closed.
	//
	// Phases come too, not just the linked ones: resolving COMING for a hackathon
	// an organizer has advanced compares phase *positions*, which needs the whole
	// ordering. Without them a list would resolve COMING from dates while the
	// detail page resolved it from position, and the two would disagree.
	//
	// Four extra queries regardless of how many hackathons come back, since ent
	// batches each eager load.
	q = q.
		WithPhases().
		WithCapabilities(func(cq *ent.CapabilityQuery) {
			cq.WithModifier().WithOpensPhase().WithClosesPhase()
		})

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
		// Resolved after the status filter so skipped hackathons cost nothing.
		// Same clock as Get builds, which is what keeps the two agreeing.
		e.Capabilities = capabilityStatusesFromEnt(
			h.Edges.Capabilities,
			newCapabilityClock(phaseOrderFrom(h.Edges.Phases), h.CurrentPhaseID),
			now,
		)
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
