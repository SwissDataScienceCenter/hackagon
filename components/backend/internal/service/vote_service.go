package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"log/slog"
	"sort"
	"strconv"
	"sync"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	enthackathonforms "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonforms"
	enthackathonsettings "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonsettings"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent/predicate"
	entproject "github.com/swissdatasciencecenter/hackagon/components/backend/ent/project"
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
	// ballotMu serializes writeBallot. The unique index guards
	// (category, voter, submission), so it says nothing about a SECOND ballot
	// for a different submission — and the pre-check + delete-and-rewrite in
	// writeBallot is check-then-act: two concurrent submits from one voter both
	// passed the pre-check and both wrote (measured: 7 of 12 hammer rounds
	// ended with two single-choice ballots for one voter in one category).
	// A partial unique index would close it in the database, but ent cannot
	// express one; an in-process lock closes it for this single-instance
	// deployment. One mutex, not per-voter: a ballot write is a few
	// milliseconds, and votes arrive at human speed.
	ballotMu sync.Mutex
}

func NewVoteService(dbClient *ent.Client, enf *m.Enforcer) *VoteService {
	//exhaustruct:ignore // ballotMu: zero-value sync.Mutex is the usable initial state
	return &VoteService{
		UnimplementedVoteServiceServer: vote.UnimplementedVoteServiceServer{},
		dbClient:                       dbClient,
		enforcer:                       enf,
	}
}

// ─── Enum mappers ────────────────────────────────────────────────────

// UNSPECIFIED (and any future value) is deliberately unmappable.
//
//nolint:exhaustive // already falls into default, the correct "unmappable" answer via the bool ok return
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

// voteTypeForMethod names the row discriminator a category's method produces.
// The two enums are separate ent types with the same three values, so the
// mapping is written out rather than cast.
func voteTypeForMethod(v votecategoryMethod) entvote.VoteType {
	switch v {
	case entvotecategory.VotingMethodRanked:
		return entvote.VoteTypeRanked
	case entvotecategory.VotingMethodPoints:
		return entvote.VoteTypePoints
	default:
		return entvote.VoteTypeSingleChoice
	}
}

// UNSPECIFIED (and any future value) is deliberately unmappable.
//
//nolint:exhaustive // already falls into default, the correct "unmappable" answer via the bool ok return
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
// JuryMembers eager-loaded) to its proto entity.
func voteCategoryEntryFromEnt(c *ent.VoteCategory) *voteEnts.VoteCategory {
	//exhaustruct:ignore
	entry := &voteEnts.VoteCategory{
		Id:           c.ID.String(),
		Name:         c.Name,
		Description:  c.Description,
		VotingMethod: votingMethodFromEnt(c.VotingMethod),
		VoterType:    voterTypeFromEnt(c.VoterType),
		CreatedAt:    c.CreatedAt.Unix(),
		ModifiedAt:   c.ModifiedAt.Unix(),
	}
	// Optional, not Nillable, so zero is how "no budget" reaches us — and a
	// budget of zero would be a category nobody can vote in anyway.
	if c.MaxPoints > 0 {
		//nolint:gosec // G115: resolveMaxPoints only ever stores a value that came
		// in as int32 from the proto request, so this round trip cannot overflow.
		maxPoints := int32(c.MaxPoints)
		entry.MaxPoints = &maxPoints
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
	if _, _, err := m.RequireUser(ctx); err != nil {
		return nil, err
	}
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	// Member-scoped, never anonymous: the entry mapper embeds jury members'
	// emails, so leaving this on RequireSubject let anyone who could name a
	// private event's id read its jury roster.
	if err := s.enforcer.RequirePermission(
		ctx, hackathonID.String(), m.Hackathon, m.Read,
	); err != nil {
		return nil, err
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
	if _, _, err := m.RequireUser(ctx); err != nil {
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
	// Member-scoped for the same reason as List: the entry carries jury emails.
	if err := s.enforcer.RequirePermission(
		ctx, c.Edges.Hackathon.ID.String(), m.Hackathon, m.Read,
	); err != nil {
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
	maxPoints, err := resolveMaxPoints(method, req.MaxPoints, 0)
	if err != nil {
		return nil, err
	}

	create := s.dbClient.VoteCategory.Create().
		SetHackathonID(hackathonID).
		SetName(req.GetName()).
		SetDescription(req.GetDescription()).
		SetVotingMethod(method).
		SetVoterType(voter).
		SetMaxPoints(maxPoints).
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
	method := c.VotingMethod
	if req.VotingMethod != nil {
		requested, ok := votingMethodToEnt(req.GetVotingMethod())
		if !ok {
			return nil, status.Errorf(codes.InvalidArgument, "invalid voting_method")
		}
		if err := s.methodChangeAllowed(ctx, id, c.VotingMethod, requested); err != nil {
			return nil, err
		}
		method = requested
		update.SetVotingMethod(method)
	}
	maxPoints, err := resolveMaxPoints(method, req.MaxPoints, c.MaxPoints)
	if err != nil {
		return nil, err
	}
	update.SetMaxPoints(maxPoints)
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

// methodChangeAllowed refuses to re-shape a category people have already voted
// in. Ballots are cast in the shape the method dictates: a ranked row means
// nothing under points scoring, and a category holding two kinds of row tallies
// to nonsense. Deleting the category is the explicit way to throw ballots away.
func (s *VoteService) methodChangeAllowed(
	ctx context.Context,
	categoryID uuid.UUID,
	current, requested votecategoryMethod,
) error {
	if requested == current {
		return nil
	}
	cast, err := s.dbClient.Vote.Query().
		Where(entvote.HasCategoryWith(entvotecategory.IDEQ(categoryID))).
		Exist(ctx)
	if err != nil {
		slog.Error("query votes for method change", "err", err)

		return status.Error(codes.Internal, "couldn't query database")
	}
	if cast {
		return status.Error(codes.FailedPrecondition,
			"ballots have already been cast in this category — its voting method cannot change")
	}

	return nil
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

// voteEntryFromEnt maps an ent Vote (with Category, Voter, Submission
// eager-loaded) to its proto entity. One row is one judgment on one submission,
// so a ranked or points ballot maps to several of these.
func voteEntryFromEnt(v *ent.Vote) *voteEnts.Vote {
	//exhaustruct:ignore
	entry := &voteEnts.Vote{
		Id:         v.ID.String(),
		CreatedAt:  v.CreatedAt.Unix(),
		ModifiedAt: v.ModifiedAt.Unix(),
	}
	if v.Edges.Category != nil {
		entry.CategoryId = v.Edges.Category.ID.String()
	}
	if v.Edges.Voter != nil {
		entry.VoterId = v.Edges.Voter.ID.String()
	}
	if v.Edges.Submission == nil {
		return entry
	}
	submissionID := v.Edges.Submission.ID.String()
	//nolint:gosec // G115: writeBallot only ever stores a rank/points value that
	// came in as int32 from the proto ballot, so this round trip cannot overflow.
	value := int32(v.Value)
	switch v.VoteType {
	case entvote.VoteTypeSingleChoice:
		entry.Vote = &voteEnts.Vote_SingleChoice{
			SingleChoice: &voteEnts.SingleChoiceVote{SubmissionId: submissionID},
		}
	case entvote.VoteTypeRanked:
		entry.Vote = &voteEnts.Vote_Ranked{
			Ranked: &voteEnts.RankedVote{SubmissionId: submissionID, Rank: value},
		}
	case entvote.VoteTypePoints:
		entry.Vote = &voteEnts.Vote_Points{
			Points: &voteEnts.PointsVote{SubmissionId: submissionID, Points: value},
		}
	}

	return entry
}

// ballotLine is one row a ballot will produce: which submission, and the rank
// or point award attached to it (zero for single_choice).
type ballotLine struct {
	submissionID uuid.UUID
	value        int
}

// parseBallot pulls the category, the method and the rows out of whichever
// oneof variant the caller filled in. It does not consult the category — the
// caller does that, because refusing a ballot for the wrong method needs the
// category loaded first.
func parseBallot(
	req *voteMsgs.SubmitVoteRequest,
) (uuid.UUID, entvote.VoteType, []ballotLine, error) {
	fail := func(format string, args ...any) (uuid.UUID, entvote.VoteType, []ballotLine, error) {
		return uuid.Nil, "", nil, status.Errorf(codes.InvalidArgument, format, args...)
	}

	switch v := req.GetVote().(type) {
	case *voteMsgs.SubmitVoteRequest_SingleChoice:
		categoryID, err := uuid.Parse(v.SingleChoice.GetCategoryId())
		if err != nil {
			return fail("invalid category_id: %v", err)
		}
		submissionID, err := uuid.Parse(v.SingleChoice.GetSubmissionId())
		if err != nil {
			return fail("invalid submission_id: %v", err)
		}

		return categoryID, entvote.VoteTypeSingleChoice,
			[]ballotLine{{submissionID: submissionID, value: 0}}, nil

	case *voteMsgs.SubmitVoteRequest_Ranked:
		categoryID, err := uuid.Parse(v.Ranked.GetCategoryId())
		if err != nil {
			return fail("invalid category_id: %v", err)
		}
		lines := make([]ballotLine, 0, len(v.Ranked.GetSubmissions()))
		for _, entry := range v.Ranked.GetSubmissions() {
			submissionID, err := uuid.Parse(entry.GetSubmissionId())
			if err != nil {
				return fail("invalid submission_id: %v", err)
			}
			lines = append(lines, ballotLine{
				submissionID: submissionID,
				value:        int(entry.GetRank()),
			})
		}

		return categoryID, entvote.VoteTypeRanked, lines, nil

	case *voteMsgs.SubmitVoteRequest_Points:
		categoryID, err := uuid.Parse(v.Points.GetCategoryId())
		if err != nil {
			return fail("invalid category_id: %v", err)
		}
		lines := make([]ballotLine, 0, len(v.Points.GetSubmissions()))
		for _, entry := range v.Points.GetSubmissions() {
			submissionID, err := uuid.Parse(entry.GetSubmissionId())
			if err != nil {
				return fail("invalid submission_id: %v", err)
			}
			lines = append(lines, ballotLine{
				submissionID: submissionID,
				value:        int(entry.GetPoints()),
			})
		}

		return categoryID, entvote.VoteTypePoints, lines, nil

	default:
		return fail("a ballot must carry single_choice, ranked or points")
	}
}

// validateBallot applies the rules that belong to the method itself. Anything
// needing the database (does this submission belong to the event, has this
// voter already voted) is checked by the caller.
func validateBallot(c *ent.VoteCategory, method entvote.VoteType, lines []ballotLine) error {
	if len(lines) == 0 {
		return status.Error(codes.InvalidArgument, "a ballot must name at least one submission")
	}
	// A submission twice in one ballot is a double vote wearing a ranking.
	seen := make(map[uuid.UUID]struct{}, len(lines))
	for _, l := range lines {
		if _, dup := seen[l.submissionID]; dup {
			return status.Errorf(codes.InvalidArgument,
				"submission %s appears twice in the same ballot", l.submissionID)
		}
		seen[l.submissionID] = struct{}{}
	}

	switch method {
	case entvote.VoteTypeSingleChoice:
		if len(lines) != 1 {
			return status.Error(codes.InvalidArgument,
				"a single_choice ballot names exactly one submission")
		}

	case entvote.VoteTypeRanked:
		// Ranks must be a contiguous 1..N. A gap or a repeat makes Borda count
		// something the voter did not mean: with N submissions ranked 1,1,3 two
		// of them share a first preference that only one voter cast.
		ranks := make([]int, 0, len(lines))
		for _, l := range lines {
			ranks = append(ranks, l.value)
		}
		sort.Ints(ranks)
		for i, r := range ranks {
			if r != i+1 {
				return status.Errorf(codes.InvalidArgument,
					"ranks must be 1..%d with no gaps and no repeats", len(lines))
			}
		}

	case entvote.VoteTypePoints:
		if c.MaxPoints <= 0 {
			return status.Error(codes.FailedPrecondition,
				"this points category has no points budget — an organizer must set max_points")
		}
		total := 0
		for _, l := range lines {
			if l.value <= 0 {
				return status.Error(codes.InvalidArgument,
					"every points award must be greater than zero")
			}
			total += l.value
		}
		if total > c.MaxPoints {
			return status.Errorf(codes.InvalidArgument,
				"this ballot spends %d points but the category allows %d", total, c.MaxPoints)
		}
	}

	return nil
}

// submissionsInHackathon refuses a ballot naming a submission from another
// event. A submission belongs to a hackathon through its project.
func (s *VoteService) submissionsInHackathon(
	ctx context.Context,
	hackathonID uuid.UUID,
	lines []ballotLine,
) error {
	ids := make([]uuid.UUID, 0, len(lines))
	for _, l := range lines {
		ids = append(ids, l.submissionID)
	}
	found, err := s.dbClient.Submission.Query().
		Where(
			entsubmission.IDIn(ids...),
			entsubmission.HasProjectWith(entproject.HasHackathonWith(enthackathon.IDEQ(hackathonID))),
		).
		Count(ctx)
	if err != nil {
		slog.Error("query ballot submissions", "err", err)

		return status.Error(codes.Internal, "couldn't query database")
	}
	if found != len(ids) {
		return status.Error(codes.InvalidArgument,
			"a ballot may only name submissions from this hackathon")
	}

	return nil
}

// resolveMaxPoints decides what max_points a category should carry given the
// method it will have. Points categories must have a positive budget or nobody
// can cast a valid ballot; the other methods carry none.
func resolveMaxPoints(
	method votecategoryMethod,
	requested *int32,
	current int,
) (int, error) {
	if method != entvotecategory.VotingMethodPoints {
		return 0, nil
	}
	effective := current
	if requested != nil {
		effective = int(*requested)
	}
	if effective <= 0 {
		return 0, status.Error(codes.InvalidArgument,
			"points categories need max_points greater than zero")
	}

	return effective, nil
}

// SubmitVote casts one ballot. The voter must be a confirmed participant of
// the category's hackathon (organizers/admins are NOT exempt — voting is a
// participant act), voting must be open (settings.voting_enabled), and for
// jury categories the voter must be on the jury. One ballot per voter per
// category, which the handler now enforces itself: a ranked ballot is several
// rows sharing a (category, voter), so the unique index moved down to the
// submission and can no longer say "you already voted".
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

// mayVote answers whether this voter is allowed to cast this ballot in this
// category: jury membership for jury categories, and for everyone else the
// organizer's own ruling plus confirmed participation.
func (s *VoteService) mayVote(
	ctx context.Context,
	c *ent.VoteCategory,
	uid string,
	voter *ent.User,
	lines []ballotLine,
) error {
	hackathonID := c.Edges.Hackathon.ID

	if c.VoterType == entvotecategory.VoterTypeJury {
		for _, j := range c.Edges.JuryMembers {
			if j.ID == voter.ID {
				return nil
			}
		}

		return status.Error(codes.PermissionDenied, "only jury members may vote in this category")
	}

	// The organizer's own ruling, not a constant. Both fields were stored by
	// SetVotingPolicy and then never read: organizerVoting was hard-coded here
	// and ownTeamVoting was enforced nowhere at all, so an event that set either
	// one got no effect from it.
	policy := s.votingPolicyFor(ctx, hackathonID)

	// Organizers are neutral by default: whoever runs the event does not also
	// vote in it. An event that says otherwise may.
	if !policy.organizerVoting && s.isOrganizer(uid, hackathonID) {
		return status.Error(codes.PermissionDenied, "organizers do not vote")
	}

	// Voting for the submission of a team you are on. Allowed unless the event
	// forbids it — a small hackathon where everyone knows everyone often wants
	// it, and a competitive one does not.
	if !policy.ownTeamVoting {
		ids := make([]uuid.UUID, 0, len(lines))
		for _, l := range lines {
			ids = append(ids, l.submissionID)
		}
		ownTeam, err := s.dbClient.Submission.Query().
			Where(
				entsubmission.IDIn(ids...),
				entsubmission.HasTeamWith(entteam.HasMembersWith(entuser.IDEQ(voter.ID))),
			).
			Exist(ctx)
		if err != nil {
			slog.Error("query own-team submission", "err", err)

			return status.Error(codes.Internal, "couldn't query database")
		}
		if ownTeam {
			return status.Error(codes.PermissionDenied,
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

		return status.Error(codes.Internal, "couldn't query database")
	}
	if !confirmed {
		return status.Error(codes.PermissionDenied, "only confirmed participants may vote")
	}

	return nil
}

// isOrganizer is true for a hackathon Owner and for a global Admin. A role
// lookup that errors is read as "not an organizer": the participant check
// below is the one that has to hold, and a casbin hiccup must not hand someone
// a ballot they would otherwise be refused.
func (s *VoteService) isOrganizer(uid string, hackathonID uuid.UUID) bool {
	if role, err := s.enforcer.GetHackathonRole(uid, hackathonID.String()); err == nil &&
		role == hackEnts.HackathonRole_HACKATHON_ROLE_OWNER {
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

	categoryID, method, lines, err := parseBallot(req)
	if err != nil {
		return nil, err
	}

	c, err := s.categoryWithHackathon(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	// The organizer picks the method; the ballot has to be cast in it. A ranked
	// payload against a single_choice category is a client bug, not a vote.
	if want := voteTypeForMethod(c.VotingMethod); want != method {
		return nil, status.Errorf(codes.InvalidArgument,
			"this category takes %s ballots, not %s", want, method)
	}
	if err := validateBallot(c, method, lines); err != nil {
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

	if err := s.mayVote(ctx, c, uid, voter, lines); err != nil {
		return nil, err
	}

	// Every submission on the ballot has to be this event's. The unique index
	// used to make voting for a foreign submission merely odd; nothing ever
	// refused it.
	if err := s.submissionsInHackathon(ctx, hackathonID, lines); err != nil {
		return nil, err
	}

	written, err := s.writeBallot(ctx, c, voter.ID, method, lines)
	if err != nil {
		return nil, err
	}

	entries := make([]*voteEnts.Vote, 0, len(written))
	for _, v := range written {
		entries = append(entries, voteEntryFromEnt(v))
	}
	if len(entries) == 0 {
		return nil, status.Error(codes.Internal, "the ballot recorded no votes")
	}

	return &voteMsgs.SubmitVoteResponse{Vote: entries[0], Votes: entries}, nil
}

// writeBallot is where "one ballot per voter per category" now lives. The DB
// index guards (category, voter, submission) so that one voter cannot rank the
// same submission twice; it says nothing at all about a SECOND ballot, which
// used to come back as AlreadyExists for free.
//
// So: refuse outright if this voter already has rows in this category, then
// clear and rewrite inside one transaction. The delete is what keeps the
// invariant true if rows ever survive a half-written ballot — without it a
// retry would stack a second ballot on top of the first.
func (s *VoteService) writeBallot(
	ctx context.Context,
	c *ent.VoteCategory,
	voterID uuid.UUID,
	method entvote.VoteType,
	lines []ballotLine,
) ([]*ent.Vote, error) {
	// The pre-check below and the delete-and-rewrite are one decision; without
	// this lock two concurrent submits both saw "no ballot yet" and both wrote.
	s.ballotMu.Lock()
	defer s.ballotMu.Unlock()

	mine := []predicate.Vote{
		entvote.HasCategoryWith(entvotecategory.IDEQ(c.ID)),
		entvote.HasVoterWith(entuser.IDEQ(voterID)),
	}
	voted, err := s.dbClient.Vote.Query().Where(mine...).Exist(ctx)
	if err != nil {
		slog.Error("query existing ballot", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	if voted {
		return nil, status.Error(codes.AlreadyExists, "already voted in this category")
	}

	txn, err := s.dbClient.Tx(ctx)
	if err != nil {
		slog.Error("start transaction", "err", err)

		return nil, status.Error(codes.Internal, "couldn't start transaction")
	}
	fail := func(err error, msg string) error {
		_ = txn.Rollback()
		if ent.IsConstraintError(err) {
			return status.Error(codes.AlreadyExists, "already voted in this category")
		}
		slog.Error(msg, "err", err)

		return status.Error(codes.Internal, "couldn't record ballot")
	}

	if _, err := txn.Vote.Delete().Where(mine...).Exec(ctx); err != nil {
		return nil, fail(err, "clear previous ballot")
	}

	written := make([]*ent.Vote, 0, len(lines))
	for _, l := range lines {
		create := txn.Vote.Create().
			SetCategoryID(c.ID).
			SetVoterID(voterID).
			SetSubmissionID(l.submissionID).
			SetVoteType(method)
		// single_choice carries no value, and the schema hook rejects a
		// non-positive one on the other two.
		if method != entvote.VoteTypeSingleChoice {
			create.SetValue(l.value)
		}
		row, err := create.Save(ctx)
		if err != nil {
			return nil, fail(err, "create vote")
		}
		written = append(written, row)
	}

	if err := txn.Commit(); err != nil {
		slog.Error("commit ballot", "err", err)

		return nil, status.Error(codes.Internal, "couldn't record ballot")
	}

	// Read back through the normal path so the response carries the same edges
	// every other vote read does.
	out := make([]*ent.Vote, 0, len(written))
	for _, row := range written {
		v, err := s.voteByID(ctx, row.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}

	return out, nil
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
	if _, _, err := m.RequireUser(ctx); err != nil {
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
	// Ballots are secret: gate reading one exactly as ListVotes gates reading
	// many — organizer/admin only. Without this any authenticated member could
	// fetch any voter's ballot by id, and before it an anonymous caller could.
	cat, err := s.categoryWithHackathon(ctx, v.Edges.Category.ID)
	if err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(
		ctx, cat.Edges.Hackathon.ID.String(), m.Hackathon, m.Write,
	); err != nil {
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
	votes, err := s.votesForExport(
		ctx,
		req.GetCategoryId(),
		req.GetVoterId(),
		req.GetSubmissionId(),
	)
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

	// Tags are snake_case on purpose: this struct is the ExportVotes download
	// format an organizer opens externally (and the e2e recipe's
	// exportBallotCount reads `voter_id` off it directly), not a transient
	// in-memory shape — renaming the tags would silently break both.
	//nolint:tagliatelle // persisted export format, see comment above
	type row struct {
		ID           string `json:"id"`
		CategoryID   string `json:"category_id"`
		VoterID      string `json:"voter_id"`
		SubmissionID string `json:"submission_id"`
		VoteType     string `json:"vote_type"`
		// Rank for ranked ballots, points awarded for points ballots, 0 for
		// single choice. Without it an export of a ranked category was a list of
		// names with the ranking stripped out.
		Value int `json:"value"`
	}
	rows := make([]row, 0, len(votes))
	for _, v := range votes {
		//exhaustruct:ignore
		r := row{ID: v.ID.String(), VoteType: string(v.VoteType), Value: v.Value}
		if v.Edges.Category != nil {
			r.CategoryID = v.Edges.Category.ID.String()
		}
		if v.Edges.Voter != nil {
			r.VoterID = v.Edges.Voter.ID.String()
		}
		if v.Edges.Submission != nil {
			r.SubmissionID = v.Edges.Submission.ID.String()
		}
		rows = append(rows, r)
	}

	//nolint:exhaustive // UNSPECIFIED (and any future format) already falls into
	// default, which is the correct "format must be CSV or JSON" answer below.
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
		_ = w.Write(
			[]string{"id", "category_id", "voter_id", "submission_id", "vote_type", "value"},
		)
		for _, r := range rows {
			_ = w.Write([]string{
				r.ID, r.CategoryID, r.VoterID, r.SubmissionID, r.VoteType, strconv.Itoa(r.Value),
			})
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
	//exhaustruct:ignore // CreatedAt/ModifiedAt: ent.VoteResult has no such columns
	entry := &voteEnts.VoteResult{
		Id: r.ID.String(),
		//nolint:gosec // G115: a submission's rank position (a loop index) or a
		// value that came in as int32 from the proto request; cannot overflow.
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
// SuggestResults computes the tally for a category and writes it as results.
//
// SUGGEST, not decide: the vote is advisory here and PrizeService.Finalize is
// what freezes an award, so this fills the table an organizer reviews. Before
// it existed the count lived nowhere — placements were typed in by hand from an
// export, which is the easiest possible place to get "who won" quietly wrong.
//
// All three methods are scored; scoreBallots holds the per-method arithmetic.
func (s *VoteService) SuggestResults(
	ctx context.Context,
	req *voteMsgs.SuggestResultsRequest,
) (*voteMsgs.SuggestResultsResponse, error) {
	if _, _, err := m.RequireUser(ctx); err != nil {
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
	// Same gate as writing a result by hand — this writes the same rows.
	if err := s.enforcer.RequirePermission(
		ctx, c.Edges.Hackathon.ID.String(), m.Hackathon, m.Write,
	); err != nil {
		return nil, err
	}

	existing, err := s.dbClient.VoteResult.Query().
		Where(entvoteresult.HasVoteCategoryWith(entvotecategory.IDEQ(categoryID))).
		All(ctx)
	if err != nil {
		slog.Error("query vote results", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	// A recount that silently replaces a published placement is how a
	// correction becomes an accusation. Make the caller say they mean it.
	if len(existing) > 0 && !req.GetForce() {
		return nil, status.Errorf(
			codes.FailedPrecondition,
			"this category already has %d recorded result(s) — pass force to recompute",
			len(existing),
		)
	}

	votes, err := s.dbClient.Vote.Query().
		Where(entvote.HasCategoryWith(entvotecategory.IDEQ(categoryID))).
		WithSubmission().
		All(ctx)
	if err != nil {
		slog.Error("query votes", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	counts := scoreBallots(c.VotingMethod, votes)
	if len(counts) == 0 {
		return nil, status.Error(
			codes.FailedPrecondition,
			"no ballots have been cast in this category",
		)
	}

	type tally struct {
		submissionID uuid.UUID
		count        int
	}
	ordered := make([]tally, 0, len(counts))
	for id, n := range counts {
		ordered = append(ordered, tally{submissionID: id, count: n})
	}
	// Highest first; the id breaks ties so two runs of the same ballots cannot
	// disagree about the order rows are written in.
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].count != ordered[j].count {
			return ordered[i].count > ordered[j].count
		}

		return ordered[i].submissionID.String() < ordered[j].submissionID.String()
	})

	txn, err := s.dbClient.Tx(ctx)
	if err != nil {
		slog.Error("start transaction", "err", err)

		return nil, status.Error(codes.Internal, "couldn't start transaction")
	}

	if len(existing) > 0 {
		ids := make([]uuid.UUID, 0, len(existing))
		for _, r := range existing {
			ids = append(ids, r.ID)
		}
		if _, err := txn.VoteResult.Delete().
			Where(entvoteresult.IDIn(ids...)).
			Exec(ctx); err != nil {
			_ = txn.Rollback()
			slog.Error("delete previous results", "err", err)

			return nil, status.Error(codes.Internal, "couldn't replace previous results")
		}
	}

	// Ties SHARE a position: two submissions on the same count are both second,
	// and the organizer decides what to do about it rather than the tally
	// inventing an order it cannot justify.
	position := 0
	previous := -1
	written := make([]*ent.VoteResult, 0, len(ordered))
	for i, t := range ordered {
		if t.count != previous {
			position = i + 1
			previous = t.count
		}
		row, err := txn.VoteResult.Create().
			SetVoteCategoryID(categoryID).
			SetSubmissionID(t.submissionID).
			SetPosition(position).
			Save(ctx)
		if err != nil {
			_ = txn.Rollback()
			slog.Error("write suggested result", "err", err)

			return nil, status.Error(codes.Internal, "couldn't write results")
		}
		written = append(written, row)
	}

	if err := txn.Commit(); err != nil {
		slog.Error("commit results", "err", err)

		return nil, status.Error(codes.Internal, "couldn't commit results")
	}

	out := make([]*voteEnts.VoteResult, 0, len(written))
	for _, r := range written {
		out = append(out, voteResultEntryFromEnt(r))
	}

	return &voteMsgs.SuggestResultsResponse{Results: out}, nil
}

// scoreBallots turns a category's raw rows into one score per submission. Every
// submission that appears on any ballot gets a key, so a submission ranked last
// by everyone still places rather than vanishing.
//
//   - single_choice: one point per ballot naming it.
//   - ranked: Borda. With N distinct submissions on the ballots, rank 1 is worth
//     N-1 and rank N is worth 0 — the gap between consecutive ranks is the same
//     everywhere, which is the property that makes ranks addable at all.
//   - points: the sum of what voters awarded it.
func scoreBallots(method votecategoryMethod, votes []*ent.Vote) map[uuid.UUID]int {
	scores := map[uuid.UUID]int{}
	for _, v := range votes {
		if v.Edges.Submission != nil {
			scores[v.Edges.Submission.ID] += 0
		}
	}
	if len(scores) == 0 {
		return scores
	}

	// N is fixed before scoring: it is the size of the field, not of one ballot,
	// so a voter who ranked only some submissions cannot change what a rank is
	// worth to everyone else.
	field := len(scores)
	for _, v := range votes {
		if v.Edges.Submission == nil {
			continue
		}
		switch method {
		case entvotecategory.VotingMethodRanked:
			scores[v.Edges.Submission.ID] += field - v.Value
		case entvotecategory.VotingMethodPoints:
			scores[v.Edges.Submission.ID] += v.Value
		default:
			scores[v.Edges.Submission.ID]++
		}
	}

	return scores
}

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

	// Tags are snake_case on purpose, matching ExportVotes' download format —
	// this struct is the ExportResults download an organizer opens externally,
	// not a transient in-memory shape.
	//nolint:tagliatelle // persisted export format, see comment above
	type row struct {
		ID           string `json:"id"`
		CategoryID   string `json:"category_id"`
		SubmissionID string `json:"submission_id"`
		Position     int    `json:"position"`
		Title        string `json:"title,omitempty"`
	}
	rows := make([]row, 0, len(results))
	for _, r := range results {
		//exhaustruct:ignore
		out := row{ID: r.ID.String(), Position: r.Position, Title: r.Title}
		if r.Edges.VoteCategory != nil {
			out.CategoryID = r.Edges.VoteCategory.ID.String()
		}
		if r.Edges.Submission != nil {
			out.SubmissionID = r.Edges.Submission.ID.String()
		}
		rows = append(rows, out)
	}

	//nolint:exhaustive // UNSPECIFIED (and any future format) already falls into
	// default, which is the correct "format must be CSV or JSON" answer below.
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
			_ = w.Write(
				[]string{r.ID, r.CategoryID, r.SubmissionID, strconv.Itoa(r.Position), r.Title},
			)
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
