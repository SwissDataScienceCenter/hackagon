package service

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entcapability "github.com/swissdatasciencecenter/hackagon/components/backend/ent/capability"
	entformresponse "github.com/swissdatasciencecenter/hackagon/components/backend/ent/formresponse"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	enthackathonforms "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonforms"
	enthackathonprizes "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonprizes"
	enthackathonsettings "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonsettings"
	enthackathonwindows "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonwindows"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/capability"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	userEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
	objstore "github.com/swissdatasciencecenter/hackagon/components/backend/internal/storage"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type HackathonService struct {
	hackathon.UnimplementedHackathonServiceServer
	dbClient *ent.Client
	enforcer *m.Enforcer
	// store deletes the event's uploaded imagery when the event goes. nil when
	// no object store is configured; see purgeObjects.
	store *objstore.Client
	// ownerMu serializes owner-role writes. RemoveOwner's last-organizer guard
	// is check-then-act over casbin — read the owners, refuse if one, then
	// remove — so two owners demoting each other concurrently both counted two
	// owners, both passed, and the event ended up with none (measured live).
	// AddOwner takes the same lock so a double-add cannot slip a duplicate
	// grouping row between casbin's own check and insert.
	ownerMu sync.Mutex
	// capacityMu serializes every write to the roster a capacity decision
	// reads. Join's seat check is check-then-act — count the confirmed roster,
	// then insert — so N simultaneous Joins for the last free place all
	// counted it free and the event oversold (measured: 6 concurrent joins for
	// 1 seat confirmed 3 of them). ApproveParticipant and RemoveParticipant
	// take the same lock because they move the counts Join decides on. Same
	// single-instance limitation as ownerMu and VoteService.ballotMu.
	capacityMu sync.Mutex
}

func NewHackathonService(
	dbClient *ent.Client,
	enf *m.Enforcer,
	store *objstore.Client,
) *HackathonService {
	return &HackathonService{
		UnimplementedHackathonServiceServer: hackathon.UnimplementedHackathonServiceServer{},
		dbClient:                            dbClient,
		enforcer:                            enf,
		store:                               store,
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
	// 0 and absent both mean unlimited, and unlimited is stored as NULL so the
	// column has one spelling for it.
	if req.GetMaxParticipants() > 0 {
		q = q.SetMaxParticipants(req.GetMaxParticipants())
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

	// Create default settings (both flags false).
	_, err = s.dbClient.HackathonSettings.Create().
		SetHackathonID(h.ID).
		SetModifier(creator).
		Save(ctx)
	if err != nil {
		slog.Error("create hackathon settings", "err", err)
		// Best-effort cleanup.
		_ = s.dbClient.Hackathon.DeleteOne(h).Exec(ctx)
		return nil, status.Errorf(codes.Internal, "couldn't create hackathon settings")
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

// viewerMayOpenMemberView reports whether the caller may read the full
// hackathon tree: a non-waiting participant, a casbin Owner, or a global
// admin. Participants must be eager-loaded with their users.
func (s *HackathonService) viewerMayOpenMemberView(
	_ context.Context,
	uid string,
	h *ent.Hackathon,
) bool {
	for _, p := range h.Edges.Participants {
		if p.Edges.User != nil && p.Edges.User.KeycloakID == uid {
			if !p.IsWaiting {
				return true
			}

			break
		}
	}
	role, err := s.enforcer.GetHackathonRole(uid, h.ID.String())
	if err == nil && role == ents.HackathonRole_HACKATHON_ROLE_OWNER {
		return true
	}
	globals, err := s.enforcer.GetGlobalRoles(uid)
	if err != nil {
		return false
	}
	for _, g := range globals {
		if g == userEnts.GlobalRole_GLOBAL_ROLE_ADMIN {
			return true
		}
	}

	return false
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
			q.WithModifier().WithOpenInPhase().WithClosedInPhase()
		}).
		WithParticipants(func(q *ent.ParticipantQuery) { q.WithUser() }).
		WithSettings().
		// Carries the branding map that hackathonEntryFromEnt turns into
		// Hackathon.branding.
		WithForms().
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

	// The member view is for the confirmed roster: a Member role alone (held
	// from Join, including by waitlisted registrants) is not enough. Allow
	// non-waiting participants, hackathon owners, and global admins.
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	if !s.viewerMayOpenMemberView(ctx, uid, h) {
		return nil, status.Error(
			codes.PermissionDenied,
			"hackathon is only open to confirmed participants",
		)
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
	// Main's flat shape over the same rows — a projection, never a second
	// answer. See hackathon_state.go; it must follow the line above.
	entry.State = hackathonStateFromEntry(entry)

	if h.Edges.Settings != nil {
		entry.Settings = settingsEntryFromEnt(h.Edges.Settings)
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

	// A private hackathon is joinable only with a live invitation link.
	// Without this, privacy was discovery-only: anyone who learned the UUID
	// could join outright.
	//
	// Checked BEFORE any state check below: answering "already finished" to a
	// caller holding nothing but a guessed UUID would confirm both that the
	// private event exists and what state it is in.
	if h.Visibility != enthackathon.VisibilityPublic {
		if err := s.requireLiveInvite(ctx, id, req.GetInviteToken()); err != nil {
			return nil, err
		}
	}

	// EndsAt is Optional().Nillable(): an undated hackathon has no end, so it
	// never counts as finished — same rule computeHackathonStatus applies when
	// it only reports FINISHED for a non-nil end date.
	if h.EndsAt != nil && h.EndsAt.Before(time.Now()) {
		return nil, status.Error(codes.FailedPrecondition, "hackathon is already finished")
	}

	// MERGE NOTE (sketch): #87 (Register capability) and #78
	// (settings.registrations_enabled) both gate Join, with contradictory
	// defaults — their test suites cannot both pass with both gates active.
	// The capability governs here; settings remain editable data (see
	// EditSettings) until the team consolidates on one mechanism.
	if err := requireCapability(
		ctx, s.dbClient, s.enforcer, id, capability.Register,
	); err != nil {
		return nil, err
	}

	if err := requireWindowOpen(ctx, s.dbClient, id, windowRegistration, time.Now()); err != nil {
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

	// The seat decision and the row that takes it are one unit: everything from
	// the duplicate check through the insert runs under capacityMu, or two
	// joins racing for the last free place both count it free and the event
	// oversells. See capacity.go for the rule this section enforces.
	s.capacityMu.Lock()
	waitlisted, queuePos, err := s.joinRoster(ctx, h, user)
	s.capacityMu.Unlock()
	if err != nil {
		return nil, err
	}

	// Everyone on the roster holds the Member role; is_waiting carries the
	// approved/waitlisted distinction and gates the sensitive paths (member
	// view, voting). This lets waitlisted registrants propose projects and see
	// the private hackathons they signed up for.
	if _, err := s.enforcer.AddRole(user.KeycloakID, m.Member, h.ID.String()); err != nil {
		slog.Error("add hackathon member on join", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't set hackathon member permission")
	}

	return &msgs.JoinResponse{
		HackathonId:   h.ID.String(),
		Waitlisted:    waitlisted,
		QueuePosition: queuePos,
	}, nil
}

// joinRoster writes (or finds) the caller's participant row and reports where
// they stand: confirmed, or waitlisted at a 1-based queue position.
//
// MUST be called holding s.capacityMu — the confirmed/waiting counts it reads
// and the row it inserts are one atomic decision, and ApproveParticipant /
// RemoveParticipant move the same counts under the same lock.
func (s *HackathonService) joinRoster(
	ctx context.Context,
	h *ent.Hackathon,
	user *ent.User,
) (waitlisted bool, queuePos int32, err error) {
	// Already on the roster (approved or waitlisted): joining again is a no-op
	// that reports the current state, so a double-click and a status refresh
	// are the same request.
	existing, err := s.dbClient.Participant.Query().Where(
		entparticipant.HackathonIDEQ(h.ID),
		entparticipant.UserID(user.ID),
	).Only(ctx)
	if err == nil {
		if !existing.IsWaiting {
			return false, 0, nil
		}
		pos, err := s.queuePositionOf(ctx, h.ID, existing)
		if err != nil {
			return false, 0, err
		}

		return true, pos, nil
	}
	if !ent.IsNotFound(err) {
		slog.Error("check existing participant", "err", err)

		return false, 0, status.Error(codes.Internal, "couldn't check participant status")
	}

	confirmed, err := s.dbClient.Participant.Query().Where(
		entparticipant.HackathonIDEQ(h.ID),
		entparticipant.IsWaitingEQ(false),
	).Count(ctx)
	if err != nil {
		slog.Error("count confirmed participants", "err", err)

		return false, 0, status.Error(codes.Internal, "couldn't count participants")
	}
	waiting, err := s.dbClient.Participant.Query().Where(
		entparticipant.HackathonIDEQ(h.ID),
		entparticipant.IsWaitingEQ(true),
	).Count(ctx)
	if err != nil {
		slog.Error("count waitlisted participants", "err", err)

		return false, 0, status.Error(codes.Internal, "couldn't count participants")
	}

	waitlisted = joinLandsWaitlisted(h.MaxParticipants, confirmed, waiting)

	if _, err := s.dbClient.Participant.Create().
		SetHackathonID(h.ID).
		SetUserID(user.ID).
		SetIsWaiting(waitlisted).
		Save(ctx); err != nil {
		slog.Error("create participant", "err", err)

		return false, 0, status.Errorf(codes.Internal, "couldn't join hackathon")
	}

	if !waitlisted {
		return false, 0, nil
	}

	// Counted under the lock, so `waiting` is exactly the queue ahead of this
	// row — no re-read needed.
	return true, int32(waiting) + 1, nil
}

// queuePositionOf reports a waitlisted participant's 1-based place in the
// queue: rows that joined strictly earlier, plus one. Two rows created the
// same instant share a position, which costs a duplicate number in a corner
// case rather than an arbitrary tiebreak pretending to be an order.
func (s *HackathonService) queuePositionOf(
	ctx context.Context,
	hackathonID uuid.UUID,
	p *ent.Participant,
) (int32, error) {
	ahead, err := s.dbClient.Participant.Query().Where(
		entparticipant.HackathonIDEQ(hackathonID),
		entparticipant.IsWaitingEQ(true),
		entparticipant.CreatedAtLT(p.CreatedAt),
	).Count(ctx)
	if err != nil {
		slog.Error("count queue ahead", "err", err)

		return 0, status.Error(codes.Internal, "couldn't count participants")
	}

	return int32(ahead) + 1, nil
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

	// Update participant record to set is_waiting=false (approved). Under
	// capacityMu because this raises the confirmed count Join decides on.
	// Deliberately NO capacity refusal here: the organizer can see the room,
	// and approving past the cap is their call — the participants page shows
	// the overshoot so it is a decision, not an accident.
	s.capacityMu.Lock()
	_, err = s.dbClient.Participant.Update().
		Where(
			entparticipant.HackathonIDEQ(id),
			entparticipant.UserID(user.ID),
		).
		SetIsWaiting(false).
		Save(ctx)
	s.capacityMu.Unlock()
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

	// Delete the participant record. Under capacityMu because removing a
	// confirmed participant frees a place Join decides on. The freed place is
	// NOT handed to the next waitlisted person automatically — see capacity.go
	// for why promotion stays the organizer's move.
	s.capacityMu.Lock()
	_, err = s.dbClient.Participant.Delete().
		Where(
			entparticipant.HackathonIDEQ(id),
			entparticipant.UserID(user.ID),
		).
		Exec(ctx)
	s.capacityMu.Unlock()
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

// ownerTarget resolves the (hackathon, user) pair both owner RPCs operate on,
// after checking the caller may write to the hackathon.
//
// It insists the target is already a CONFIRMED participant. Ownership is a
// casbin fact here, and the member list is built from the participants table,
// so granting Owner to someone who never joined would create an owner nobody
// can see — absent from the roster while holding every permission on the event.
// Create guards the same invariant from the other end by inserting a
// participant row for the creator.
func (s *HackathonService) ownerTarget(
	ctx context.Context,
	hackathonID, userID string,
	anonMsg string,
) (*ent.Hackathon, *ent.User, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, nil, err
	}
	if uid == m.AnonSubject {
		return nil, nil, status.Error(codes.Unauthenticated, anonMsg)
	}

	id, err := uuid.Parse(hackathonID)
	if err != nil {
		return nil, nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
		return nil, nil, err
	}

	targetID, err := uuid.Parse(userID)
	if err != nil {
		return nil, nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	h, err := s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(id)).
		WithParticipants(func(pq *ent.ParticipantQuery) {
			pq.Where(entparticipant.UserIDEQ(targetID)).WithUser()
		}).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, nil, status.Errorf(codes.NotFound, "hackathon %s not found", hackathonID)
		}
		slog.Error("query hackathon", "err", err)

		return nil, nil, status.Error(codes.Internal, "couldn't query database")
	}

	if len(h.Edges.Participants) == 0 || h.Edges.Participants[0].Edges.User == nil {
		return nil, nil, status.Errorf(
			codes.NotFound,
			"user %s is not a participant of this hackathon",
			userID,
		)
	}
	p := h.Edges.Participants[0]
	if p.IsWaiting {
		return nil, nil, status.Error(
			codes.FailedPrecondition,
			"approve this person before making them an organizer",
		)
	}

	return h, p.Edges.User, nil
}

// AddOwner promotes a confirmed participant to co-organizer of one hackathon.
//
// Anyone who can write to the hackathon can do this, which means owners recruit
// their own co-organizers — the alternative is a global admin having to be in
// the loop for every event, which is the bottleneck this role exists to remove.
//
// Idempotent: casbin reports a duplicate grouping row as "not added" rather
// than an error, and re-promoting someone who is already an owner is a no-op
// worth succeeding at.
func (s *HackathonService) AddOwner(
	ctx context.Context,
	req *msgs.AddOwnerRequest,
) (*msgs.AddOwnerResponse, error) {
	h, user, err := s.ownerTarget(
		ctx, req.GetHackathonId(), req.GetUserId(),
		"anonymous users cannot add owners",
	)
	if err != nil {
		return nil, err
	}

	s.ownerMu.Lock()
	defer s.ownerMu.Unlock()

	if _, err := s.enforcer.AddRole(user.KeycloakID, m.Owner, h.ID.String()); err != nil {
		slog.Error("add hackathon owner role", "err", err)

		return nil, status.Error(codes.Internal, "couldn't grant hackathon owner permission")
	}

	return &msgs.AddOwnerResponse{}, nil
}

// RemoveOwner demotes a co-organizer back to ordinary member.
//
// Two things it refuses. The last owner, because an event whose every organizer
// has been demoted cannot be edited by anyone short of a global admin, and
// nothing in the UI would explain why. And a caller demoting themselves, for
// the same reason UserService.RemoveRole refuses it: the permission you are
// giving up is the one that would let you undo it.
//
// The Owner row is removed and a Member row put in its place. Without that the
// person's role resolves to UNSPECIFIED — still a participant, but rendered
// with no role at all, which reads as a corrupted record rather than a demotion.
func (s *HackathonService) RemoveOwner(
	ctx context.Context,
	req *msgs.RemoveOwnerRequest,
) (*msgs.RemoveOwnerResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	h, user, err := s.ownerTarget(
		ctx, req.GetHackathonId(), req.GetUserId(),
		"anonymous users cannot remove owners",
	)
	if err != nil {
		return nil, err
	}

	// The owners read below and the removal at the bottom are one decision:
	// without the lock, two owners demoting each other concurrently each
	// counted two owners, each passed the last-organizer guard, and the event
	// was left with none.
	s.ownerMu.Lock()
	defer s.ownerMu.Unlock()

	owners, err := s.enforcer.HackathonOwners(h.ID.String())
	if err != nil {
		slog.Error("list hackathon owners", "err", err)

		return nil, status.Error(codes.Internal, "couldn't read hackathon owners")
	}

	isOwner := false
	for _, o := range owners {
		if o == user.KeycloakID {
			isOwner = true

			break
		}
	}
	if !isOwner {
		return nil, status.Errorf(
			codes.NotFound,
			"user %s is not an owner of this hackathon",
			req.GetUserId(),
		)
	}
	if len(owners) == 1 {
		return nil, status.Error(
			codes.FailedPrecondition,
			"this is the last organizer — promote someone else first",
		)
	}
	if uid == user.KeycloakID {
		return nil, status.Error(
			codes.PermissionDenied,
			"cannot remove your own organizer role",
		)
	}

	if _, err := s.enforcer.RemoveRole(user.KeycloakID, m.Owner, h.ID.String()); err != nil {
		slog.Error("remove hackathon owner role", "err", err)

		return nil, status.Error(codes.Internal, "couldn't remove hackathon owner permission")
	}
	if _, err := s.enforcer.AddRole(user.KeycloakID, m.Member, h.ID.String()); err != nil {
		slog.Error("restore hackathon member role", "err", err)

		return nil, status.Error(codes.Internal, "couldn't restore hackathon member permission")
	}

	return &msgs.RemoveOwnerResponse{}, nil
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
	if req.MaxParticipants != nil {
		if req.GetMaxParticipants() > 0 {
			update = update.SetMaxParticipants(req.GetMaxParticipants())
		} else {
			// 0 clears back to unlimited, stored as NULL — same one spelling
			// Create uses.
			update = update.ClearMaxParticipants()
		}
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
		return nil, status.Errorf(
			codes.InvalidArgument,
			"unknown capability: %v",
			req.GetCapability(),
		)
	}
	entCapability, ok := capabilityToEnt(c)
	if !ok {
		return nil, status.Errorf(
			codes.InvalidArgument,
			"unknown capability: %v",
			req.GetCapability(),
		)
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
	if req.OpenInPhaseId != nil {
		if err := applyPhaseLink(
			ctx, s.dbClient, id, req.GetOpenInPhaseId(),
			update.ClearOpenInPhase, update.SetOpenInPhaseID,
		); err != nil {
			return nil, err
		}
	}
	if req.ClosedInPhaseId != nil {
		if err := applyPhaseLink(
			ctx, s.dbClient, id, req.GetClosedInPhaseId(),
			update.ClearClosedInPhase, update.SetClosedInPhaseID,
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
		WithOpenInPhase().
		WithClosedInPhase().
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

// SetCapabilities toggles several capabilities in one call.
//
// EditCapability is the precise instrument — one capability, optionally
// relinking its phases. This is the blunt one an organiser reaches for when
// they flip three switches on a settings screen: one intent, one request, one
// transaction. Sending three EditCapability calls instead leaves the event
// half-configured when the second fails, and the UI holding the pieces.
//
// It deliberately does NOT touch phase links. `enabled` is the authoritative
// gate; the schedule is a separate decision made on the capability itself, and
// a batch toggle that silently unlinked phases would be a trap.
func (s *HackathonService) SetCapabilities(
	ctx context.Context,
	req *msgs.SetCapabilitiesRequest,
) (*msgs.SetCapabilitiesResponse, error) {
	uid, _, err := m.RequireUser(ctx)
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

	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Resolve every requested capability BEFORE writing anything: a batch with
	// one unknown name must change nothing, not the prefix before the typo.
	wanted := make(map[entcapability.Capability]bool, len(req.GetCapabilities()))
	for _, t := range req.GetCapabilities() {
		c, ok := CapabilityFromProto(t.GetCapability())
		if !ok {
			return nil, status.Errorf(
				codes.InvalidArgument,
				"unknown capability: %v",
				t.GetCapability(),
			)
		}
		entCapability, ok := capabilityToEnt(c)
		if !ok {
			return nil, status.Errorf(
				codes.InvalidArgument,
				"unknown capability: %v",
				t.GetCapability(),
			)
		}
		wanted[entCapability] = t.GetEnabled()
	}

	// The hackathon itself, not its capabilities: the batch below CREATES a row
	// for anything ungoverned, and a create against an id that names nothing is
	// a foreign-key error rather than an answer. Asked once, here, so a caller
	// naming a hackathon that does not exist still gets NotFound about the
	// HACKATHON — which is the true statement — instead of NotFound about a
	// capability, which used to be the same reply and said the wrong thing.
	//
	// After RequirePermission on purpose: a stranger must not learn which
	// hackathon ids exist from the difference between PermissionDenied and
	// NotFound.
	exists, err := s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(id)).Exist(ctx)
	if err != nil {
		slog.Error("query hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	if !exists {
		return nil, status.Errorf(codes.NotFound, "hackathon %s not found", id)
	}

	rows, err := s.dbClient.Capability.Query().
		Where(entcapability.HasHackathonWith(enthackathon.IDEQ(id))).
		All(ctx)
	if err != nil {
		slog.Error("query capabilities", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	present := make(map[entcapability.Capability]*ent.Capability, len(rows))
	for _, row := range rows {
		present[row.Capability] = row
	}

	txn, err := s.dbClient.Tx(ctx)
	if err != nil {
		slog.Error("start transaction", "err", err)

		return nil, status.Error(codes.Internal, "couldn't start transaction")
	}
	rollback := func(cause error) {
		if rbErr := txn.Rollback(); rbErr != nil {
			slog.Error("rollback set capabilities", "err", cause, "rollback", rbErr)
		}
	}

	for c, enabled := range wanted {
		row, governed := present[c]

		// An ungoverned capability is CREATED rather than refused.
		//
		// This used to answer NotFound for the whole batch, and the organiser's
		// panel posts all six switches every save — so one absent row made the
		// entire capability screen unusable, with a 404 as the only explanation
		// and no RPC anywhere that could create the missing row. The panel had
		// grown a paragraph of copy warning about it, which is a product
		// explaining its own data gap to the person least able to close it.
		//
		// Of the three possible answers, creating is the only one that is both
		// safe and true to what the request says. SKIPPING is the dangerous one:
		// an ungoverned capability is ALLOWED (`capability.State` reports
		// UNGOVERNED and `Allowed` returns true for it), so quietly dropping a
		// row the caller asked to set to `false` would report a save that
		// changed nothing while participants kept the permission — a silent
		// no-op on a gate. REFUSING with the capability named is honest but
		// still leaves the panel dead, because there is no way to act on the
		// name. And the schema already calls a full set the invariant — "one row
		// per capability per hackathon, pre-created on hackathon creation" — so
		// a missing row is a gap (an older event, a partial restore, a
		// capability added to the enum after the event was made), never a
		// decision anyone took. `SetCapabilities` takes a whole list rather than
		// a delta, which means "these are the values afterwards"; creating what
		// is missing is what makes that sentence true.
		if !governed {
			if _, err := txn.Capability.Create().
				SetCapability(c).
				SetEnabled(enabled).
				SetHackathonID(id).
				SetModifier(user).
				Save(ctx); err != nil {
				rollback(err)
				// The unique index is `(capability, hackathon)`, so this is a
				// concurrent writer that governed it first — a real outcome, and
				// a different one from a broken request. Retrying takes the
				// UpdateOne branch.
				if ent.IsConstraintError(err) {
					return nil, status.Errorf(
						codes.Aborted,
						"another change to %s landed first; retry",
						c,
					)
				}
				slog.Error("create capability", "err", err)

				return nil, status.Error(codes.Internal, "couldn't update capabilities")
			}

			continue
		}

		// Already correct: skipping the write keeps modified_at and the modifier
		// meaningful, so "who last changed this" stays a real answer.
		if row.Enabled == enabled {
			continue
		}
		if _, err := txn.Capability.UpdateOne(row).
			SetEnabled(enabled).
			SetModifier(user).
			Save(ctx); err != nil {
			rollback(err)
			slog.Error("update capability", "err", err)

			return nil, status.Error(codes.Internal, "couldn't update capabilities")
		}
	}

	if err := txn.Commit(); err != nil {
		slog.Error("commit set capabilities", "err", err)

		return nil, status.Error(codes.Internal, "couldn't update capabilities")
	}

	statuses := s.capabilityStatuses(ctx, id)

	currentPhase := ""
	if hack, err := s.dbClient.Hackathon.Get(ctx, id); err == nil && hack.CurrentPhaseID != nil {
		currentPhase = hack.CurrentPhaseID.String()
	}

	return &msgs.SetCapabilitiesResponse{
		Capabilities: statuses,
		// The same answer in main's flat shape, projected from `statuses` rather
		// than from the booleans that came in: a capability the phase window
		// decided did not take the value the organiser sent, and echoing the
		// request would hide that. See hackathon_state.go.
		State: s.hackathonStateFacade(ctx, id, statuses, currentPhase),
	}, nil
}

// capabilityStatuses reports every capability of a hackathon the way Get does.
// Best-effort: the write already succeeded, so a read failure here costs the
// caller a refetch rather than an error on work that landed.
func (s *HackathonService) capabilityStatuses(
	ctx context.Context,
	id uuid.UUID,
) []*ents.CapabilityStatus {
	rows, err := s.dbClient.Capability.Query().
		Where(entcapability.HasHackathonWith(enthackathon.IDEQ(id))).
		WithModifier().
		WithOpenInPhase().
		WithClosedInPhase().
		All(ctx)
	if err != nil {
		slog.Error("re-query capabilities", "err", err)

		return nil
	}

	order, err := phaseOrder(ctx, s.dbClient, id)
	if err != nil {
		slog.Error("phase order for capability clock", "err", err)

		return nil
	}
	hack, err := s.dbClient.Hackathon.Get(ctx, id)
	if err != nil {
		slog.Error("query hackathon for capability clock", "err", err)

		return nil
	}

	// `capabilityStatusesFromEnt`, the same mapper Get uses, rather than one
	// status per stored row: it fills the vocabulary, reporting UNGOVERNED for a
	// capability with no row. Built from the rows alone this reply was SHORT
	// wherever Get's was six long — one handler giving two answers to "what are
	// this hackathon's capabilities", and the shorter one is the reply a client
	// gets immediately after saving.
	return capabilityStatusesFromEnt(
		rows,
		newCapabilityClock(order, hack.CurrentPhaseID),
		time.Now(),
	)
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
	// Empty means "clear the current phase" — see the proto. Handled before the
	// UUID parse, which is where this used to fail: the Clear button sends no
	// phase_id, so every press answered InvalidArgument.
	clearing := req.GetPhaseId() == ""

	var phaseID uuid.UUID
	if !clearing {
		phaseID, err = uuid.Parse(req.GetPhaseId())
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid phase_id: %v", err)
		}
	}

	if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}

	if !clearing {
		if err := phaseInHackathon(ctx, s.dbClient, id, phaseID); err != nil {
			return nil, err
		}
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
	var target int
	if !clearing {
		pos, ok := order[phaseID]
		if !ok {
			return nil, status.Errorf(codes.NotFound, "phase %s not found", req.GetPhaseId())
		}
		target = pos
	}

	rows, err := s.dbClient.Capability.Query().
		Where(entcapability.HasHackathonWith(enthackathon.IDEQ(id))).
		WithModifier().
		WithOpenInPhase().
		WithClosedInPhase().
		All(ctx)
	if err != nil {
		slog.Error("query capabilities", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Nothing to apply when clearing: advancing switches on the capabilities
	// scheduled for the target phase, and with no target there is no schedule.
	// Switching things off because someone cleared a label would be the opposite
	// of what they asked for.
	var desired map[capability.Capability]bool
	if !clearing {
		desired = capability.Advance(advanceRows(rows, order), target)
	}

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

	// ent's SetNillableX(nil) means "leave unchanged", NOT "set null" — the
	// pointer stayed put and the clear looked like it worked because the RPC
	// answered {}. Clearing has to say so explicitly.
	upd := txn.Hackathon.UpdateOneID(id)
	if clearing {
		upd = upd.ClearCurrentPhase()
	} else {
		upd = upd.SetCurrentPhaseID(phaseID)
	}
	if _, err := upd.
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
		WithOpenInPhase().
		WithClosedInPhase().
		All(ctx)
	if err != nil {
		slog.Error("re-query capabilities", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query updated capabilities")
	}

	// Clock built from the phase just declared, so the response reports states
	// consistent with the move rather than with the old dates.
	clock := newCapabilityClock(order, &phaseID)

	// Empty when clearing, not the zero UUID: a client reading
	// "00000000-0000-0000-0000-000000000000" sees a current phase that points at
	// nothing, which is worse than seeing none.
	currentPhase := ""
	if !clearing {
		currentPhase = phaseID.String()
	}

	return &msgs.AdvancePhaseResponse{
		CurrentPhaseId: currentPhase,
		Capabilities:   capabilityStatusesFromEnt(updated, clock, time.Now()),
	}, nil
}

func (s *HackathonService) EditSettings(
	ctx context.Context,
	req *msgs.EditSettingsRequest,
) (*msgs.EditSettingsResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Write permission on hackathon
	if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}

	// Ensure user exists
	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
		}
		slog.Error("query user", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Build update query
	update := s.dbClient.HackathonSettings.Update().
		Where(enthackathonsettings.HasHackathonWith(enthackathon.IDEQ(id))).
		SetModifier(user)

	if req.RegistrationsEnabled != nil {
		update = update.SetRegistrationsEnabled(req.GetRegistrationsEnabled())
	}
	if req.VotingEnabled != nil {
		update = update.SetVotingEnabled(req.GetVotingEnabled())
	}

	_, err = update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "hackathon settings not found")
		}
		slog.Error("update hackathon settings", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't update hackathon settings")
	}

	settings, err := s.dbClient.HackathonSettings.Query().
		Where(
			enthackathonsettings.HasHackathonWith(enthackathon.IDEQ(id)),
		).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "hackathon settings not found")
		}
		slog.Error("query updated settings", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query updated settings")
	}

	return &msgs.EditSettingsResponse{
		Settings: settingsEntryFromEnt(settings),
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

	// `viewer_membership` means the CALLER's relationship to each hackathon, so
	// it is resolved for any authenticated caller — not only when participant_id
	// happens to be passed, which is a FILTER and narrows the list to their own
	// events. Without this the public event page (built from an unfiltered List,
	// because Get is the member view) could never tell a member from a stranger,
	// and offered "Join" to people already in.
	//
	// One extra lookup for the caller and one eager load, both skipped for
	// anonymous callers and when participant_id already did the work.
	if participantUID == nil {
		if uid, _, err := m.RequireSubject(ctx); err == nil && uid != m.AnonSubject {
			viewer, err := s.dbClient.User.Query().
				Where(entuser.KeycloakIDEQ(uid)).
				Only(ctx)
			switch {
			case err == nil:
				participantUID = &viewer.ID
				q = q.WithParticipants(func(pq *ent.ParticipantQuery) {
					pq.Where(entparticipant.UserIDEQ(viewer.ID)).WithUser()
				})
			case ent.IsNotFound(err):
				// Authenticated in Keycloak but never registered here — a real
				// state during the first request of a new account, and simply
				// means no membership anywhere.
			default:
				slog.Error("query viewer for viewer_membership", "err", err)

				return nil, status.Error(codes.Internal, "couldn't query database")
			}
		}
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
	//
	// Forms come along for the branding map: the public event page is built
	// from List, not Get, so without this an event's own colours would never
	// reach the one page visitors actually see.
	q = q.
		WithPhases().
		WithForms().
		WithCapabilities(func(cq *ent.CapabilityQuery) {
			cq.WithModifier().WithOpenInPhase().WithClosedInPhase()
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
		// Same projection Get applies, from the same statuses, so a list and a
		// detail page cannot report different booleans for the same event.
		e.State = hackathonStateFromEntry(e)
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

// SubmitRegistrationForm records a registrant's answers to the organizer-
// defined registration form. Unknown keys, missing required fields, unknown
// consents and unticked required consents are InvalidArgument. Organizers
// may submit on_behalf_of another registrant (paper forms at check-in).
func (s *HackathonService) SubmitRegistrationForm(
	ctx context.Context,
	req *msgs.SubmitRegistrationFormRequest,
) (*msgs.SubmitRegistrationFormResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	caller, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user %s not found", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	target := caller
	if req.OnBehalfOf != nil {
		if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
			return nil, err
		}
		targetID, err := uuid.Parse(req.GetOnBehalfOf())
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid on_behalf_of: %v", err)
		}
		target, err = s.dbClient.User.Query().Where(entuser.IDEQ(targetID)).Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, status.Errorf(codes.NotFound, "user %s not found", targetID)
			}
			slog.Error("query on_behalf_of user", "err", err)

			return nil, status.Error(codes.Internal, "couldn't query database")
		}
	}

	forms, err := formsRowFor(ctx, s.dbClient, id)
	if err != nil {
		slog.Error("query hackathon forms", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	if forms == nil || len(forms.RegistrationFields) == 0 {
		return nil, status.Error(codes.FailedPrecondition, "no registration form defined")
	}

	fieldByKey := make(map[string]map[string]any, len(forms.RegistrationFields))
	for _, f := range forms.RegistrationFields {
		if k, ok := f["key"].(string); ok {
			fieldByKey[k] = f
		}
	}
	consentByKey := make(map[string]map[string]any, len(forms.RegistrationConsents))
	for _, c := range forms.RegistrationConsents {
		if k, ok := c["key"].(string); ok {
			consentByKey[k] = c
		}
	}

	responses := req.GetResponses().AsMap()
	for k := range responses {
		if _, ok := fieldByKey[k]; !ok {
			return nil, status.Errorf(codes.InvalidArgument, "unknown field %q", k)
		}
	}
	for k, f := range fieldByKey {
		if required, _ := f["required"].(bool); required {
			if _, ok := responses[k]; !ok {
				return nil, status.Errorf(codes.InvalidArgument, "missing required field %q", k)
			}
		}
	}
	consents := req.GetConsents()
	for k := range consents {
		if _, ok := consentByKey[k]; !ok {
			return nil, status.Errorf(codes.InvalidArgument, "unknown consent %q", k)
		}
	}
	for k, c := range consentByKey {
		if required, _ := c["required"].(bool); required && !consents[k] {
			return nil, status.Errorf(codes.InvalidArgument, "required consent %q not given", k)
		}
	}

	// Upsert, not insert. People correct their answers — a changed diet, a new
	// affiliation, a skill they forgot — and a form you can submit exactly once
	// makes the first typo permanent. The unique (hackathon, user) row is the
	// current state of the answers, not an append-only log.
	existing, err := s.dbClient.FormResponse.Query().
		Where(
			entformresponse.HasHackathonWith(enthackathon.IDEQ(id)),
			entformresponse.HasUserWith(entuser.IDEQ(target.ID)),
		).
		Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		slog.Error("query form response", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	if existing != nil {
		// submitted_by is re-stamped: the organizer who corrected a walk-in's
		// paper form is the one who entered THESE answers.
		updated, err := existing.Update().
			SetSubmittedByID(caller.ID).
			SetResponses(responses).
			SetConsents(consents).
			Save(ctx)
		if err != nil {
			slog.Error("update form response", "err", err)

			return nil, status.Error(codes.Internal, "couldn't store form response")
		}

		return &msgs.SubmitRegistrationFormResponse{Id: updated.ID.String()}, nil
	}

	row, err := s.dbClient.FormResponse.Create().
		SetHackathonID(id).
		SetUserID(target.ID).
		SetSubmittedByID(caller.ID).
		SetResponses(responses).
		SetConsents(consents).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			// Lost a race with a concurrent first submit; the other one won and
			// the answers are on file either way.
			return nil, status.Error(codes.AlreadyExists, "registration form already submitted")
		}
		slog.Error("create form response", "err", err)

		return nil, status.Error(codes.Internal, "couldn't store form response")
	}

	return &msgs.SubmitRegistrationFormResponse{Id: row.ID.String()}, nil
}

// GetRegistrationResponse reads back the answers on file so a registrant can
// review and correct them.
//
// No casbin check for the caller's OWN answers: the form is their personal
// data, and Get-level hackathon permission is the wrong gate — waitlisted
// users are denied there and are exactly who still needs to see their form.
// Reading someone ELSE's answers requires hackathon Write.
func (s *HackathonService) GetRegistrationResponse(
	ctx context.Context,
	req *msgs.GetRegistrationResponseRequest,
) (*msgs.GetRegistrationResponseResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	caller, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user %s not found", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	targetID := caller.ID
	if req.UserId != nil {
		parsed, err := uuid.Parse(req.GetUserId())
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}
		if parsed != caller.ID {
			if err := s.enforcer.RequirePermission(
				ctx, id.String(), m.Hackathon, m.Write,
			); err != nil {
				return nil, err
			}
		}
		targetID = parsed
	}

	row, err := s.dbClient.FormResponse.Query().
		Where(
			entformresponse.HasHackathonWith(enthackathon.IDEQ(id)),
			entformresponse.HasUserWith(entuser.IDEQ(targetID)),
		).
		WithSubmittedBy().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			// Not an error: "you have not filled this in yet" is a normal
			// state the form page renders as an empty form.
			return &msgs.GetRegistrationResponseResponse{Submitted: false}, nil
		}
		slog.Error("query form response", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	responses, err := structpb.NewStruct(row.Responses)
	if err != nil {
		slog.Error("encode form responses", "err", err)

		return nil, status.Error(codes.Internal, "couldn't encode form response")
	}

	out := &msgs.GetRegistrationResponseResponse{
		Submitted: true,
		Responses: responses,
		Consents:  row.Consents,
	}
	out.SubmittedAt = timestamppb.New(row.CreatedAt)
	out.ModifiedAt = timestamppb.New(row.ModifiedAt)
	if sb := row.Edges.SubmittedBy; sb != nil && sb.ID != targetID {
		submitter := sb.ID.String()
		out.SubmittedById = &submitter
	}

	return out, nil
}

// ListRegistrationResponses returns every submitted registration form for one
// hackathon.
//
// Organizer-only. GetRegistrationResponse lets you read your OWN answers and
// requires hackathon Write to read anyone else's; reading the whole cohort is
// the second case for every row at once, so it takes Write and nothing else.
// A fellow member is refused here exactly as they are refused there.
func (s *HackathonService) ListRegistrationResponses(
	ctx context.Context,
	req *msgs.ListRegistrationResponsesRequest,
) (*msgs.ListRegistrationResponsesResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	if uid == m.AnonSubject {
		return nil, status.Error(codes.Unauthenticated, "authentication required")
	}

	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}

	rows, err := s.dbClient.FormResponse.Query().
		Where(entformresponse.HasHackathonWith(enthackathon.IDEQ(id))).
		WithUser().
		All(ctx)
	if err != nil {
		slog.Error("query form responses", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	out := make([]*msgs.RegistrationResponseEntry, 0, len(rows))
	for _, r := range rows {
		if r.Edges.User == nil {
			// The edge is Required, so this cannot happen through the API. It
			// is skipped rather than nil-dereferenced because a corrupt row
			// should cost that row, not the organiser's whole page.
			slog.Error("form response without user", "response_id", r.ID)

			continue
		}
		responses, err := structpb.NewStruct(r.Responses)
		if err != nil {
			slog.Error("encode form responses", "response_id", r.ID, "err", err)

			continue
		}
		out = append(out, &msgs.RegistrationResponseEntry{
			UserId:      r.Edges.User.ID.String(),
			Responses:   responses,
			Consents:    r.Consents,
			SubmittedAt: timestamppb.New(r.CreatedAt),
			ModifiedAt:  timestamppb.New(r.ModifiedAt),
		})
	}

	return &msgs.ListRegistrationResponsesResponse{Responses: out}, nil
}

// Delete removes a hackathon and its owned configuration rows. Content-heavy
// hackathons (projects, teams, votes) are out of scope for now — this serves
// the cleanup of drafts that never went live; richer cascades belong to a
// dedicated archival flow.
func (s *HackathonService) Delete(
	ctx context.Context,
	req *msgs.DeleteRequest,
) (*msgs.DeleteResponse, error) {
	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}

	exists, err := s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(id)).Exist(ctx)
	if err != nil {
		slog.Error("query hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	if !exists {
		return nil, status.Errorf(codes.NotFound, "hackathon %s not found", id)
	}

	// Owned configuration and roster rows first, then the hackathon itself.
	pred := enthackathon.IDEQ(id)
	if _, err := s.dbClient.Capability.Delete().
		Where(entcapability.HasHackathonWith(pred)).Exec(ctx); err != nil {
		slog.Error("delete capabilities", "err", err)

		return nil, status.Error(codes.Internal, "couldn't delete hackathon")
	}
	for name, del := range map[string]func() (int, error){
		"settings": func() (int, error) {
			return s.dbClient.HackathonSettings.Delete().
				Where(enthackathonsettings.HasHackathonWith(pred)).Exec(ctx)
		},
		"windows": func() (int, error) {
			return s.dbClient.HackathonWindows.Delete().
				Where(enthackathonwindows.HasHackathonWith(pred)).Exec(ctx)
		},
		"forms": func() (int, error) {
			return s.dbClient.HackathonForms.Delete().
				Where(enthackathonforms.HasHackathonWith(pred)).Exec(ctx)
		},
		"form responses": func() (int, error) {
			return s.dbClient.FormResponse.Delete().
				Where(entformresponse.HasHackathonWith(pred)).Exec(ctx)
		},
		"prizes": func() (int, error) {
			return s.dbClient.HackathonPrizes.Delete().
				Where(enthackathonprizes.HasHackathonWith(pred)).Exec(ctx)
		},
		"participants": func() (int, error) {
			return s.dbClient.Participant.Delete().
				Where(entparticipant.HackathonIDEQ(id)).Exec(ctx)
		},
	} {
		if _, err := del(); err != nil {
			slog.Error("delete hackathon dependents", "kind", name, "err", err)

			return nil, status.Error(codes.Internal, "couldn't delete hackathon")
		}
	}

	if err := s.dbClient.Hackathon.DeleteOneID(id).Exec(ctx); err != nil {
		if ent.IsConstraintError(err) {
			return nil, status.Error(codes.FailedPrecondition,
				"hackathon still has content (projects, pages, or teams); archive it instead")
		}
		slog.Error("delete hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't delete hackathon")
	}

	// Only now, and never before: an event that is gone must not leave its
	// gallery reachable at a guessable URL, but a purge that ran first and then
	// hit a failed delete would leave rows pointing at objects already gone.
	// Every key this event owns is under its id, so one prefix is the whole of
	// it — no manifest to keep in sync. Failure logs and does not propagate.
	purgeObjects(ctx, s.store, hackathonPrefix+id.String()+"/")

	return &msgs.DeleteResponse{}, nil
}
