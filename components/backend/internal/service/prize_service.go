package service

import (
	"context"
	"log/slog"
	"strings"

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
		//exhaustruct:ignore
		p := &ents.Prize{}
		if v, ok := r["rank"].(float64); ok {
			p.Rank = int32(v)
		}
		if v, ok := r["title"].(string); ok {
			p.Title = v
		}
		// Absent on every row written before the field existed, which is why it
		// is only set when non-empty: an empty string would render as a broken
		// image rather than as no image.
		if v, ok := r["image"].(string); ok && v != "" {
			p.Image = &v
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
			//nolint:nilnil // documented contract: nil,nil is "no row yet", every
			// caller already checks it as a distinct state from an error
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

// Get reads the prize table back.
//
// Set replaces it wholesale, so a form that cannot prefill makes editing one
// prize destructive — the same reason GetWindows exists. Read is hackathon
// Read, not Write: the prize list is what an event advertises to attract
// entries, and the awards are the published result.
func (s *PrizeService) Get(
	ctx context.Context,
	req *prizeMsgs.GetRequest,
) (*prizeMsgs.GetResponse, error) {
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	// A PUBLIC event's prizes and awards are published facts: the prize list is
	// what it advertises to attract entrants, and the awards are the result it
	// announces. So visibility decides first, and only a private event falls
	// back to the membership gate — otherwise the platform's own "who won"
	// surfaces would be visible to everyone except the public they are for.
	public, err := s.dbClient.Hackathon.Query().
		Where(
			enthackathon.IDEQ(hackathonID),
			enthackathon.VisibilityEQ(enthackathon.VisibilityPublic),
		).
		Exist(ctx)
	if err != nil {
		slog.Error("query hackathon visibility", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	if !public {
		if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), m.Hackathon, m.Read); err != nil {
			return nil, err
		}
	}

	row, err := s.prizeRowFor(ctx, hackathonID)
	if err != nil {
		return nil, err
	}
	if row == nil {
		// No table yet is a normal state — an event that has not decided its
		// prizes, not an error for the UI to translate.
		//exhaustruct:ignore
		return &prizeMsgs.GetResponse{}, nil
	}

	return &prizeMsgs.GetResponse{
		Prizes:    prizesFromJSON(row.Prizes),
		Awards:    prizesFromJSON(row.Awards),
		Finalized: row.Finalized,
	}, nil
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
		row := map[string]any{
			"rank":  float64(p.GetRank()),
			"title": p.GetTitle(),
		}
		if img := strings.TrimSpace(p.GetImage()); img != "" {
			row["image"] = img
		}
		prizes = append(prizes, row)
	}

	row, err := s.upsertPrizes(ctx, hackathonID, modifier, prizes)
	if err != nil {
		return nil, err
	}

	return &prizeMsgs.SetResponse{Prizes: prizesFromJSON(row.Prizes)}, nil
}

// upsertPrizes creates the hackathon's prize table if none exists yet, or
// replaces the prizes on the existing one otherwise. Split out of Set because
// inlining both branches pushed Set past the nesting budget for no benefit.
func (s *PrizeService) upsertPrizes(
	ctx context.Context,
	hackathonID uuid.UUID,
	modifier *ent.User,
	prizes []map[string]any,
) (*ent.HackathonPrizes, error) {
	existing, err := s.prizeRowFor(ctx, hackathonID)
	if err != nil {
		return nil, err
	}

	if existing == nil {
		row, err := s.dbClient.HackathonPrizes.Create().
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

		return row, nil
	}

	row, err := existing.Update().
		SetModifierID(modifier.ID).
		SetPrizes(prizes).
		Save(ctx)
	if err != nil {
		slog.Error("update hackathon prizes", "err", err)

		return nil, status.Error(codes.Internal, "couldn't update prize table")
	}

	return row, nil
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
		//exhaustruct:ignore
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
