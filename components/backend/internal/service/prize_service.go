package service

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	enthackathonprizes "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonprizes"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	prizeMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/prize_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type PrizeService struct {
	hackathon.UnimplementedPrizeServiceServer
	dbClient *ent.Client
	enforcer *m.Enforcer
}

func NewPrizeService(dbClient *ent.Client, enf *m.Enforcer) *PrizeService {
	return &PrizeService{
		UnimplementedPrizeServiceServer: hackathon.UnimplementedPrizeServiceServer{},
		dbClient:                        dbClient,
		enforcer:                        enf,
	}
}

func prizesFromJSON(rows []map[string]any) []*ents.Prize {
	out := make([]*ents.Prize, 0, len(rows))
	for _, r := range rows {
		p := &ents.Prize{}
		if v, ok := r["rank"].(float64); ok {
			p.Rank = int32(v)
		}
		if v, ok := r["title"].(string); ok {
			p.Title = v
		}
		out = append(out, p)
	}

	return out
}

// prizeRowFor returns the hackathon's prize row, or nil when none exists.
func (s *PrizeService) prizeRowFor(
	ctx context.Context,
	hackathonID uuid.UUID,
) (*ent.HackathonPrizes, error) {
	p, err := s.dbClient.HackathonPrizes.Query().
		Where(enthackathonprizes.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, nil
		}
		slog.Error("query hackathon prizes", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	return p, nil
}

// requireOrganizer runs the Write check and resolves the caller.
func (s *PrizeService) requireOrganizer(
	ctx context.Context,
	hackathonID uuid.UUID,
) (*ent.User, error) {
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	u, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user %s not found", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	return u, nil
}

func (s *PrizeService) Set(
	ctx context.Context,
	req *prizeMsgs.SetRequest,
) (*prizeMsgs.SetResponse, error) {
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	modifier, err := s.requireOrganizer(ctx, hackathonID)
	if err != nil {
		return nil, err
	}

	prizes := make([]map[string]any, 0, len(req.GetPrizes()))
	for _, p := range req.GetPrizes() {
		prizes = append(prizes, map[string]any{
			"rank":  float64(p.GetRank()),
			"title": p.GetTitle(),
		})
	}

	existing, err := s.prizeRowFor(ctx, hackathonID)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		existing, err = s.dbClient.HackathonPrizes.Create().
			SetHackathonID(hackathonID).
			SetModifierID(modifier.ID).
			SetPrizes(prizes).
			Save(ctx)
		if err != nil {
			if ent.IsConstraintError(err) {
				return nil, status.Errorf(codes.NotFound, "hackathon %s not found", hackathonID)
			}
			slog.Error("create hackathon prizes", "err", err)

			return nil, status.Error(codes.Internal, "couldn't create prize table")
		}
	} else {
		existing, err = existing.Update().
			SetModifierID(modifier.ID).
			SetPrizes(prizes).
			Save(ctx)
		if err != nil {
			slog.Error("update hackathon prizes", "err", err)

			return nil, status.Error(codes.Internal, "couldn't update prize table")
		}
	}

	return &prizeMsgs.SetResponse{Prizes: prizesFromJSON(existing.Prizes)}, nil
}

func (s *PrizeService) Finalize(
	ctx context.Context,
	req *prizeMsgs.FinalizeRequest,
) (*prizeMsgs.FinalizeResponse, error) {
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	modifier, err := s.requireOrganizer(ctx, hackathonID)
	if err != nil {
		return nil, err
	}
	existing, err := s.prizeRowFor(ctx, hackathonID)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, status.Error(codes.FailedPrecondition, "no prize table defined")
	}

	awards := make([]map[string]any, 0, len(req.GetAwards()))
	for _, a := range req.GetAwards() {
		row := map[string]any{"submissionId": a.GetSubmissionId()}
		if a.Rank != nil {
			row["rank"] = float64(a.GetRank())
		}
		if a.Special != nil {
			row["special"] = a.GetSpecial()
		}
		awards = append(awards, row)
	}
	if _, err := existing.Update().
		SetModifierID(modifier.ID).
		SetAwards(awards).
		SetFinalized(true).
		Save(ctx); err != nil {
		slog.Error("finalize hackathon prizes", "err", err)

		return nil, status.Error(codes.Internal, "couldn't finalize awards")
	}

	return &prizeMsgs.FinalizeResponse{}, nil
}

func (s *PrizeService) Edit(
	ctx context.Context,
	req *prizeMsgs.EditRequest,
) (*prizeMsgs.EditResponse, error) {
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	modifier, err := s.requireOrganizer(ctx, hackathonID)
	if err != nil {
		return nil, err
	}
	existing, err := s.prizeRowFor(ctx, hackathonID)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, status.Error(codes.FailedPrecondition, "no prize table defined")
	}

	var edited *ents.Prize
	prizes := existing.Prizes
	for i, p := range prizes {
		rank, _ := p["rank"].(float64)
		if int32(rank) != req.GetRank() {
			continue
		}
		if req.Title != nil {
			p["title"] = req.GetTitle()
		}
		prizes[i] = p
		title, _ := p["title"].(string)
		edited = &ents.Prize{Rank: req.GetRank(), Title: title}

		break
	}
	if edited == nil {
		return nil, status.Errorf(codes.NotFound, "no prize with rank %d", req.GetRank())
	}
	if _, err := existing.Update().
		SetModifierID(modifier.ID).
		SetPrizes(prizes).
		Save(ctx); err != nil {
		slog.Error("edit hackathon prize", "err", err)

		return nil, status.Error(codes.Internal, "couldn't edit prize")
	}

	return &prizeMsgs.EditResponse{Prize: edited}, nil
}
