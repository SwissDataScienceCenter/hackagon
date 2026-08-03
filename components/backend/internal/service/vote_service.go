package service

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entvotecategory "github.com/swissdatasciencecenter/hackagon/components/backend/ent/votecategory"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
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
