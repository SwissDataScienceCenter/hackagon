package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entpage "github.com/swissdatasciencecenter/hackagon/components/backend/ent/page"
	entphase "github.com/swissdatasciencecenter/hackagon/components/backend/ent/phase"
	entproject "github.com/swissdatasciencecenter/hackagon/components/backend/ent/project"
	entsubmission "github.com/swissdatasciencecenter/hackagon/components/backend/ent/submission"
	entteam "github.com/swissdatasciencecenter/hackagon/components/backend/ent/team"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/public_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// PublicService answers unauthenticated callers, and is the only service that
// should.
//
// It holds no enforcer, which is deliberate and worth explaining because every
// other service here takes one. Casbin answers "what may this subject do",
// and the subject is exactly what this service does not have — its callers are
// anonymous.
//
// The gate is applied in the query rather than as a check before it, so a
// private hackathon simply does not match and is reported NotFound. Its
// existence is no more a visitor's business than its contents.
//
// When organizers get to choose what is published, that choice lands here as
// extra filtering; it does not change where the gate lives.
type PublicService struct {
	hackathon.UnimplementedPublicServiceServer
	dbClient *ent.Client
}

func NewPublicService(dbClient *ent.Client) *PublicService {
	return &PublicService{
		UnimplementedPublicServiceServer: hackathon.UnimplementedPublicServiceServer{},
		dbClient:                         dbClient,
	}
}

// ListHackathons returns the public hackathon directory.
func (s *PublicService) ListHackathons(
	ctx context.Context,
	_ *msgs.ListHackathonsRequest,
) (*msgs.ListHackathonsResponse, error) {
	hs, err := s.dbClient.Hackathon.Query().
		Where(enthackathon.VisibilityEQ(enthackathon.VisibilityPublic)).
		Order(ent.Asc(enthackathon.FieldCreatedAt)).
		All(ctx)
	if err != nil {
		slog.Error("query public hackathons", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	now := time.Now()
	entries := make([]*ents.PublicHackathonSummary, 0, len(hs))
	for _, h := range hs {
		entries = append(entries, publicHackathonSummaryFromEnt(h, now))
	}

	return &msgs.ListHackathonsResponse{Hackathons: entries}, nil
}

// GetHackathon returns one public hackathon and everything published about it.
//
// Every collection is filtered in the query, so what is published is decided in
// one place rather than half here and half in a mapper:
//   - pages: visible ones only, in the organizers' order
//   - projects: approved only — a proposal nobody accepted is not public
//   - submissions: final only — a draft is work its team has not shown anyone
//   - teams: a count of members, never the members themselves
func (s *PublicService) GetHackathon(
	ctx context.Context,
	req *msgs.GetHackathonRequest,
) (*msgs.GetHackathonResponse, error) {
	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	h, err := s.dbClient.Hackathon.Query().
		Where(
			enthackathon.IDEQ(id),
			// The gate. A private hackathon does not match, so it is NotFound
			// below rather than PermissionDenied.
			enthackathon.VisibilityEQ(enthackathon.VisibilityPublic),
		).
		WithPages(func(q *ent.PageQuery) {
			q.Where(entpage.VisibleEQ(true)).
				WithPhase().
				Order(entpage.ByOrder())
		}).
		WithTracks().
		WithPhases(func(q *ent.PhaseQuery) {
			q.Order(ent.Asc(entphase.FieldCreatedAt))
		}).
		WithProjects(func(q *ent.ProjectQuery) {
			q.Where(entproject.StatusEQ(entproject.StatusApproved)).
				WithTrack()
		}).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"hackathon %s not found",
				req.GetHackathonId(),
			)
		}
		slog.Error("query public hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Teams hang off projects rather than off the hackathon, so they need their
	// own query. Filtered through approved projects for the same reason the
	// projects are: a team on a proposal nobody accepted is not public either.
	teams, err := s.dbClient.Team.Query().
		Where(entteam.HasProjectWith(
			entproject.HasHackathonWith(enthackathon.IDEQ(id)),
			entproject.StatusEQ(entproject.StatusApproved),
		)).
		WithProject().
		// Loaded to be counted, and counted is all they are: publicTeamFromEnt
		// takes len() of this and never reads a member.
		WithMembers().
		WithSubmissions(func(q *ent.SubmissionQuery) {
			q.Where(entsubmission.StatusEQ(entsubmission.StatusFinal))
		}).
		All(ctx)
	if err != nil {
		slog.Error("query public teams", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	return &msgs.GetHackathonResponse{
		Hackathon: publicHackathonFromEnt(h, teams, time.Now()),
	}, nil
}
