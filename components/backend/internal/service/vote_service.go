package service

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"log/slog"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entsubmission "github.com/swissdatasciencecenter/hackagon/components/backend/ent/submission"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	entvote "github.com/swissdatasciencecenter/hackagon/components/backend/ent/vote"
	entvotecategory "github.com/swissdatasciencecenter/hackagon/components/backend/ent/votecategory"
	entvoteresult "github.com/swissdatasciencecenter/hackagon/components/backend/ent/voteresult"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	vote "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote"
	voteEntities "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/vote/entities"
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

func (s *VoteService) ListVoteCategories(
	ctx context.Context,
	req *voteMsgs.ListVoteCategoriesRequest,
) (*voteMsgs.ListVoteCategoriesResponse, error) {
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), m.VoteCategory, m.Read); err != nil {
		return nil, err
	}

	categories, err := s.dbClient.VoteCategory.Query().
		Where(entvotecategory.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		WithJuryMembers().
		WithVotes().
		All(ctx)
	if err != nil {
		slog.Error("query vote categories", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote categories")
	}

	entries := make([]*voteEntities.VoteCategory, 0, len(categories))
	for _, c := range categories {
		entries = append(entries, voteCategoryEntryFromEnt(c))
	}

	return &voteMsgs.ListVoteCategoriesResponse{VoteCategories: entries}, nil
}

func (s *VoteService) GetVoteCategory(
	ctx context.Context,
	req *voteMsgs.GetVoteCategoryRequest,
) (*voteMsgs.GetVoteCategoryResponse, error) {
	categoryID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}

	category, err := s.dbClient.VoteCategory.Query().
		Where(entvotecategory.IDEQ(categoryID)).
		WithHackathon().
		WithJuryMembers().
		WithVotes().
		WithResults().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "vote category %s not found", req.GetId())
		}
		slog.Error("query vote category", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote category")
	}

	if err := s.enforcer.RequirePermission(
		ctx, category.Edges.Hackathon.ID.String(), m.VoteCategory, m.Read,
	); err != nil {
		return nil, err
	}

	return &voteMsgs.GetVoteCategoryResponse{VoteCategory: voteCategoryEntryFromEnt(category)}, nil
}

func (s *VoteService) CreateVoteCategory(
	ctx context.Context,
	req *voteMsgs.CreateVoteCategoryRequest,
) (*voteMsgs.CreateVoteCategoryResponse, error) {
	_, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), m.VoteCategory, m.Create); err != nil {
		return nil, err
	}

	// Verify hackathon exists
	_, err = s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(hackathonID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"hackathon %s not found",
				req.GetHackathonId(),
			)
		}
		slog.Error("query hackathon", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query hackathon")
	}

	votingMethod, ok := votingMethodToEnt(req.GetVotingMethod())
	if !ok {
		return nil, status.Errorf(
			codes.InvalidArgument,
			"unknown voting_method: %v",
			req.GetVotingMethod(),
		)
	}
	voterType, ok := voterTypeToEnt(req.GetVoterType())
	if !ok {
		return nil, status.Errorf(
			codes.InvalidArgument,
			"unknown voter_type: %v",
			req.GetVoterType(),
		)
	}

	// max_points is mandatory for points-based voting
	if votingMethod == entvotecategory.VotingMethodPoints {
		if req.MaxPoints == nil {
			return nil, status.Errorf(
				codes.InvalidArgument,
				"max_points is required for points-based voting",
			)
		} else if req.GetMaxPoints() <= 0 {
			return nil, status.Errorf(codes.InvalidArgument, "max_points must be greater than or equal to 1")
		}
	}
	create := s.dbClient.VoteCategory.Create().
		SetHackathonID(hackathonID).
		SetName(req.GetName()).
		SetDescription(req.GetDescription()).
		SetVotingMethod(votingMethod).
		SetVoterType(voterType)

	// Set max_points if provided
	if req.MaxPoints != nil {
		create = create.SetMaxPoints(int(req.GetMaxPoints()))
	}

	// Add jury members if specified
	if len(req.GetJuryMemberIds()) > 0 {
		juryUserIDs := make([]uuid.UUID, 0, len(req.GetJuryMemberIds()))
		for _, jid := range req.GetJuryMemberIds() {
			uid, parseErr := uuid.Parse(jid)
			if parseErr != nil {
				return nil, status.Errorf(codes.InvalidArgument, "invalid jury_member_id: %s", jid)
			}
			juryUserIDs = append(juryUserIDs, uid)
		}
		create = create.AddJuryMemberIDs(juryUserIDs...)
	}

	category, err := create.Save(ctx)
	if err != nil {
		slog.Error("create vote category", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't create vote category: %v", err)
	}

	// Re-fetch with edges for response
	category, err = s.dbClient.VoteCategory.Query().
		Where(entvotecategory.IDEQ(category.ID)).
		WithJuryMembers().
		WithVotes().
		WithResults().
		Only(ctx)
	if err != nil {
		slog.Error("re-query vote category", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't re-query vote category: %v", err)
	}

	return &voteMsgs.CreateVoteCategoryResponse{
		VoteCategory: voteCategoryEntryFromEnt(category),
	}, nil
}

func (s *VoteService) EditVoteCategory(
	ctx context.Context,
	req *voteMsgs.EditVoteCategoryRequest,
) (*voteMsgs.EditVoteCategoryResponse, error) {
	_, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	categoryID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}

	category, err := s.dbClient.VoteCategory.Query().
		Where(entvotecategory.IDEQ(categoryID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "vote category %s not found", req.GetId())
		}
		slog.Error("query vote category", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote category")
	}

	if err := s.enforcer.RequirePermission(
		ctx, category.Edges.Hackathon.ID.String(), m.VoteCategory, m.Write,
	); err != nil {
		return nil, err
	}

	update := s.dbClient.VoteCategory.UpdateOne(category)

	if req.Name != nil {
		update.SetName(req.GetName())
	}
	if req.Description != nil {
		update.SetDescription(req.GetDescription())
	}
	if req.VotingMethod != nil {
		votingMethod, ok := votingMethodToEnt(req.GetVotingMethod())
		if !ok {
			return nil, status.Errorf(
				codes.InvalidArgument,
				"unknown voting_method: %v",
				req.GetVotingMethod(),
			)
		}
		update.SetVotingMethod(votingMethod)
	}
	if req.VoterType != nil {
		voterType, ok := voterTypeToEnt(req.GetVoterType())
		if !ok {
			return nil, status.Errorf(
				codes.InvalidArgument,
				"unknown voter_type: %v",
				req.GetVoterType(),
			)
		}
		update.SetVoterType(voterType)
	}

	// Determine effective voting method after edit (new value if provided, otherwise existing)
	effectiveVotingMethod := category.VotingMethod
	if req.VotingMethod != nil {
		if vm, ok := votingMethodToEnt(req.GetVotingMethod()); ok {
			effectiveVotingMethod = vm
		}
	}

	// Apply max_points validation and update
	if _, err := s.applyMaxPoints(update, category, req, effectiveVotingMethod); err != nil {
		return nil, err
	}

	// Delete existing votes if voting method changed
	if err := s.applyVotingMethodChange(ctx, categoryID, category.VotingMethod, effectiveVotingMethod); err != nil {
		return nil, err
	}

	// Apply jury members update
	if err := s.applyJuryMembers(update, req); err != nil {
		return nil, err
	}

	updated, err := update.Save(ctx)
	if err != nil {
		slog.Error("edit vote category", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't edit vote category: %v", err)
	}

	// Re-fetch with edges for response
	updated, err = s.dbClient.VoteCategory.Query().
		Where(entvotecategory.IDEQ(updated.ID)).
		WithJuryMembers().
		WithVotes().
		WithResults().
		Only(ctx)
	if err != nil {
		slog.Error("re-query vote category", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't re-query vote category: %v", err)
	}

	return &voteMsgs.EditVoteCategoryResponse{VoteCategory: voteCategoryEntryFromEnt(updated)}, nil
}

func (s *VoteService) DeleteVoteCategory(
	ctx context.Context,
	req *voteMsgs.DeleteVoteCategoryRequest,
) (*voteMsgs.DeleteVoteCategoryResponse, error) {
	_, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	categoryID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}

	category, err := s.dbClient.VoteCategory.Query().
		Where(entvotecategory.IDEQ(categoryID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "vote category %s not found", req.GetId())
		}
		slog.Error("query vote category", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote category")
	}

	if err := s.enforcer.RequirePermission(
		ctx, category.Edges.Hackathon.ID.String(), m.VoteCategory, m.Write,
	); err != nil {
		return nil, err
	}

	// Delete the category (cascades to votes and results via entsql.OnDelete)
	if err := s.dbClient.VoteCategory.DeleteOne(category).Exec(ctx); err != nil {
		slog.Error("delete vote category", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't delete vote category: %v", err)
	}

	return &voteMsgs.DeleteVoteCategoryResponse{}, nil
}

func (s *VoteService) SubmitVote(
	ctx context.Context,
	req *voteMsgs.SubmitVoteRequest,
) (*voteMsgs.SubmitVoteResponse, error) {
	sub, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	// Reject anonymous users
	if sub == m.AnonSubject {
		return nil, status.Error(codes.Unauthenticated, "anonymous users cannot submit votes")
	}

	// Parse category_id from top-level request field
	categoryID, err := uuid.Parse(req.GetCategoryId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}

	// Get the category to verify existence and check voter permissions
	category, err := s.dbClient.VoteCategory.Query().
		Where(entvotecategory.IDEQ(categoryID)).
		WithHackathon().
		WithJuryMembers().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "vote category %s not found", categoryID)
		}
		slog.Error("query vote category", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote category")
	}

	// Check read permission on category
	if err := s.enforcer.RequirePermission(
		ctx, category.Edges.Hackathon.ID.String(), m.VoteCategory, m.Read,
	); err != nil {
		return nil, err
	}

	// Verify voter is allowed to vote in this category
	if category.VoterType == entvotecategory.VoterTypeJury {
		isJury := false
		for _, jm := range category.Edges.JuryMembers {
			if jm.KeycloakID == sub {
				isJury = true
				break
			}
		}
		if !isJury {
			return nil, status.Error(codes.PermissionDenied, "not a jury member for this category")
		}
	}
	// If voter_type is ALL_PARTICIPANTS, any participant can vote (no explicit check needed)

	// Get the voter user
	voter, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(sub)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user %s not found", sub)
		}
		slog.Error("query voter", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query voter")
	}

	// Validate vote type matches category voting method
	if err := s.validateVoteType(category, req); err != nil {
		return nil, err
	}

	var votes []*voteEntities.Vote

	switch v := req.GetVote().(type) {
	case *voteMsgs.SubmitVoteRequest_SingleChoice:
		votes, err = s.submitSingleChoice(ctx, categoryID, voter.ID, v.SingleChoice.GetSubmissionId())
		if err != nil {
			return nil, err
		}

	case *voteMsgs.SubmitVoteRequest_Ranked:
		votes, err = s.submitRanked(ctx, categoryID, voter.ID, v.Ranked.GetSubmissions())
		if err != nil {
			return nil, err
		}

	case *voteMsgs.SubmitVoteRequest_Points:
		votes, err = s.submitPoints(ctx, category, voter.ID, v.Points.GetSubmissions())
		if err != nil {
			return nil, err
		}

	default:
		return nil, status.Errorf(codes.InvalidArgument, "no vote type specified")
	}

	return &voteMsgs.SubmitVoteResponse{Votes: votes}, nil
}

// validateVoteType ensures the request vote type matches the category's voting method.
func (s *VoteService) validateVoteType(
	category *ent.VoteCategory,
	req *voteMsgs.SubmitVoteRequest,
) error {
	valid := true
	switch req.GetVote().(type) {
	case *voteMsgs.SubmitVoteRequest_SingleChoice:
		if category.VotingMethod != entvotecategory.VotingMethodSingleChoice {
			valid = false
		}
	case *voteMsgs.SubmitVoteRequest_Ranked:
		if category.VotingMethod != entvotecategory.VotingMethodRanked {
			valid = false
		}
	case *voteMsgs.SubmitVoteRequest_Points:
		if category.VotingMethod != entvotecategory.VotingMethodPoints {
			valid = false
		}
	}
	if !valid {
		return status.Errorf(
			codes.InvalidArgument,
			"category %s only supports vote type %s",
			category.ID,
			category.VotingMethod.String(),
		)
	}
	return nil
}

// applyMaxPoints validates and applies max_points to the update builder.
// It returns true if max_points was applied, false if it was cleared.
func (s *VoteService) applyMaxPoints(
	update *ent.VoteCategoryUpdateOne,
	category *ent.VoteCategory,
	req *voteMsgs.EditVoteCategoryRequest,
	effectiveVotingMethod entvotecategory.VotingMethod,
) (bool, error) {
	if effectiveVotingMethod == entvotecategory.VotingMethodPoints {
		effectiveMaxPoints := category.MaxPoints
		if req.MaxPoints != nil {
			effectiveMaxPoints = int(req.GetMaxPoints())
		}
		if effectiveMaxPoints <= 0 {
			return false, status.Errorf(
				codes.InvalidArgument,
				"max_points is required and must be >0 for points-based voting",
			)
		}
		if req.MaxPoints != nil {
			update.SetMaxPoints(int(req.GetMaxPoints()))
			return true, nil
		}
	} else {
		update.ClearMaxPoints()
	}
	return false, nil
}

// applyVotingMethodChange deletes existing votes if the voting method changed.
func (s *VoteService) applyVotingMethodChange(
	ctx context.Context,
	categoryID uuid.UUID,
	existingMethod, newMethod entvotecategory.VotingMethod,
) error {
	if existingMethod != newMethod {
		deleteQuery := s.dbClient.Vote.Delete().
			Where(entvote.HasCategoryWith(entvotecategory.IDEQ(categoryID)))
		if _, err := deleteQuery.Exec(ctx); err != nil {
			slog.Error("delete votes on voting method change", "err", err)
			return status.Errorf(codes.Internal, "couldn't delete existing votes: %v", err)
		}
	}
	return nil
}

// applyJuryMembers parses and applies jury member IDs to the update builder.
func (s *VoteService) applyJuryMembers(
	update *ent.VoteCategoryUpdateOne,
	req *voteMsgs.EditVoteCategoryRequest,
) error {
	if req.JuryMemberIds != nil {
		juryUserIDs := make([]uuid.UUID, 0, len(req.GetJuryMemberIds()))
		for _, jid := range req.GetJuryMemberIds() {
			uid, parseErr := uuid.Parse(jid)
			if parseErr != nil {
				return status.Errorf(codes.InvalidArgument, "invalid jury_member_id: %s", jid)
			}
			juryUserIDs = append(juryUserIDs, uid)
		}
		update.ClearJuryMembers().AddJuryMemberIDs(juryUserIDs...)
	}
	return nil
}

// submitSingleVote creates a single vote, handling duplicate detection and self-vote prevention.
func (s *VoteService) submitSingleVote(
	ctx context.Context,
	categoryID uuid.UUID,
	voterID uuid.UUID,
	submissionIDStr string,
	voteType entvote.VoteType,
	value int,
) (*voteEntities.Vote, error) {
	submissionID, err := uuid.Parse(submissionIDStr)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid submission_id: %v", err)
	}

	// Prevent voting on your own team's submission
	submission, err := s.dbClient.Submission.Query().
		Where(entsubmission.IDEQ(submissionID)).
		WithTeam(func(tq *ent.TeamQuery) {
			tq.WithMembers()
		}).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "submission %s not found", submissionIDStr)
		}
		slog.Error("query submission", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query submission")
	}

	for _, member := range submission.Edges.Team.Edges.Members {
		if member.ID == voterID {
			return nil, status.Error(
				codes.PermissionDenied,
				"cannot vote on your own team's submission",
			)
		}
	}

	// Check for duplicate vote (category + voter + submission unique index)
	existing, err := s.dbClient.Vote.Query().
		Where(
			entvote.HasCategoryWith(entvotecategory.IDEQ(categoryID)),
			entvote.HasVoterWith(entuser.IDEQ(voterID)),
			entvote.HasSubmissionWith(entsubmission.IDEQ(submissionID)),
		).Only(ctx)
	if err == nil {
		// Vote already exists — return it (idempotent)
		return voteEntryFromEnt(existing), nil
	}
	if !ent.IsNotFound(err) {
		slog.Error("check existing vote", "err", err)
		return nil, status.Error(codes.Internal, "couldn't check existing vote")
	}

	// For single choice voting, delete any previous vote from this user in this category
	if voteType == entvote.VoteTypeSingleChoice {
		_, err := s.dbClient.Vote.Delete().
			Where(
				entvote.HasCategoryWith(entvotecategory.IDEQ(categoryID)),
				entvote.HasVoterWith(entuser.IDEQ(voterID)),
			).Exec(ctx)
		if err != nil {
			slog.Error("delete previous single choice vote", "err", err)
			return nil, status.Error(codes.Internal, "couldn't delete previous vote")
		}
	}

	// Create the vote
	vote, err := s.dbClient.Vote.Create().
		SetCategoryID(categoryID).
		SetVoterID(voterID).
		SetSubmissionID(submissionID).
		SetVoteType(voteType).
		SetValue(value).
		Save(ctx)
	if err != nil {
		slog.Error("create vote", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't create vote: %v", err)
	}

	return voteEntryFromEnt(vote), nil
}

func (s *VoteService) submitSingleChoice(
	ctx context.Context,
	categoryID uuid.UUID,
	voterID uuid.UUID,
	submissionIDStr string,
) ([]*voteEntities.Vote, error) {
	vote, err := s.submitSingleVote(
		ctx,
		categoryID,
		voterID,
		submissionIDStr,
		entvote.VoteTypeSingleChoice,
		0,
	)
	if err != nil {
		return nil, err
	}
	return []*voteEntities.Vote{vote}, nil
}

func (s *VoteService) submitRanked(
	ctx context.Context,
	categoryID uuid.UUID,
	voterID uuid.UUID,
	submissions []*voteMsgs.RankedSubmission,
) ([]*voteEntities.Vote, error) {
	votes := make([]*voteEntities.Vote, 0, len(submissions))
	for _, sub := range submissions {
		vote, err := s.submitSingleVote(
			ctx,
			categoryID,
			voterID,
			sub.GetSubmissionId(),
			entvote.VoteTypeRanked,
			int(sub.GetRank()),
		)
		if err != nil {
			return nil, err
		}
		votes = append(votes, vote)
	}
	return votes, nil
}

func (s *VoteService) submitPoints(
	ctx context.Context,
	category *ent.VoteCategory,
	voterID uuid.UUID,
	submissions []*voteMsgs.PointsSubmission,
) ([]*voteEntities.Vote, error) {
	// Validate total points against category max_points
	var totalPoints int
	for _, sub := range submissions {
		totalPoints += int(sub.GetPoints())
	}
	if category.MaxPoints != 0 && totalPoints > category.MaxPoints {
		return nil, status.Errorf(
			codes.InvalidArgument,
			"total points (%d) exceeds category limit (%d)",
			totalPoints,
			category.MaxPoints,
		)
	}

	votes := make([]*voteEntities.Vote, 0, len(submissions))
	for _, sub := range submissions {
		vote, err := s.submitSingleVote(
			ctx,
			category.ID,
			voterID,
			sub.GetSubmissionId(),
			entvote.VoteTypePoints,
			int(sub.GetPoints()),
		)
		if err != nil {
			return nil, err
		}
		votes = append(votes, vote)
	}
	return votes, nil
}

func (s *VoteService) GetVote(
	ctx context.Context,
	req *voteMsgs.GetVoteRequest,
) (*voteMsgs.GetVoteResponse, error) {
	voteID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid vote_id: %v", err)
	}

	vote, err := s.dbClient.Vote.Query().
		Where(entvote.IDEQ(voteID)).
		WithCategory(func(cq *ent.VoteCategoryQuery) { cq.WithHackathon() }).
		WithVoter().
		WithSubmission().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "vote %s not found", req.GetId())
		}
		slog.Error("query vote", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote")
	}

	// Check read permission on the category
	if err := s.enforcer.RequirePermission(
		ctx, vote.Edges.Category.Edges.Hackathon.ID.String(), m.VoteCategory, m.Read,
	); err != nil {
		return nil, err
	}

	return &voteMsgs.GetVoteResponse{Vote: voteEntryFromEnt(vote)}, nil
}

func (s *VoteService) ListVotes(
	ctx context.Context,
	req *voteMsgs.ListVotesRequest,
) (*voteMsgs.ListVotesResponse, error) {
	sub, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	u, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(sub)).
		Only(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "user not found: %v", err)
	}

	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// user can read own votes, otherwise use RBAC
	if voterID := req.GetVoterId(); voterID == "" || voterID != u.ID.String() {
		if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), m.Vote, m.Read); err != nil {
			return nil, err
		}
	}

	q := s.dbClient.Vote.Query()

	if categoryID := req.GetCategoryId(); categoryID != "" {
		cid, err := uuid.Parse(categoryID)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
		}
		q = q.Where(entvote.HasCategoryWith(entvotecategory.IDEQ(cid)))
	}
	if voterID := req.GetVoterId(); voterID != "" {
		vid, err := uuid.Parse(voterID)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid voter_id: %v", err)
		}
		q = q.Where(entvote.HasVoterWith(entuser.IDEQ(vid)))
	}
	if submissionID := req.GetSubmissionId(); submissionID != "" {
		sid, err := uuid.Parse(submissionID)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid submission_id: %v", err)
		}
		q = q.Where(entvote.HasSubmissionWith(entsubmission.IDEQ(sid)))
	}

	votes, err := q.
		Where(
			entvote.HasCategoryWith(
				entvotecategory.HasHackathonWith(enthackathon.IDEQ(hackathonID)),
			),
		).
		WithCategory(func(cq *ent.VoteCategoryQuery) { cq.WithHackathon() }).
		WithVoter().
		WithSubmission().
		All(ctx)
	if err != nil {
		slog.Error("query votes", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query votes")
	}

	entries := make([]*voteEntities.Vote, 0, len(votes))
	for _, v := range votes {
		entries = append(entries, voteEntryFromEnt(v))
	}

	return &voteMsgs.ListVotesResponse{Votes: entries}, nil
}

func (s *VoteService) ExportVotes(
	ctx context.Context,
	req *voteMsgs.ExportVotesRequest,
) (*voteMsgs.ExportVotesResponse, error) {
	categoryID, err := uuid.Parse(req.GetCategoryId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}

	category, err := s.dbClient.VoteCategory.Query().
		Where(entvotecategory.IDEQ(categoryID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "vote category %s not found", categoryID)
		}
		slog.Error("query vote category", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote category")
	}

	if err := s.enforcer.RequirePermission(
		ctx, category.Edges.Hackathon.ID.String(), m.Vote, m.Read,
	); err != nil {
		return nil, err
	}

	votes, err := s.dbClient.Vote.Query().
		Where(entvote.HasCategoryWith(entvotecategory.IDEQ(categoryID))).
		WithVoter().
		WithSubmission().
		All(ctx)
	if err != nil {
		slog.Error("query votes for export", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query votes")
	}

	var data []byte
	switch req.GetFormat() {
	case voteMsgs.ExportFormat_EXPORT_FORMAT_CSV:
		data, err = s.exportVotesCSV(votes)
	case voteMsgs.ExportFormat_EXPORT_FORMAT_JSON:
		data, err = json.MarshalIndent(votesToExportRows(votes), "", "  ")
	case voteMsgs.ExportFormat_EXPORT_FORMAT_UNSPECIFIED:
		return nil, status.Errorf(
			codes.InvalidArgument,
			"export format must not be UNSPECIFIED",
		)
	default:
		return nil, status.Errorf(
			codes.InvalidArgument,
			"unknown export format: %v",
			req.GetFormat(),
		)
	}
	if err != nil {
		slog.Error("serialize votes", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't serialize votes: %v", err)
	}

	return &voteMsgs.ExportVotesResponse{Data: data}, nil
}

func (s *VoteService) exportVotesCSV(votes []*ent.Vote) ([]byte, error) {
	var sb strings.Builder
	w := csv.NewWriter(&sb)

	// Header
	if err := w.Write([]string{"vote_id", "voter_keycloak_id", "submission_id", "vote_type", "value"}); err != nil {
		return nil, err
	}

	for _, v := range votes {
		voterKCID := ""
		if v.Edges.Voter != nil {
			voterKCID = v.Edges.Voter.KeycloakID
		}
		submissionID := ""
		if v.Edges.Submission != nil {
			submissionID = v.Edges.Submission.ID.String()
		}
		if err := w.Write([]string{
			v.ID.String(),
			voterKCID,
			submissionID,
			string(v.VoteType),
			strconv.Itoa(v.Value),
		}); err != nil {
			return nil, err
		}
	}

	w.Flush()
	return []byte(sb.String()), w.Error()
}

type voteExportRow struct {
	VoteID          string `json:"voteID"`
	VoterKeycloakID string `json:"voterKeycloakID"`
	SubmissionID    string `json:"submissionID"`
	VoteType        string `json:"voteType"`
	Value           int    `json:"value"`
}

func votesToExportRows(votes []*ent.Vote) []voteExportRow {
	rows := make([]voteExportRow, 0, len(votes))
	for _, v := range votes {
		row := voteExportRow{
			VoteID:          v.ID.String(),
			VoteType:        string(v.VoteType),
			Value:           v.Value,
			VoterKeycloakID: "",
			SubmissionID:    "",
		}
		if v.Edges.Voter != nil {
			row.VoterKeycloakID = v.Edges.Voter.KeycloakID
		}
		if v.Edges.Submission != nil {
			row.SubmissionID = v.Edges.Submission.ID.String()
		}
		rows = append(rows, row)
	}
	return rows
}

func (s *VoteService) ListVoteResults(
	ctx context.Context,
	req *voteMsgs.ListVoteResultsRequest,
) (*voteMsgs.ListVoteResultsResponse, error) {
	categoryID, err := uuid.Parse(req.GetCategoryId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}

	category, err := s.dbClient.VoteCategory.Query().
		Where(entvotecategory.IDEQ(categoryID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"vote category %s not found",
				req.GetCategoryId(),
			)
		}
		slog.Error("query vote category", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote category")
	}

	if err := s.enforcer.RequirePermission(
		ctx, category.Edges.Hackathon.ID.String(), m.VoteResult, m.Read,
	); err != nil {
		return nil, err
	}

	results, err := s.dbClient.VoteResult.Query().
		Where(entvoteresult.HasVoteCategoryWith(entvotecategory.IDEQ(categoryID))).
		WithSubmission().
		All(ctx)
	if err != nil {
		slog.Error("query vote results", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote results")
	}

	entries := make([]*voteEntities.VoteResult, 0, len(results))
	for _, r := range results {
		entries = append(entries, voteResultEntryFromEnt(r))
	}

	return &voteMsgs.ListVoteResultsResponse{VoteResults: entries}, nil
}

func (s *VoteService) CreateVoteResult(
	ctx context.Context,
	req *voteMsgs.CreateVoteResultRequest,
) (*voteMsgs.CreateVoteResultResponse, error) {
	_, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	categoryID, err := uuid.Parse(req.GetCategoryId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}
	submissionID, err := uuid.Parse(req.GetSubmissionId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid submission_id: %v", err)
	}

	// Get category to find hackathon ID for permission check
	category, err := s.dbClient.VoteCategory.Query().
		Where(entvotecategory.IDEQ(categoryID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"vote category %s not found",
				req.GetCategoryId(),
			)
		}
		slog.Error("query vote category", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote category")
	}

	if err := s.enforcer.RequirePermission(
		ctx, category.Edges.Hackathon.ID.String(), m.VoteResult, m.Create,
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

	result, err := create.Save(ctx)
	if err != nil {
		slog.Error("create vote result", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't create vote result: %v", err)
	}

	// Re-fetch with edges for response
	result, err = s.dbClient.VoteResult.Query().
		Where(entvoteresult.IDEQ(result.ID)).
		WithSubmission().
		Only(ctx)
	if err != nil {
		slog.Error("re-query vote result", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't re-query vote result: %v", err)
	}

	return &voteMsgs.CreateVoteResultResponse{VoteResult: voteResultEntryFromEnt(result)}, nil
}

func (s *VoteService) EditVoteResult(
	ctx context.Context,
	req *voteMsgs.EditVoteResultRequest,
) (*voteMsgs.EditVoteResultResponse, error) {
	_, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	resultID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid result_id: %v", err)
	}

	result, err := s.dbClient.VoteResult.Query().
		Where(entvoteresult.IDEQ(resultID)).
		WithVoteCategory(func(q *ent.VoteCategoryQuery) { q.WithHackathon() }).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "vote result %s not found", req.GetId())
		}
		slog.Error("query vote result", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote result")
	}

	if err := s.enforcer.RequirePermission(
		ctx, result.Edges.VoteCategory.Edges.Hackathon.ID.String(), m.VoteResult, m.Write,
	); err != nil {
		return nil, err
	}

	update := s.dbClient.VoteResult.UpdateOne(result)

	if req.Position != nil {
		update.SetPosition(int(req.GetPosition()))
	}
	if req.Title != nil {
		update.SetTitle(req.GetTitle())
	}
	if req.SubmissionId != nil {
		sid, parseErr := uuid.Parse(req.GetSubmissionId())
		if parseErr != nil {
			return nil, status.Errorf(
				codes.InvalidArgument,
				"invalid submission_id: %v",
				req.GetSubmissionId(),
			)
		}
		update.SetSubmissionID(sid)
	}

	updated, err := update.Save(ctx)
	if err != nil {
		slog.Error("edit vote result", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't edit vote result: %v", err)
	}

	// Re-fetch with edges for response
	updated, err = s.dbClient.VoteResult.Query().
		Where(entvoteresult.IDEQ(updated.ID)).
		WithSubmission().
		Only(ctx)
	if err != nil {
		slog.Error("re-query vote result", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't re-query vote result: %v", err)
	}

	return &voteMsgs.EditVoteResultResponse{VoteResult: voteResultEntryFromEnt(updated)}, nil
}

func (s *VoteService) DeleteVoteResult(
	ctx context.Context,
	req *voteMsgs.DeleteVoteResultRequest,
) (*voteMsgs.DeleteVoteResultResponse, error) {
	_, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	resultID, err := uuid.Parse(req.GetId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid result_id: %v", err)
	}

	result, err := s.dbClient.VoteResult.Query().
		Where(entvoteresult.IDEQ(resultID)).
		WithVoteCategory(func(q *ent.VoteCategoryQuery) { q.WithHackathon() }).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "vote result %s not found", req.GetId())
		}
		slog.Error("query vote result", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote result")
	}

	if err := s.enforcer.RequirePermission(
		ctx, result.Edges.VoteCategory.Edges.Hackathon.ID.String(), m.VoteResult, m.Write,
	); err != nil {
		return nil, err
	}

	if err := s.dbClient.VoteResult.DeleteOne(result).Exec(ctx); err != nil {
		slog.Error("delete vote result", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't delete vote result: %v", err)
	}

	return &voteMsgs.DeleteVoteResultResponse{}, nil
}

func (s *VoteService) SuggestResults(
	ctx context.Context,
	req *voteMsgs.SuggestResultsRequest,
) (*voteMsgs.SuggestResultsResponse, error) {
	_, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	categoryID, err := uuid.Parse(req.GetCategoryId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}

	// Get category to find hackathon ID for permission check
	category, err := s.dbClient.VoteCategory.Query().
		Where(entvotecategory.IDEQ(categoryID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"vote category %s not found", req.GetCategoryId(),
			)
		}
		slog.Error("query vote category", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote category")
	}

	if err := s.enforcer.RequirePermission(
		ctx, category.Edges.Hackathon.ID.String(), m.VoteResult, m.Create,
	); err != nil {
		return nil, err
	}

	// Check if results already exist
	existingCount, err := s.dbClient.VoteResult.Query().
		Where(entvoteresult.HasVoteCategoryWith(entvotecategory.IDEQ(categoryID))).
		Count(ctx)
	if err != nil {
		slog.Error("query existing results", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query existing results")
	}
	if existingCount > 0 && !req.GetForce() {
		return nil, status.Errorf(
			codes.FailedPrecondition,
			"%d result(s) already exist for this category; set force=true to overwrite",
			existingCount,
		)
	}
	if existingCount > 0 && req.GetForce() {
		// Delete existing results before recomputing
		if _, err := s.dbClient.VoteResult.Delete().
			Where(entvoteresult.HasVoteCategoryWith(entvotecategory.IDEQ(categoryID))).
			Exec(ctx); err != nil {
			slog.Error("delete existing results", "err", err)
			return nil, status.Error(codes.Internal, "couldn't delete existing results")
		}
	}

	// Get all votes for this category
	votes, err := s.dbClient.Vote.Query().
		Where(entvote.HasCategoryWith(entvotecategory.IDEQ(categoryID))).
		WithSubmission().
		All(ctx)
	if err != nil {
		slog.Error("query votes", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query votes")
	}

	// Compute results based on voting method
	results, err := s.computeResults(category, votes)
	if err != nil {
		return nil, err
	}

	// Create VoteResults
	created := make([]*voteEntities.VoteResult, 0, len(results))
	for _, r := range results {
		create := s.dbClient.VoteResult.Create().
			SetVoteCategoryID(categoryID).
			SetSubmissionID(r.submissionID).
			SetPosition(r.position)
		result, err := create.Save(ctx)
		if err != nil {
			slog.Error("create vote result", "err", err)
			return nil, status.Errorf(codes.Internal, "couldn't create vote result: %v", err)
		}
		// Re-fetch with edges for response
		result, err = s.dbClient.VoteResult.Query().
			Where(entvoteresult.IDEQ(result.ID)).
			WithSubmission().
			Only(ctx)
		if err != nil {
			slog.Error("re-query vote result", "err", err)
			return nil, status.Errorf(codes.Internal, "couldn't re-query vote result: %v", err)
		}
		created = append(created, voteResultEntryFromEnt(result))
	}

	return &voteMsgs.SuggestResultsResponse{Results: created}, nil
}

// submissionScore holds the computed score and position for a submission.
type submissionScore struct {
	submissionID uuid.UUID
	score        float64
	position     int
}

// computeResults computes VoteResults from votes using the appropriate algorithm.
func (s *VoteService) computeResults(
	category *ent.VoteCategory,
	votes []*ent.Vote,
) ([]*submissionScore, error) {
	// Collect all unique submissions that received votes
	submissionMap := make(map[uuid.UUID]*ent.Submission)
	for _, v := range votes {
		if v.Edges.Submission != nil {
			submissionMap[v.Edges.Submission.ID] = v.Edges.Submission
		}
	}

	// Compute scores per submission
	scores := make(map[uuid.UUID]float64)
	for subID := range submissionMap {
		scores[subID] = 0
	}

	switch category.VotingMethod {
	case entvotecategory.VotingMethodSingleChoice:
		for _, v := range votes {
			if v.Edges.Submission != nil {
				scores[v.Edges.Submission.ID]++
			}
		}
	case entvotecategory.VotingMethodRanked:
		// Borda count: N = number of unique submissions
		n := len(submissionMap)
		if n == 0 {
			return nil, status.Error(codes.InvalidArgument, "no submissions received votes")
		}
		for _, v := range votes {
			if v.Edges.Submission != nil {
				// Rank 1 = N-1 points, Rank 2 = N-2, etc.
				score := float64(n - v.Value)
				scores[v.Edges.Submission.ID] += score
			}
		}
	case entvotecategory.VotingMethodPoints:
		for _, v := range votes {
			if v.Edges.Submission != nil {
				scores[v.Edges.Submission.ID] += float64(v.Value)
			}
		}
	default:
		return nil, status.Errorf(
			codes.InvalidArgument,
			"unknown voting method: %v",
			category.VotingMethod,
		)
	}

	// Build sorted list of scores
	scoreList := make([]*submissionScore, 0, len(scores))
	for subID, score := range scores {
		scoreList = append(scoreList, &submissionScore{
			submissionID: subID,
			score:        score,
			position:     0,
		})
	}

	// Sort by score descending
	sort.Slice(scoreList, func(i, j int) bool {
		return scoreList[i].score > scoreList[j].score
	})

	// Assign positions with ties sharing the same position
	results := make([]*submissionScore, 0, len(scoreList))
	for i, s := range scoreList {
		position := i + 1
		if i > 0 && s.score == scoreList[i-1].score {
			position = results[len(results)-1].position
		}
		results = append(results, &submissionScore{
			submissionID: s.submissionID,
			score:        s.score,
			position:     position,
		})
	}

	return results, nil
}

func (s *VoteService) ExportResults(
	ctx context.Context,
	req *voteMsgs.ExportResultsRequest,
) (*voteMsgs.ExportResultsResponse, error) {
	categoryID, err := uuid.Parse(req.GetCategoryId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid category_id: %v", err)
	}

	category, err := s.dbClient.VoteCategory.Query().
		Where(entvotecategory.IDEQ(categoryID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "vote category %s not found", categoryID)
		}
		slog.Error("query vote category", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query vote category")
	}

	if err := s.enforcer.RequirePermission(
		ctx, category.Edges.Hackathon.ID.String(), m.VoteResult, m.Read,
	); err != nil {
		return nil, err
	}

	results, err := s.dbClient.VoteResult.Query().
		Where(entvoteresult.HasVoteCategoryWith(entvotecategory.IDEQ(categoryID))).
		WithSubmission().
		All(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"vote result for category %s not found",
				categoryID,
			)
		}
		slog.Error("query results for export", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query results")
	}

	var data []byte
	switch req.GetFormat() {
	case voteMsgs.ExportFormat_EXPORT_FORMAT_CSV:
		data, err = s.exportResultsCSV(results)
	case voteMsgs.ExportFormat_EXPORT_FORMAT_JSON:
		data, err = json.MarshalIndent(resultsToExportRows(results), "", "  ")
	case voteMsgs.ExportFormat_EXPORT_FORMAT_UNSPECIFIED:
		return nil, status.Errorf(
			codes.InvalidArgument,
			"export format must not be UNSPECIFIED",
		)
	default:
		return nil, status.Errorf(
			codes.InvalidArgument,
			"unknown export format: %v",
			req.GetFormat(),
		)
	}
	if err != nil {
		slog.Error("serialize results", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't serialize results: %v", err)
	}

	return &voteMsgs.ExportResultsResponse{Data: data}, nil
}

func (s *VoteService) exportResultsCSV(results []*ent.VoteResult) ([]byte, error) {
	var sb strings.Builder
	w := csv.NewWriter(&sb)

	if err := w.Write([]string{"result_id", "submission_id", "position", "title"}); err != nil {
		return nil, err
	}

	for _, r := range results {
		submissionID := ""
		if r.Edges.Submission != nil {
			submissionID = r.Edges.Submission.ID.String()
		}
		title := ""
		if r.Title != "" {
			title = r.Title
		}
		if err := w.Write([]string{
			r.ID.String(),
			submissionID,
			strconv.Itoa(r.Position),
			title,
		}); err != nil {
			return nil, err
		}
	}

	w.Flush()
	return []byte(sb.String()), w.Error()
}

type resultExportRow struct {
	ResultID     string  `json:"resultID"`
	SubmissionID string  `json:"submissionID"`
	Position     int     `json:"position"`
	Title        *string `json:"title,omitempty"`
}

func resultsToExportRows(results []*ent.VoteResult) []resultExportRow {
	rows := make([]resultExportRow, 0, len(results))
	for _, r := range results {
		row := resultExportRow{
			ResultID:     r.ID.String(),
			Position:     r.Position,
			SubmissionID: "",
			Title:        nil,
		}
		if r.Edges.Submission != nil {
			row.SubmissionID = r.Edges.Submission.ID.String()
		}
		if r.Title != "" {
			row.Title = &r.Title
		}
		rows = append(rows, row)
	}
	return rows
}
