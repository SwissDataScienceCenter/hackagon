package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"log/slog"
	"strconv"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	enthackathonforms "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonforms"
	enthackathonsettings "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonsettings"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	entsubmission "github.com/swissdatasciencecenter/hackagon/components/backend/ent/submission"
	entteam "github.com/swissdatasciencecenter/hackagon/components/backend/ent/team"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	entvote "github.com/swissdatasciencecenter/hackagon/components/backend/ent/vote"
	entvotecategory "github.com/swissdatasciencecenter/hackagon/components/backend/ent/votecategory"
	entvoteresult "github.com/swissdatasciencecenter/hackagon/components/backend/ent/voteresult"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/capability"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	userEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
	vote "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote"
	voteEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote/entities"
	voteMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote/messages/vote_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type VoteService struct {
	vote.UnimplementedVoteServiceServer
	dbClient *ent.Client
	enforcer *m.Enforcer
}

func NewVoteService(dbClient *ent.Client, enf *m.Enforcer) *VoteService {
	return &VoteService{
		UnimplementedVoteServiceServer: vote.UnimplementedVoteServiceServer{},
		dbClient:                       dbClient,
		enforcer:                       enf,
	}
}

// ─── Enum mappers ────────────────────────────────────────────────────

func votingMethodToEnt(v voteEnts.VotingMethod) (votecategoryMethod, bool) {
	switch v {
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

func votingMethodFromEnt(v votecategoryMethod) voteEnts.VotingMethod {
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

func voterTypeToEnt(v voteEnts.VoterType) (votecategoryVoter, bool) {
	switch v {
	case voteEnts.VoterType_VOTER_TYPE_ALL_PARTICIPANTS:
		return entvotecategory.VoterTypeAllParticipants, true
	case voteEnts.VoterType_VOTER_TYPE_JURY:
		return entvotecategory.VoterTypeJury, true
	default:
		return "", false
	}
}

func voterTypeFromEnt(v votecategoryVoter) voteEnts.VoterType {
	switch v {
	case entvotecategory.VoterTypeAllParticipants:
		return voteEnts.VoterType_VOTER_TYPE_ALL_PARTICIPANTS
	case entvotecategory.VoterTypeJury:
		return voteEnts.VoterType_VOTER_TYPE_JURY
	default:
		return voteEnts.VoterType_VOTER_TYPE_UNSPECIFIED
	}
}

// Aliases keep the mapper signatures readable.
type (
	votecategoryMethod = entvotecategory.VotingMethod
	votecategoryVoter  = entvotecategory.VoterType
)

// ─── Entity mappers ──────────────────────────────────────────────────

// voteCategoryEntryFromEnt maps an ent VoteCategory (with Hackathon and
// JuryMembers eager-loaded) to its proto entity. The vote schema carries no
// timestamp columns, so created_at/modified_at stay zero.
func voteCategoryEntryFromEnt(c *ent.VoteCategory) *voteEnts.VoteCategory {
	entry := &voteEnts.VoteCategory{
		Id:           c.ID.String(),
		Name:         c.Name,
		Description:  c.Description,
		VotingMethod: votingMethodFromEnt(c.VotingMethod),
		VoterType:    voterTypeFromEnt(c.VoterType),
	}
	if c.Edges.Hackathon != nil {
		entry.HackathonId = c.Edges.Hackathon.ID.String()
	}
	for _, u := range c.Edges.JuryMembers {
		entry.JuryMembers = append(entry.JuryMembers, userEntryFromEnt(u))
	}

	return entry
}

// categoryWithHackathon fetches a category with its hackathon edge, mapping
// not-found to the right gRPC code.
func (s *VoteService) categoryWithHackathon(
	ctx context.Context,
	id uuid.UUID,
) (*ent.VoteCategory, error) {
	c, err := s.dbClient.VoteCategory.Query().
		Where(entvotecategory.IDEQ(id)).
		WithHackathon().
		WithJuryMembers().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "vote category %s not found", id)
		}
		slog.Error("query vote category", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	return c, nil
}

// ─── VoteCategory CRUD ───────────────────────────────────────────────

func (s *VoteService) ListVoteCategories(
	ctx context.Context,
	req *voteMsgs.ListVoteCategoriesRequest,
) (*voteMsgs.ListVoteCategoriesResponse, error) {
	// TODO: casbin check once member-read rules for votes exist; JWT-only for
	// the bootstrap read path.
	if _, _, err := m.RequireSubject(ctx); err != nil {
		return nil, err
	}
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	categories, err := s.dbClient.VoteCategory.Query().
		Where(entvotecategory.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		WithHackathon().
		WithJuryMembers().
		All(ctx)
	if err != nil {
		slog.Error("query vote categories", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	entries := make([]*voteEnts.VoteCategory, 0, len(categories))
	for _, c := range categories {
		entries = append(entries, voteCategoryEntryFromEnt(c))
	}

	return &voteMsgs.ListVoteCategoriesResponse{VoteCategories: entries}, nil
}

func (s *VoteService) GetVoteCategory(
	ctx context.Context,
	req *voteMsgs.GetVoteCategoryRequest,
) (*voteMsgs.GetVoteCategoryResponse, error) {
	// TODO: casbin check once member-read rules for votes exist.
	if _, _, err := m.RequireSubject(ctx); err != nil {
		return nil, err
	}
	id, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid id: %v", err)
	}
	c, err := s.categoryWithHackathon(ctx, id)
	if err != nil {
		return nil, err
	}

	return &voteMsgs.GetVoteCategoryResponse{VoteCategory: voteCategoryEntryFromEnt(c)}, nil
}

func (s *VoteService) CreateVoteCategory(
	ctx context.Context,
	req *voteMsgs.CreateVoteCategoryRequest,
) (*voteMsgs.CreateVoteCategoryResponse, error) {
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}
	method, ok := votingMethodToEnt(req.GetVotingMethod())
	if !ok {
		return nil, status.Errorf(codes.InvalidArgument, "voting_method must be specified")
	}
	voter, ok := voterTypeToEnt(req.GetVoterType())
	if !ok {
		return nil, status.Errorf(codes.InvalidArgument, "voter_type must be specified")
	}
	juryIDs, err := parseUUIDs(req.GetJuryMemberIds())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid jury_member_ids: %v", err)
	}

	create := s.dbClient.VoteCategory.Create().
		SetHackathonID(hackathonID).
		SetName(req.GetName()).
		SetDescription(req.GetDescription()).
		SetVotingMethod(method).
		SetVoterType(voter).
		AddJuryMemberIDs(juryIDs...)
	created, err := create.Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil, status.Errorf(codes.InvalidArgument, "invalid reference: %v", err)
		}
		slog.Error("create vote category", "err", err)

		return nil, status.Error(codes.Internal, "couldn't create vote category")
	}

	c, err := s.categoryWithHackathon(ctx, created.ID)
	if err != nil {
		return nil, err
	}

	return &voteMsgs.CreateVoteCategoryResponse{VoteCategory: voteCategoryEntryFromEnt(c)}, nil
}

func (s *VoteService) EditVoteCategory(
	ctx context.Context,
	req *voteMsgs.EditVoteCategoryRequest,
) (*voteMsgs.EditVoteCategoryResponse, error) {
	id, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid id: %v", err)
	}
	c, err := s.categoryWithHackathon(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(
		ctx, c.Edges.Hackathon.ID.String(), m.Hackathon, m.Write,
	); err != nil {
		return nil, err
	}

	update := s.dbClient.VoteCategory.UpdateOneID(id)
	if req.Name != nil {
		update.SetName(req.GetName())
	}
	if req.Description != nil {
		update.SetDescription(req.GetDescription())
	}
	if req.VotingMethod != nil {
		method, ok := votingMethodToEnt(req.GetVotingMethod())
		if !ok {
			return nil, status.Errorf(codes.InvalidArgument, "invalid voting_method")
		}
		update.SetVotingMethod(method)
	}
	if req.VoterType != nil {
		voter, ok := voterTypeToEnt(req.GetVoterType())
		if !ok {
			return nil, status.Errorf(codes.InvalidArgument, "invalid voter_type")
		}
		update.SetVoterType(voter)
	}
	// proto3 cannot distinguish empty from absent for repeated fields: a
	// non-empty list replaces the jury; an empty list leaves it unchanged.
	if len(req.GetJuryMemberIds()) > 0 {
		juryIDs, err := parseUUIDs(req.GetJuryMemberIds())
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid jury_member_ids: %v", err)
		}
		update.ClearJuryMembers().AddJuryMemberIDs(juryIDs...)
	}
	if _, err := update.Save(ctx); err != nil {
		if ent.IsConstraintError(err) {
			return nil, status.Errorf(codes.InvalidArgument, "invalid reference: %v", err)
		}
		slog.Error("edit vote category", "err", err)

		return nil, status.Error(codes.Internal, "couldn't edit vote category")
	}

	updated, err := s.categoryWithHackathon(ctx, id)
	if err != nil {
		return nil, err
	}

	return &voteMsgs.EditVoteCategoryResponse{VoteCategory: voteCategoryEntryFromEnt(updated)}, nil
}

func (s *VoteService) DeleteVoteCategory(
	ctx context.Context,
	req *voteMsgs.DeleteVoteCategoryRequest,
) (*voteMsgs.DeleteVoteCategoryResponse, error) {
	id, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid id: %v", err)
	}
	c, err := s.categoryWithHackathon(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(
		ctx, c.Edges.Hackathon.ID.String(), m.Hackathon, m.Write,
	); err != nil {
		return nil, err
	}
	if err := s.dbClient.VoteCategory.DeleteOneID(id).Exec(ctx); err != nil {
		slog.Error("delete vote category", "err", err)

		return nil, status.Error(codes.Internal, "couldn't delete vote category")
	}

	return &voteMsgs.DeleteVoteCategoryResponse{}, nil
}

// ─── Voting ──────────────────────────────────────────────────────────

// voteEntryFromEnt maps an ent Vote (with Category, Voter, Submissions
// eager-loaded) to its proto entity.
func voteEntryFromEnt(v *ent.Vote) *voteEnts.Vote {
	entry := &voteEnts.Vote{Id: v.ID.String()}
	if v.Edges.Category != nil {
		entry.CategoryId = v.Edges.Category.ID.String()
	}
	if v.Edges.Voter != nil {
		entry.VoterId = v.Edges.Voter.ID.String()
	}
	if v.VoteType == entvote.VoteTypeSingleChoice && len(v.Edges.Submission) > 0 {
		entry.Vote = &voteEnts.Vote_SingleChoice{
			SingleChoice: &voteEnts.SingleChoiceVote{
				SubmissionId: v.Edges.Submission[0].ID.String(),
			},
		}
	}

	return entry
}

// SubmitVote casts one ballot. The voter must be a confirmed participant of
// the category's hackathon (organizers/admins are NOT exempt — voting is a
// participant act), voting must be open (settings.voting_enabled), and for
// jury categories the voter must be on the jury. One ballot per voter per
// category — the DB unique index turns double votes into AlreadyExists.
// votingPolicy is the organizer's ruling, as SetVotingPolicy stored it.
//
// Every field defaults to the behaviour that was hard-coded before this read
// existed, so an event with no policy row behaves exactly as it always did:
// organizers do not vote, voting for your own team is allowed. Setting a
// policy is what changes anything.
type votingPolicy struct {
	organizerVoting bool
	ownTeamVoting   bool
}

func (s *VoteService) votingPolicyFor(ctx context.Context, hackathonID uuid.UUID) votingPolicy {
	p := votingPolicy{organizerVoting: false, ownTeamVoting: true}

	row, err := s.dbClient.HackathonForms.Query().
		Where(enthackathonforms.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		Only(ctx)
	if err != nil {
		// No row, or a query that failed: fall back to the defaults rather than
		// refusing the vote. A policy nobody set must not close the ballot.
		if !ent.IsNotFound(err) {
			slog.Error("query voting policy", "err", err)
		}

		return p
	}

	if v, ok := row.VotingPolicy["organizerVoting"].(bool); ok {
		p.organizerVoting = v
	}
	if v, ok := row.VotingPolicy["ownTeamVoting"].(bool); ok {
		p.ownTeamVoting = v
	}

	return p
}

func (s *VoteService) SubmitVote(
	ctx context.Context,
	req *voteMsgs.SubmitVoteRequest,
) (*voteMsgs.SubmitVoteResponse, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	if uid == m.AnonSubject {
		return nil, status.Error(codes.Unauthenticated, "authentication required")
	}

	sc := req.GetSingleChoice()
	if sc == nil {
		// The Vote schema stores one row per (category, voter); ranked and
		// points ballots need multiple rows and cannot be persisted until the
		// schema decision lands (see #78 review). NOT Unimplemented — the
		// capability probe reads that code as "RPC does not exist".
		return nil, status.Error(codes.InvalidArgument,
			"only single_choice ballots are accepted for now")
	}
	categoryID, err := uuid.Parse(sc.GetCategoryId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}
	submissionID, err := uuid.Parse(sc.GetSubmissionId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid submission_id: %v", err)
	}

	c, err := s.categoryWithHackathon(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	hackathonID := c.Edges.Hackathon.ID

	// Voting window: closed unless the settings row explicitly enables it.
	settings, err := s.dbClient.HackathonSettings.Query().
		Where(enthackathonsettings.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		slog.Error("query hackathon settings", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query hackathon settings")
	}
	if settings == nil || !settings.VotingEnabled {
		return nil, status.Error(codes.FailedPrecondition, "voting is closed")
	}
	// And the VOTE capability. It was declared, seeded and rendered as a switch
	// in the organiser panel while no handler read it — flipping it changed
	// nothing, which is worse than not offering it. The settings flag stays:
	// it is the event-wide "voting is running" state, where the capability is
	// the schedulable one that a phase can open.
	if err := requireCapability(ctx, s.dbClient, s.enforcer, hackathonID, capability.Vote); err != nil {
		return nil, err
	}

	voter, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user %s not found", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	if c.VoterType == entvotecategory.VoterTypeJury {
		onJury := false
		for _, j := range c.Edges.JuryMembers {
			if j.ID == voter.ID {
				onJury = true

				break
			}
		}
		if !onJury {
			return nil, status.Error(codes.PermissionDenied, "only jury members may vote in this category")
		}
	} else {
		// The organizer's own ruling, not a constant. Both fields were stored by
		// SetVotingPolicy and then never read: organizerVoting was hard-coded
		// here and ownTeamVoting was enforced nowhere at all, so an event that
		// set either one got no effect from it.
		policy := s.votingPolicyFor(ctx, hackathonID)

		// Organizers are neutral by default: whoever runs the event does not
		// also vote in it. An event that says otherwise may.
		if !policy.organizerVoting {
			if role, err := s.enforcer.GetHackathonRole(uid, hackathonID.String()); err == nil &&
				role == hackEnts.HackathonRole_HACKATHON_ROLE_OWNER {
				return nil, status.Error(codes.PermissionDenied, "organizers do not vote")
			}
			if globals, err := s.enforcer.GetGlobalRoles(uid); err == nil {
				for _, g := range globals {
					if g == userEnts.GlobalRole_GLOBAL_ROLE_ADMIN {
						return nil, status.Error(codes.PermissionDenied, "organizers do not vote")
					}
				}
			}
		}

		// Voting for the submission of a team you are on. Allowed unless the
		// event forbids it — a small hackathon where everyone knows everyone
		// often wants it, and a competitive one does not.
		if !policy.ownTeamVoting {
			ownTeam, err := s.dbClient.Submission.Query().
				Where(
					entsubmission.IDEQ(submissionID),
					entsubmission.HasTeamWith(entteam.HasMembersWith(entuser.IDEQ(voter.ID))),
				).
				Exist(ctx)
			if err != nil {
				slog.Error("query own-team submission", "err", err)

				return nil, status.Error(codes.Internal, "couldn't query database")
			}
			if ownTeam {
				return nil, status.Error(codes.PermissionDenied,
					"this event does not allow voting for your own team's submission")
			}
		}

		confirmed, err := s.dbClient.Participant.Query().
			Where(
				entparticipant.HasUserWith(entuser.IDEQ(voter.ID)),
				entparticipant.HasHackathonWith(enthackathon.IDEQ(hackathonID)),
				entparticipant.IsWaiting(false),
			).
			Exist(ctx)
		if err != nil {
			slog.Error("query participant", "err", err)

			return nil, status.Error(codes.Internal, "couldn't query database")
		}
		if !confirmed {
			return nil, status.Error(codes.PermissionDenied,
				"only confirmed participants may vote")
		}
	}

	created, err := s.dbClient.Vote.Create().
		SetCategoryID(categoryID).
		SetVoterID(voter.ID).
		AddSubmissionIDs(submissionID).
		SetVoteType(entvote.VoteTypeSingleChoice).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil, status.Error(codes.AlreadyExists, "already voted in this category")
		}
		slog.Error("create vote", "err", err)

		return nil, status.Error(codes.Internal, "couldn't create vote")
	}

	v, err := s.voteByID(ctx, created.ID)
	if err != nil {
		return nil, err
	}

	return &voteMsgs.SubmitVoteResponse{Vote: voteEntryFromEnt(v)}, nil
}

func (s *VoteService) voteByID(ctx context.Context, id uuid.UUID) (*ent.Vote, error) {
	v, err := s.dbClient.Vote.Query().
		Where(entvote.IDEQ(id)).
		WithCategory().
		WithVoter().
		WithSubmission().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "vote %s not found", id)
		}
		slog.Error("query vote", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	return v, nil
}

func (s *VoteService) GetVote(
	ctx context.Context,
	req *voteMsgs.GetVoteRequest,
) (*voteMsgs.GetVoteResponse, error) {
	if _, _, err := m.RequireSubject(ctx); err != nil {
		return nil, err
	}
	id, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid id: %v", err)
	}
	v, err := s.voteByID(ctx, id)
	if err != nil {
		return nil, err
	}

	return &voteMsgs.GetVoteResponse{Vote: voteEntryFromEnt(v)}, nil
}

// ListVotes returns raw ballots — organizer/admin only (ballots are not
// public). category_id is required to scope the permission check.
func (s *VoteService) ListVotes(
	ctx context.Context,
	req *voteMsgs.ListVotesRequest,
) (*voteMsgs.ListVotesResponse, error) {
	votes, err := s.votesForExport(ctx, req.GetCategoryId(), req.GetVoterId(), req.GetSubmissionId())
	if err != nil {
		return nil, err
	}
	entries := make([]*voteEnts.Vote, 0, len(votes))
	for _, v := range votes {
		entries = append(entries, voteEntryFromEnt(v))
	}

	return &voteMsgs.ListVotesResponse{Votes: entries}, nil
}

// votesForExport enforces the organizer/admin gate and returns ballots for a
// category with optional voter/submission filters.
func (s *VoteService) votesForExport(
	ctx context.Context,
	rawCategoryID, rawVoterID, rawSubmissionID string,
) ([]*ent.Vote, error) {
	if rawCategoryID == "" {
		return nil, status.Error(codes.InvalidArgument, "category_id is required")
	}
	categoryID, err := uuid.Parse(rawCategoryID)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}
	c, err := s.categoryWithHackathon(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(
		ctx, c.Edges.Hackathon.ID.String(), m.Hackathon, m.Write,
	); err != nil {
		return nil, err
	}

	q := s.dbClient.Vote.Query().
		Where(entvote.HasCategoryWith(entvotecategory.IDEQ(categoryID))).
		WithCategory().
		WithVoter().
		WithSubmission()
	if rawVoterID != "" {
		voterID, err := uuid.Parse(rawVoterID)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid voter_id: %v", err)
		}
		q = q.Where(entvote.HasVoterWith(entuser.IDEQ(voterID)))
	}
	if rawSubmissionID != "" {
		submissionID, err := uuid.Parse(rawSubmissionID)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid submission_id: %v", err)
		}
		q = q.Where(entvote.HasSubmissionWith(entsubmission.IDEQ(submissionID)))
	}
	votes, err := q.All(ctx)
	if err != nil {
		slog.Error("query votes", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	return votes, nil
}

// ExportVotes serializes a category's raw ballots (organizer/admin only).
func (s *VoteService) ExportVotes(
	ctx context.Context,
	req *voteMsgs.ExportVotesRequest,
) (*voteMsgs.ExportVotesResponse, error) {
	votes, err := s.votesForExport(ctx, req.GetCategoryId(), "", "")
	if err != nil {
		return nil, err
	}

	type row struct {
		ID           string `json:"id"`
		CategoryID   string `json:"category_id"`
		VoterID      string `json:"voter_id"`
		SubmissionID string `json:"submission_id"`
		VoteType     string `json:"vote_type"`
	}
	rows := make([]row, 0, len(votes))
	for _, v := range votes {
		r := row{ID: v.ID.String(), VoteType: string(v.VoteType)}
		if v.Edges.Category != nil {
			r.CategoryID = v.Edges.Category.ID.String()
		}
		if v.Edges.Voter != nil {
			r.VoterID = v.Edges.Voter.ID.String()
		}
		if len(v.Edges.Submission) > 0 {
			r.SubmissionID = v.Edges.Submission[0].ID.String()
		}
		rows = append(rows, r)
	}

	switch req.GetFormat() {
	case voteMsgs.ExportFormat_EXPORT_FORMAT_JSON:
		data, err := json.MarshalIndent(rows, "", "  ")
		if err != nil {
			slog.Error("marshal votes", "err", err)

			return nil, status.Error(codes.Internal, "couldn't serialize votes")
		}

		return &voteMsgs.ExportVotesResponse{Data: data}, nil
	case voteMsgs.ExportFormat_EXPORT_FORMAT_CSV:
		var buf bytes.Buffer
		w := csv.NewWriter(&buf)
		_ = w.Write([]string{"id", "category_id", "voter_id", "submission_id", "vote_type"})
		for _, r := range rows {
			_ = w.Write([]string{r.ID, r.CategoryID, r.VoterID, r.SubmissionID, r.VoteType})
		}
		w.Flush()

		return &voteMsgs.ExportVotesResponse{Data: buf.Bytes()}, nil
	default:
		return nil, status.Error(codes.InvalidArgument, "format must be CSV or JSON")
	}
}

// ─── Vote results ────────────────────────────────────────────────────

// voteResultEntryFromEnt maps an ent VoteResult (with VoteCategory and
// Submission eager-loaded) to its proto entity.
func voteResultEntryFromEnt(r *ent.VoteResult) *voteEnts.VoteResult {
	entry := &voteEnts.VoteResult{
		Id:       r.ID.String(),
		Position: int32(r.Position),
	}
	if r.Title != "" {
		entry.Title = &r.Title
	}
	if r.Edges.VoteCategory != nil {
		entry.CategoryId = r.Edges.VoteCategory.ID.String()
	}
	if r.Edges.Submission != nil {
		entry.SubmissionId = r.Edges.Submission.ID.String()
	}

	return entry
}

func (s *VoteService) resultByID(ctx context.Context, id uuid.UUID) (*ent.VoteResult, error) {
	r, err := s.dbClient.VoteResult.Query().
		Where(entvoteresult.IDEQ(id)).
		WithVoteCategory(func(q *ent.VoteCategoryQuery) { q.WithHackathon() }).
		WithSubmission().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "vote result %s not found", id)
		}
		slog.Error("query vote result", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	return r, nil
}

func (s *VoteService) ListVoteResults(
	ctx context.Context,
	req *voteMsgs.ListVoteResultsRequest,
) (*voteMsgs.ListVoteResultsResponse, error) {
	// Results are the published outcome — readable by any signed-in user ONCE
	// the organiser has published them. VIEW_RESULTS is that switch, and like
	// VOTE it was declared and toggleable while nothing read it, so placements
	// were visible the moment they were recorded whatever the panel said.
	//
	// requireCapability lets organisers through regardless, which is what makes
	// reviewing a tally before publishing it possible.
	if _, _, err := m.RequireSubject(ctx); err != nil {
		return nil, err
	}
	categoryID, err := uuid.Parse(req.GetCategoryId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}

	c, err := s.categoryWithHackathon(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	if err := requireCapability(
		ctx, s.dbClient, s.enforcer,
		c.Edges.Hackathon.ID, capability.ViewResults,
	); err != nil {
		return nil, err
	}
	results, err := s.dbClient.VoteResult.Query().
		Where(entvoteresult.HasVoteCategoryWith(entvotecategory.IDEQ(categoryID))).
		WithVoteCategory().
		WithSubmission().
		Order(entvoteresult.ByPosition()).
		All(ctx)
	if err != nil {
		slog.Error("query vote results", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	entries := make([]*voteEnts.VoteResult, 0, len(results))
	for _, r := range results {
		entries = append(entries, voteResultEntryFromEnt(r))
	}

	return &voteMsgs.ListVoteResultsResponse{VoteResults: entries}, nil
}

func (s *VoteService) CreateVoteResult(
	ctx context.Context,
	req *voteMsgs.CreateVoteResultRequest,
) (*voteMsgs.CreateVoteResultResponse, error) {
	categoryID, err := uuid.Parse(req.GetCategoryId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}
	submissionID, err := uuid.Parse(req.GetSubmissionId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid submission_id: %v", err)
	}
	c, err := s.categoryWithHackathon(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(
		ctx, c.Edges.Hackathon.ID.String(), m.Hackathon, m.Write,
	); err != nil {
		return nil, err
	}

	create := s.dbClient.VoteResult.Create().
		SetVoteCategoryID(categoryID).
		SetSubmissionID(submissionID).
		SetPosition(int(req.GetPosition()))
	if req.Title != nil {
		create.SetTitle(req.GetTitle())
	}
	created, err := create.Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil, status.Errorf(codes.InvalidArgument, "invalid reference: %v", err)
		}
		slog.Error("create vote result", "err", err)

		return nil, status.Error(codes.Internal, "couldn't create vote result")
	}

	r, err := s.resultByID(ctx, created.ID)
	if err != nil {
		return nil, err
	}

	return &voteMsgs.CreateVoteResultResponse{VoteResult: voteResultEntryFromEnt(r)}, nil
}

func (s *VoteService) EditVoteResult(
	ctx context.Context,
	req *voteMsgs.EditVoteResultRequest,
) (*voteMsgs.EditVoteResultResponse, error) {
	id, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid id: %v", err)
	}
	r, err := s.resultByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(
		ctx, r.Edges.VoteCategory.Edges.Hackathon.ID.String(), m.Hackathon, m.Write,
	); err != nil {
		return nil, err
	}

	update := s.dbClient.VoteResult.UpdateOneID(id)
	if req.SubmissionId != nil {
		submissionID, err := uuid.Parse(req.GetSubmissionId())
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid submission_id: %v", err)
		}
		update.SetSubmissionID(submissionID)
	}
	if req.Position != nil {
		update.SetPosition(int(req.GetPosition()))
	}
	if req.Title != nil {
		update.SetTitle(req.GetTitle())
	}
	if _, err := update.Save(ctx); err != nil {
		if ent.IsConstraintError(err) {
			return nil, status.Errorf(codes.InvalidArgument, "invalid reference: %v", err)
		}
		slog.Error("edit vote result", "err", err)

		return nil, status.Error(codes.Internal, "couldn't edit vote result")
	}

	updated, err := s.resultByID(ctx, id)
	if err != nil {
		return nil, err
	}

	return &voteMsgs.EditVoteResultResponse{VoteResult: voteResultEntryFromEnt(updated)}, nil
}

func (s *VoteService) DeleteVoteResult(
	ctx context.Context,
	req *voteMsgs.DeleteVoteResultRequest,
) (*voteMsgs.DeleteVoteResultResponse, error) {
	id, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid id: %v", err)
	}
	r, err := s.resultByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(
		ctx, r.Edges.VoteCategory.Edges.Hackathon.ID.String(), m.Hackathon, m.Write,
	); err != nil {
		return nil, err
	}
	if err := s.dbClient.VoteResult.DeleteOneID(id).Exec(ctx); err != nil {
		slog.Error("delete vote result", "err", err)

		return nil, status.Error(codes.Internal, "couldn't delete vote result")
	}

	return &voteMsgs.DeleteVoteResultResponse{}, nil
}

// ExportResults serializes a category's placements (organizer/admin only).
func (s *VoteService) ExportResults(
	ctx context.Context,
	req *voteMsgs.ExportResultsRequest,
) (*voteMsgs.ExportResultsResponse, error) {
	categoryID, err := uuid.Parse(req.GetCategoryId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}
	c, err := s.categoryWithHackathon(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(
		ctx, c.Edges.Hackathon.ID.String(), m.Hackathon, m.Write,
	); err != nil {
		return nil, err
	}
	results, err := s.dbClient.VoteResult.Query().
		Where(entvoteresult.HasVoteCategoryWith(entvotecategory.IDEQ(categoryID))).
		WithVoteCategory().
		WithSubmission().
		Order(entvoteresult.ByPosition()).
		All(ctx)
	if err != nil {
		slog.Error("query vote results", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	type row struct {
		ID           string `json:"id"`
		CategoryID   string `json:"category_id"`
		SubmissionID string `json:"submission_id"`
		Position     int    `json:"position"`
		Title        string `json:"title,omitempty"`
	}
	rows := make([]row, 0, len(results))
	for _, r := range results {
		out := row{ID: r.ID.String(), Position: r.Position, Title: r.Title}
		if r.Edges.VoteCategory != nil {
			out.CategoryID = r.Edges.VoteCategory.ID.String()
		}
		if r.Edges.Submission != nil {
			out.SubmissionID = r.Edges.Submission.ID.String()
		}
		rows = append(rows, out)
	}

	switch req.GetFormat() {
	case voteMsgs.ExportFormat_EXPORT_FORMAT_JSON:
		data, err := json.MarshalIndent(rows, "", "  ")
		if err != nil {
			slog.Error("marshal vote results", "err", err)

			return nil, status.Error(codes.Internal, "couldn't serialize results")
		}

		return &voteMsgs.ExportResultsResponse{Data: data}, nil
	case voteMsgs.ExportFormat_EXPORT_FORMAT_CSV:
		var buf bytes.Buffer
		w := csv.NewWriter(&buf)
		_ = w.Write([]string{"id", "category_id", "submission_id", "position", "title"})
		for _, r := range rows {
			_ = w.Write([]string{r.ID, r.CategoryID, r.SubmissionID, strconv.Itoa(r.Position), r.Title})
		}
		w.Flush()

		return &voteMsgs.ExportResultsResponse{Data: buf.Bytes()}, nil
	default:
		return nil, status.Error(codes.InvalidArgument, "format must be CSV or JSON")
	}
}

// ─── Shared helpers ──────────────────────────────────────────────────

func parseUUIDs(raw []string) ([]uuid.UUID, error) {
	ids := make([]uuid.UUID, 0, len(raw))
	for _, r := range raw {
		id, err := uuid.Parse(r)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}

	return ids, nil
}
