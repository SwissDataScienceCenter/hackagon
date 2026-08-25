package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entanswer "github.com/swissdatasciencecenter/hackagon/components/backend/ent/answer"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	enthackathonstate "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonstate"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	entphase "github.com/swissdatasciencecenter/hackagon/components/backend/ent/phase"
	entquestion "github.com/swissdatasciencecenter/hackagon/components/backend/ent/question"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	userEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type HackathonService struct {
	hackathon.UnimplementedHackathonServiceServer
	dbClient *ent.Client
	enforcer *mw.Enforcer
}

func NewHackathonService(dbClient *ent.Client, enf *mw.Enforcer) *HackathonService {
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
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(ctx, "*", mw.Hackathon, mw.Create); err != nil {
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

	// set permission based on visibility
	if visibility == enthackathon.VisibilityPublic {
		_, err = s.enforcer.AllowPublicHackathonAccess(h.ID.String())
		if err != nil {
			slog.Error("create hackathon", "err", err)
			return nil, status.Error(codes.Internal, "couldn't set hackathon permission")
		}
	}

	// Create default state (all capabilities disabled).
	_, err = s.dbClient.HackathonState.Create().
		SetHackathonID(h.ID).
		SetModifier(creator).
		Save(ctx)
	if err != nil {
		slog.Error("create hackathon state", "err", err)
		// Best-effort cleanup.
		_ = s.dbClient.Hackathon.DeleteOne(h).Exec(ctx)
		return nil, status.Errorf(codes.Internal, "couldn't create hackathon state")
	}

	if _, err := s.enforcer.AddRole(uid, mw.Owner, h.ID.String()); err != nil {
		slog.Error("add hackathon owner", "err", err)
		err := s.dbClient.Hackathon.DeleteOne(h).Exec(ctx)
		if err != nil {
			slog.Error("cleanup hackathon creation error", "err", err)
		}

		return nil, status.Errorf(codes.Internal, "couldn't set hackathon owner")
	}

	// Add creator to the Owners edge so ownership is explicit in the DB.
	_, err = s.dbClient.Hackathon.UpdateOne(h).
		AddOwners(creator).
		Save(ctx)
	if err != nil {
		slog.Error("add creator to owners edge", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't add creator to owners")
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

	if err := s.enforcer.RequirePermission(ctx, id.String(), mw.Hackathon, mw.Read); err != nil {
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
		WithOwners().
		WithState().
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

	entry.Owners = make([]*userEnts.User, 0, len(h.Edges.Owners))
	for _, o := range h.Edges.Owners {
		entry.Owners = append(entry.Owners, userEntryFromEnt(o))
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

	if h.Edges.State != nil {
		entry.State = stateEntryFromEnt(h.Edges.State)
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
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	// Reject anonymous users - write operations require real authentication
	if uid == mw.AnonSubject {
		return nil, status.Error(codes.Unauthenticated, "anonymous users cannot join hackathons")
	}

	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	if err := s.enforcer.RequirePermission(ctx, id.String(), mw.Hackathon, mw.Join); err != nil {
		return nil, err
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
	participant, err := s.dbClient.Participant.Query().Where(
		entparticipant.HackathonIDEQ(id),
		entparticipant.UserID(user.ID),
	).Only(ctx)
	isMember := false
	if err == nil {
		// Already a participant - we don't need to insert, just potentially upsert answers
		isMember = true
	} else if !ent.IsNotFound(err) {
		slog.Error("check existing participant", "err", err)

		return nil, status.Error(codes.Internal, "couldn't check participant status")
	}

	// Validate answers: mandatory questions and type correctness.
	if err := s.validateAnswers(ctx, id, req.GetAnswers()); err != nil {
		return nil, err
	}

	// Create participant and answers in a transaction
	tx, err := s.dbClient.Tx(ctx)
	if err != nil {
		slog.Error("start transaction", "err", err)
		return nil, status.Error(codes.Internal, "couldn't start transaction")
	}

	if !isMember {
		participant, err = tx.Participant.Create().
			SetHackathonID(id).
			SetUserID(user.ID).
			SetIsWaiting(true).
			Save(ctx)
		if err != nil {
			_ = tx.Rollback()
			slog.Error("create participant", "err", err)
			return nil, status.Errorf(codes.Internal, "couldn't join hackathon")
		}
	}

	// Upsert answers linked to the new participant
	for _, a := range req.GetAnswers() {
		qID, _ := uuid.Parse(a.GetQuestionId())
		err := tx.Answer.Create().
			SetQuestionID(qID).
			SetUserID(participant.UserID).
			SetValue(protoAnswerValueToDB(a)).
			OnConflictColumns(entanswer.FieldQuestionID, entanswer.FieldUserID).
			UpdateNewValues().
			Exec(ctx)
		if err != nil {
			_ = tx.Rollback()
			slog.Error("upsert answer", "err", err)
			return nil, status.Error(codes.Internal, "couldn't save answer")
		}
	}

	if err := tx.Commit(); err != nil {
		slog.Error("commit transaction", "err", err)
		return nil, status.Error(codes.Internal, "couldn't commit transaction")
	}

	return &msgs.JoinResponse{HackathonId: h.ID.String()}, nil
}

func (s *HackathonService) ApproveParticipant(
	ctx context.Context,
	req *msgs.ApproveParticipantRequest,
) (*msgs.ApproveParticipantResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	// Reject anonymous users
	if uid == mw.AnonSubject {
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
	if err := s.enforcer.RequirePermission(ctx, id.String(), mw.Hackathon, mw.Write); err != nil {
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
	if _, err := s.enforcer.AddRole(user.KeycloakID, mw.Member, h.ID.String()); err != nil {
		slog.Error("add hackathon member", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't set hackathon member permission")
	}

	return &msgs.ApproveParticipantResponse{}, nil
}

func (s *HackathonService) RemoveParticipant(
	ctx context.Context,
	req *msgs.RemoveParticipantRequest,
) (*msgs.RemoveParticipantResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	// Reject anonymous users
	if uid == mw.AnonSubject {
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
	if err := s.enforcer.RequirePermission(ctx, id.String(), mw.Hackathon, mw.Write); err != nil {
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
	if _, err := s.enforcer.RemoveRole(user.KeycloakID, mw.Member, h.ID.String()); err != nil {
		slog.Error("remove hackathon member", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't remove hackathon member permission")
	}

	return &msgs.RemoveParticipantResponse{}, nil
}

func (s *HackathonService) Edit(
	ctx context.Context,
	req *msgs.EditRequest,
) (*msgs.EditResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
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
	if err := s.enforcer.RequirePermission(ctx, h.ID.String(), mw.Hackathon, mw.Write); err != nil {
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

	//nolint:nestif // Complexity is ok here.
	if req.Visibility != nil {
		if updated.Visibility == enthackathon.VisibilityPublic {
			_, err = s.enforcer.AllowPublicHackathonAccess(h.ID.String())
			if err != nil {
				slog.Error("edit hackathon", "err", err)
				return nil, status.Error(codes.Internal, "couldn't change hackathon permission")
			}
		} else {
			_, err = s.enforcer.RemovePublicHackathonAccess(h.ID.String())
			if err != nil {
				slog.Error("edit hackathon", "err", err)
				return nil, status.Error(codes.Internal, "couldn't change hackathon permission")
			}
		}
	}

	entry := hackathonEntryFromEnt(updated, time.Now())
	entry.Creator = userEntryFromEnt(updated.Edges.Creator)
	entry.Modifier = userEntryFromEnt(updated.Edges.Modifier)

	return &msgs.EditResponse{Hackathon: entry}, nil
}

func (s *HackathonService) SetCapabilities( //nolint:funlen // this is just long because of the switch
	ctx context.Context,
	req *msgs.SetCapabilitiesRequest,
) (*msgs.SetCapabilitiesResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Write permission on hackathon
	if err := s.enforcer.RequirePermission(ctx, id.String(), mw.Hackathon, mw.Write); err != nil {
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

	if len(req.GetCapabilities()) == 0 {
		// don't update if request is empty
		state, err := s.dbClient.HackathonState.Query().
			Where(
				enthackathonstate.HasHackathonWith(enthackathon.IDEQ(id)),
			).Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, status.Errorf(codes.NotFound, "hackathon state not found")
			}
			slog.Error("query updated state", "err", err)
			return nil, status.Error(codes.Internal, "couldn't query updated state")
		}

		return &msgs.SetCapabilitiesResponse{
			State: stateEntryFromEnt(state),
		}, nil
	}
	update := s.dbClient.HackathonState.Update().
		Where(enthackathonstate.HasHackathonWith(enthackathon.IDEQ(id))).
		SetModifier(user)

	var member = mw.Member

	type policyChange struct {
		enable bool
		role   *mw.Role
		obj    mw.ObjectType
		perm   mw.Permission
		opts   []mw.EnforceOption
	}

	var policyChanges []policyChange

	for _, cs := range req.GetCapabilities() {
		enabled := cs.GetEnabled()
		switch cs.GetCapability() {
		case ents.Capability_CAPABILITY_REGISTER:
			update = update.SetRegistrationsEnabled(enabled)
			policyChanges = append(
				policyChanges,
				policyChange{
					enable: enabled,
					role:   nil,
					obj:    mw.Hackathon,
					perm:   mw.Join,
					opts:   nil,
				},
			)
		case ents.Capability_CAPABILITY_VOTE:
			update = update.SetVotingEnabled(enabled)
			// Add both Vote Create and VoteCategory Read for Members
			policyChanges = append(
				policyChanges,
				policyChange{
					enable: enabled,
					role:   &member,
					obj:    mw.Vote,
					perm:   mw.Create,
					opts:   nil,
				},
			)
			policyChanges = append(
				policyChanges,
				policyChange{
					enable: enabled,
					role:   &member,
					obj:    mw.VoteCategory,
					perm:   mw.Read,
					opts:   nil,
				},
			)
			policyChanges = append(
				policyChanges,
				policyChange{
					enable: enabled,
					role:   &member,
					obj:    mw.Submission,
					perm:   mw.Read,
					opts:   nil,
				},
			)
		case ents.Capability_CAPABILITY_PROPOSE_PROJECTS:
			update = update.SetProposeProjectsEnabled(enabled)
			policyChanges = append(
				policyChanges,
				policyChange{
					enable: enabled,
					role:   &member,
					obj:    mw.Project,
					perm:   mw.Propose,
					opts:   nil,
				},
			)
		case ents.Capability_CAPABILITY_SET_TEAM_PREFERENCES:
			update = update.SetSetTeamPreferencesEnabled(enabled)
			policyChanges = append(
				policyChanges,
				policyChange{
					enable: enabled,
					role:   &member,
					obj:    mw.Project,
					perm:   mw.Join,
					opts:   nil,
				},
			)
		case ents.Capability_CAPABILITY_CREATE_PROJECT_SUBMISSIONS:
			update = update.SetCreateProjectSubmissionsEnabled(enabled)
			policyChanges = append(
				policyChanges,
				policyChange{
					enable: enabled,
					role:   &member,
					obj:    mw.Submission,
					perm:   mw.Create,
					opts:   []mw.EnforceOption{mw.WithTeam("*")},
				},
			)
		case ents.Capability_CAPABILITY_VIEW_RESULTS:
			update = update.SetViewResultsEnabled(enabled)
			policyChanges = append(
				policyChanges,
				policyChange{
					enable: enabled,
					role:   &member,
					obj:    mw.VoteResult,
					perm:   mw.Read,
					opts:   nil,
				},
			)
		case ents.Capability_CAPABILITY_UNSPECIFIED:
			return nil, status.Errorf(
				codes.InvalidArgument,
				"capability must not be UNSPECIFIED",
			)
		}
	}

	// Apply all policy changes at once
	for _, c := range policyChanges {
		if c.enable {
			if err := s.enforcer.AddPolicy(c.role, id.String(), c.obj, c.perm, c.opts...); err != nil {
				return nil, status.Errorf(
					codes.Internal,
					"couldn't add policy for %s %s",
					c.obj,
					c.perm,
				)
			}
		} else {
			if err := s.enforcer.RemovePolicy(c.role, id.String(), c.obj, c.perm, c.opts...); err != nil {
				return nil, status.Errorf(codes.Internal, "couldn't remove policy for %s %s", c.obj, c.perm)
			}
		}
	}

	_, err = update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "hackathon state not found")
		}
		slog.Error("update hackathon state", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't update hackathon state")
	}

	state, err := s.dbClient.HackathonState.Query().
		Where(
			enthackathonstate.HasHackathonWith(enthackathon.IDEQ(id)),
		).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "hackathon state not found")
		}
		slog.Error("query updated state", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query updated state")
	}

	return &msgs.SetCapabilitiesResponse{
		State: stateEntryFromEnt(state),
	}, nil
}

func (s *HackathonService) SetCurrentPhase(
	ctx context.Context,
	req *msgs.SetCurrentPhaseRequest,
) (*msgs.SetCurrentPhaseResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Write permission on hackathon
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Hackathon, mw.Write); err != nil {
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

	// Update current phase
	update := s.dbClient.HackathonState.Update().
		Where(enthackathonstate.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		SetModifier(user)
	if req.GetPhaseId() == "" { //nolint:nestif // this is not actually complex...
		update = update.ClearCurrentPhase()
	} else {
		// Verify phase exists and belongs to this hackathon
		phaseID, err := uuid.Parse(req.GetPhaseId())
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid phase_id: %v", err)
		}
		phase, err := s.dbClient.Phase.Query().
			Where(entphase.IDEQ(phaseID), entphase.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
			Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, status.Errorf(
					codes.NotFound,
					"phase %s not found or does not belong to hackathon",
					req.GetPhaseId(),
				)
			}
			slog.Error("query phase", "err", err)
			return nil, status.Error(codes.Internal, "couldn't query phase")
		}
		update = update.SetCurrentPhase(phase)
	}
	_, err = update.
		Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "hackathon state not found")
		}
		slog.Error("update hackathon state", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't update hackathon state")
	}

	state, err := s.dbClient.HackathonState.Query().
		Where(
			enthackathonstate.HasHackathonWith(enthackathon.IDEQ(hackathonID)),
		).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "hackathon state not found")
		}
		slog.Error("query updated state", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query updated state")
	}

	return &msgs.SetCurrentPhaseResponse{
		State: stateEntryFromEnt(state),
	}, nil
}

func (s *HackathonService) AddOwner(
	ctx context.Context,
	req *msgs.AddOwnerRequest,
) (*msgs.AddOwnerResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	// Reject anonymous users
	if uid == mw.AnonSubject {
		return nil, status.Error(
			codes.Unauthenticated,
			"anonymous users cannot add owners",
		)
	}

	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Write permission on hackathon
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Hackathon, mw.Write); err != nil {
		return nil, err
	}

	// Verify hackathon exists
	userId, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	h, err := s.dbClient.Hackathon.Query().
		Where(enthackathon.IDEQ(hackathonID)).
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

	// Find the user to add as owner
	user, err := s.dbClient.User.Query().Where(entuser.IDEQ(userId)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user %s not found", req.GetUserId())
		}
		slog.Error("query user to add as owner", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Add user to owners edge
	_, err = s.dbClient.Hackathon.UpdateOne(h).
		AddOwners(user).
		Save(ctx)
	if err != nil {
		slog.Error("add owner to hackathon", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't add owner to hackathon")
	}

	// Grant Owner casbin role
	if _, err := s.enforcer.AddRole(user.KeycloakID, mw.Owner, h.ID.String()); err != nil {
		slog.Error("add hackathon owner role", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't set hackathon owner permission")
	}

	return &msgs.AddOwnerResponse{}, nil
}

func (s *HackathonService) RemoveOwner(
	ctx context.Context,
	req *msgs.RemoveOwnerRequest,
) (*msgs.RemoveOwnerResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	// Reject anonymous users
	if uid == mw.AnonSubject {
		return nil, status.Error(
			codes.Unauthenticated,
			"anonymous users cannot remove owners",
		)
	}

	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Write permission on hackathon
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Hackathon, mw.Write); err != nil {
		return nil, err
	}

	// Verify hackathon exists
	userId, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
	}

	h, err := s.dbClient.Hackathon.Query().
		Where(enthackathon.IDEQ(hackathonID)).
		WithOwners().
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

	// Verify the user is an owner
	var targetOwner *ent.User
	for _, o := range h.Edges.Owners {
		if o.ID == userId {
			targetOwner = o
			break
		}
	}
	if targetOwner == nil {
		return nil, status.Errorf(
			codes.NotFound,
			"user %s is not an owner of this hackathon",
			req.GetUserId(),
		)
	}

	// Prevent removing the last owner
	if len(h.Edges.Owners) == 1 {
		return nil, status.Errorf(
			codes.FailedPrecondition,
			"cannot remove the last owner of a hackathon",
		)
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

	// Remove user from owners edge
	_, err = s.dbClient.Hackathon.UpdateOne(h).
		RemoveOwners(user).
		Save(ctx)
	if err != nil {
		slog.Error("remove owner from hackathon", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't remove owner from hackathon")
	}

	// Revoke Owner casbin role
	if _, err := s.enforcer.RemoveRole(user.KeycloakID, mw.Owner, h.ID.String()); err != nil {
		slog.Error("remove hackathon owner role", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't remove hackathon owner permission")
	}

	return &msgs.RemoveOwnerResponse{}, nil
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
		q = q.Where(enthackathon.HasOwnersWith(entuser.IDEQ(uid)))
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
			ok, err := s.enforcer.Enforce(ctx, h.ID.String(), mw.Hackathon, mw.Read)
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

// --- Registration question handlers ---

func (s *HackathonService) CreateQuestion(
	ctx context.Context,
	req *msgs.CreateQuestionRequest,
) (*msgs.CreateQuestionResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	if err := s.enforcer.RequirePermission(ctx, id.String(), mw.Hackathon, mw.Write); err != nil {
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

	// Check for duplicate key
	_, err = s.dbClient.Question.Query().Where(
		entquestion.HackathonIDEQ(id),
		entquestion.KeyEQ(req.GetKey()),
	).Only(ctx)
	if err == nil {
		return nil, status.Errorf(
			codes.AlreadyExists,
			"question with key %q already exists",
			req.GetKey(),
		)
	}
	if !ent.IsNotFound(err) {
		slog.Error("check duplicate question key", "err", err)
		return nil, status.Error(codes.Internal, "couldn't check for duplicate key")
	}

	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
		}
		slog.Error("query user", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	datatype, ok := questionTypeToEnt(req.GetType())
	if !ok {
		return nil, status.Error(codes.InvalidArgument, "unknown question type")
	}

	// ENUM questions require at least one option.
	if datatype == entquestion.DataTypeEnum && len(req.GetOptions()) == 0 {
		return nil, status.Errorf(
			codes.InvalidArgument,
			"enum questions require at least one option",
		)
	}

	q, err := s.dbClient.Question.Create().
		SetHackathonID(id).
		SetKey(req.GetKey()).
		SetLabel(req.GetLabel()).
		SetMandatory(req.GetMandatory()).
		SetDataType(datatype).
		SetOrder(int(req.GetOrder())).
		SetOptions(req.GetOptions()).
		SetCreator(user).
		SetModifier(user).
		Save(ctx)
	if err != nil {
		slog.Error("create question", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't create question in database")
	}

	return &msgs.CreateQuestionResponse{QuestionId: q.ID.String()}, nil
}

func (s *HackathonService) EditQuestion(
	ctx context.Context,
	req *msgs.EditQuestionRequest,
) (*msgs.EditQuestionResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	hackID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	if err := s.enforcer.RequirePermission(ctx, hackID.String(), mw.Hackathon, mw.Write); err != nil {
		return nil, err
	}

	qID, err := uuid.Parse(req.GetQuestionId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid question_id: %v", err)
	}

	// Verify the question exists and belongs to the hackathon
	q, err := s.dbClient.Question.Query().Where(
		entquestion.IDEQ(qID),
		entquestion.HackathonIDEQ(hackID),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "question %s not found", req.GetQuestionId())
		}
		slog.Error("query question", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Check if question has existing answers (needed for type/mandatory constraints)
	hasAnswers, err := s.dbClient.Answer.Query().Where(
		entanswer.HasQuestionWith(entquestion.IDEQ(qID)),
	).Exist(ctx)
	if err != nil {
		slog.Error("check question answers", "err", err)
		return nil, status.Error(codes.Internal, "couldn't check for existing answers")
	}

	// Validate constraint: cannot change type if answers exist
	if req.GetType() != ents.QuestionType_QUESTION_TYPE_UNSPECIFIED && hasAnswers {
		return nil, status.Errorf(
			codes.FailedPrecondition,
			"cannot change type of question with existing answers",
		)
	}

	// Validate constraint: cannot change mandatory if answers exist
	if req.Mandatory != nil && req.GetMandatory() && hasAnswers {
		return nil, status.Errorf(
			codes.FailedPrecondition,
			"cannot change mandatory of question with existing answers",
		)
	}

	// Validate constraint: cannot change options if answers exist
	if req.Options != nil && hasAnswers {
		return nil, status.Errorf(
			codes.FailedPrecondition,
			"cannot change options of question with existing answers",
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

	update := s.dbClient.Question.UpdateOne(q)
	if label := req.GetLabel(); label != "" {
		update = update.SetLabel(label)
	}
	if req.Mandatory != nil {
		update = update.SetMandatory(req.GetMandatory())
	}
	if req.Order != nil {
		update = update.SetOrder(int(req.GetOrder()))
	}
	if len(req.GetOptions()) > 0 {
		update = update.SetOptions(req.GetOptions())
	}
	update = update.SetModifier(user)

	_, err = update.Save(ctx)
	if err != nil {
		slog.Error("edit question", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't edit question")
	}

	return &msgs.EditQuestionResponse{}, nil
}

func (s *HackathonService) RemoveQuestion(
	ctx context.Context,
	req *msgs.RemoveQuestionRequest,
) (*msgs.RemoveQuestionResponse, error) {
	_, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	hackID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	if err := s.enforcer.RequirePermission(ctx, hackID.String(), mw.Hackathon, mw.Write); err != nil {
		return nil, err
	}

	qID, err := uuid.Parse(req.GetQuestionId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid question_id: %v", err)
	}

	// Verify the question exists and belongs to the hackathon
	_, err = s.dbClient.Question.Query().Where(
		entquestion.IDEQ(qID),
		entquestion.HackathonIDEQ(hackID),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "question %s not found", req.GetQuestionId())
		}
		slog.Error("query question", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Remove the question (cascade deletes answers)
	err = s.dbClient.Question.DeleteOneID(qID).Exec(ctx)
	if err != nil {
		slog.Error("remove question", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't remove question")
	}

	return &msgs.RemoveQuestionResponse{}, nil
}

func (s *HackathonService) ListQuestions(
	ctx context.Context,
	req *msgs.ListQuestionsRequest,
) (*msgs.ListQuestionsResponse, error) {
	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	if err := s.enforcer.RequirePermission(ctx, id.String(), mw.Hackathon, mw.Read); err != nil {
		return nil, err
	}

	questions, err := s.dbClient.Question.Query().Where(
		entquestion.HackathonIDEQ(id),
	).Order(entquestion.ByOrder()).All(ctx)
	if err != nil {
		slog.Error("query questions", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query questions")
	}

	entries := make([]*ents.Question, 0, len(questions))
	for _, q := range questions {
		entries = append(entries, questionEntryFromEnt(q))
	}

	return &msgs.ListQuestionsResponse{Questions: entries}, nil
}

func (s *HackathonService) SubmitAnswers(
	ctx context.Context,
	req *msgs.SubmitAnswersRequest,
) (*msgs.SubmitAnswersResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	if uid == mw.AnonSubject {
		return nil, status.Error(codes.Unauthenticated, "anonymous users cannot submit answers")
	}

	hackID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	if err := s.enforcer.RequirePermission(ctx, hackID.String(), mw.Hackathon, mw.Read); err != nil {
		return nil, err
	}

	// Verify hackathon exists
	_, err = s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(hackID)).Only(ctx)
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

	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
		}
		slog.Error("query user", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Find the participant
	participant, err := s.dbClient.Participant.Query().Where(
		entparticipant.HackathonIDEQ(hackID),
		entparticipant.UserID(user.ID),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.PermissionDenied,
				"user is not a participant in this hackathon",
			)
		}
		slog.Error("query participant", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query participant")
	}

	// Validate answers: mandatory questions and type correctness.
	if err := s.validateAnswers(ctx, hackID, req.GetAnswers()); err != nil {
		return nil, err
	}

	// Upsert answers linked to the participant
	for _, a := range req.GetAnswers() {
		qID, _ := uuid.Parse(a.GetQuestionId())
		err := s.dbClient.Answer.Create().
			SetQuestionID(qID).
			SetUserID(participant.UserID).
			SetValue(protoAnswerValueToDB(a)).
			OnConflictColumns(entanswer.FieldQuestionID, entanswer.FieldUserID).
			UpdateNewValues().
			Exec(ctx)
		if err != nil {
			slog.Error("upsert answer", "err", err)
			return nil, status.Error(codes.Internal, "couldn't save answer")
		}
	}

	return &msgs.SubmitAnswersResponse{}, nil
}

func (s *HackathonService) ListParticipantAnswers(
	ctx context.Context,
	req *msgs.ListParticipantAnswersRequest,
) (*msgs.ListParticipantAnswersResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	hackID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Get the requesting user's entity ID
	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
		}
		slog.Error("query user", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Check if user has write access
	hasWrite, err := s.enforcer.Enforce(ctx, hackID.String(), mw.Hackathon, mw.Write)
	if err != nil {
		slog.Error("enforce list participant answers", "err", err)
		return nil, status.Error(codes.Internal, "authorization error")
	}

	// Build query
	q := s.dbClient.Answer.Query().Where(
		entanswer.HasQuestionWith(
			entquestion.HasHackathonWith(enthackathon.IDEQ(hackID)),
		),
	).WithQuestion()

	if req.GetUserId() != "" {
		uidParsed, err := uuid.Parse(req.GetUserId())
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid user_id: %v", err)
		}

		if uidParsed != user.ID && !hasWrite {
			return nil, status.Error(codes.PermissionDenied, "permission denied")
		}
		q = q.Where(entanswer.HasUserWith(
			entuser.ID(uidParsed),
		))
	}
	if !hasWrite {
		// only return own user if user does not have write access
		q = q.Where(entanswer.HasUserWith(
			entuser.ID(user.ID),
		))
	}

	answers, err := q.All(ctx)
	if err != nil {
		slog.Error("query answers", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query answers")
	}

	entries := make([]*ents.Answer, 0, len(answers))
	for _, a := range answers {
		entries = append(entries, answerEntryFromEnt(a))
	}

	return &msgs.ListParticipantAnswersResponse{Answers: entries}, nil
}

// validateAnswers checks that all mandatory questions are answered and that
// each answer value matches the question type.
func (s *HackathonService) validateAnswers(
	ctx context.Context,
	hackID uuid.UUID,
	answers []*ents.Answer,
) error {
	questions, err := s.dbClient.Question.Query().Where(
		entquestion.HackathonIDEQ(hackID),
	).All(ctx)
	if err != nil {
		slog.Error("query questions", "err", err)
		return status.Error(codes.Internal, "couldn't query questions")
	}

	// Build lookup maps.
	questionByID := make(map[uuid.UUID]*ent.Question, len(questions))
	for _, q := range questions {
		questionByID[q.ID] = q
	}

	answeredIDs := make(map[uuid.UUID]struct{}, len(answers))
	for _, a := range answers {
		qID, err := uuid.Parse(a.GetQuestionId())
		if err != nil {
			return status.Errorf(
				codes.InvalidArgument,
				"invalid question_id in answer: %v",
				err,
			)
		}
		answeredIDs[qID] = struct{}{}

		// Validate the answer value matches the question type.
		q, ok := questionByID[qID]
		if !ok {
			return status.Errorf(
				codes.InvalidArgument,
				"question %s does not exist in this hackathon",
				a.GetQuestionId(),
			)
		}
		if err := validateAnswerValue(a, q.DataType, q.Options); err != nil {
			return err
		}
	}

	// Check all mandatory questions are answered.
	var missingMandatory []string
	for _, q := range questions {
		if q.Mandatory {
			if _, answered := answeredIDs[q.ID]; !answered {
				missingMandatory = append(missingMandatory, q.Key)
			}
		}
	}
	if len(missingMandatory) > 0 {
		return status.Errorf(
			codes.FailedPrecondition,
			"missing mandatory answers: %s",
			missingMandatory,
		)
	}

	return nil
}

// validateAnswerValue checks that an answer's value is compatible with the
// question's data type and, for enum questions, that the value matches one of
// the allowed options.  Returns a gRPC error when the value is invalid.
func validateAnswerValue(a *ents.Answer, dataType entquestion.DataType, options []string) error {
	switch dataType {
	case entquestion.DataTypeBool:
		_, ok := a.GetValue().(*ents.Answer_BoolValue)
		if !ok {
			return status.Errorf(
				codes.InvalidArgument,
				"question %s expects a boolean answer",
				a.GetQuestionId(),
			)
		}
		return nil
	case entquestion.DataTypeText:
		_, ok := a.GetValue().(*ents.Answer_TextValue)
		if !ok {
			return status.Errorf(
				codes.InvalidArgument,
				"question %s expects a text answer",
				a.GetQuestionId(),
			)
		}
		return nil
	case entquestion.DataTypeEnum:
		_, ok := a.GetValue().(*ents.Answer_TextValue)
		if !ok {
			return status.Errorf(
				codes.InvalidArgument,
				"question %s expects a text answer",
				a.GetQuestionId(),
			)
		}
		// Check that the answer value matches one of the allowed options.
		answerValue := a.GetTextValue()
		matched := false
		for _, opt := range options {
			if opt == answerValue {
				matched = true
				break
			}
		}
		if !matched {
			return status.Errorf(
				codes.InvalidArgument,
				"question %s does not have an option matching the answer %q",
				a.GetQuestionId(),
				answerValue,
			)
		}
		return nil
	default:
		return status.Errorf(
			codes.InvalidArgument,
			"unknown question type for question %s",
			a.GetQuestionId(),
		)
	}
}
