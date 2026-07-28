package service

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entpage "github.com/swissdatasciencecenter/hackagon/components/backend/ent/page"
	entphase "github.com/swissdatasciencecenter/hackagon/components/backend/ent/phase"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/phase_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type PhaseService struct {
	hackathon.UnimplementedPhaseServiceServer
	dbClient *ent.Client
	enforcer *mw.Enforcer
}

func NewPhaseService(dbClient *ent.Client, enf *mw.Enforcer) *PhaseService {
	return &PhaseService{
		UnimplementedPhaseServiceServer: hackathon.UnimplementedPhaseServiceServer{},
		dbClient:                        dbClient,
		enforcer:                        enf,
	}
}

func (s *PhaseService) List(
	ctx context.Context,
	req *msgs.ListRequest,
) (*msgs.ListResponse, error) {
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Phase.Read permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Phase, mw.Read); err != nil {
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

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Query phases ordered by starts_at, then ends_at
	phases, err := s.dbClient.Phase.Query().
		Where(entphase.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		WithCreator().
		WithModifier().
		WithPage().
		Order(entphase.ByStartsAt(), entphase.ByEndsAt()).
		All(ctx)
	if err != nil {
		slog.Error("query phases", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	entries := make([]*ents.Phase, 0, len(phases))
	for _, p := range phases {
		entries = append(entries, phaseEntryFromEnt(p, hackathonID))
	}

	return &msgs.ListResponse{Phases: entries}, nil
}

func (s *PhaseService) Get(
	ctx context.Context,
	req *msgs.GetRequest,
) (*msgs.GetResponse, error) {
	phaseID, err := uuid.Parse(req.GetPhaseId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid phase_id: %v", err)
	}

	// Get the phase to find its hackathon_id
	phase, err := s.dbClient.Phase.Query().
		Where(entphase.IDEQ(phaseID)).
		WithCreator().
		WithModifier().
		WithPage().
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "phase %s not found", req.GetPhaseId())
		}
		slog.Error("query phase", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := phase.Edges.Hackathon.ID

	// Check Phase.Read permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Phase, mw.Read); err != nil {
		return nil, err
	}

	entry := phaseEntryFromEnt(phase, hackathonID)

	return &msgs.GetResponse{Phase: entry}, nil
}

func (s *PhaseService) Create(
	ctx context.Context,
	req *msgs.CreateRequest,
) (*msgs.CreateResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Phase.Write permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Phase, mw.Write); err != nil {
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

		return nil, status.Error(codes.Internal, "couldn't query database")
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

	// Start transaction
	txn, err := s.dbClient.Tx(ctx)
	if err != nil {
		slog.Error("start transaction", "err", err)
		return nil, status.Error(codes.Internal, "couldn't start transaction")
	}

	// Create the phase
	p, err := txn.Phase.Create().
		SetHackathonID(hackathonID).
		SetName(req.GetName()).
		SetDescription(req.GetDescription()).
		SetCreator(user).
		SetModifier(user).
		Save(ctx)
	if err != nil {
		if rbErr := txn.Rollback(); rbErr != nil {
			slog.Error("rollback transaction after create failure", "err", err, "rollback", rbErr)
		}
		slog.Error("create phase", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't create phase in database")
	}

	// Handle page linkage (nil = no old page to unlink)
	//nolint:protogetter // we have to pass PageId reference
	if err := s.handlePhasePageLinkage(ctx, txn, p.ID, hackathonID, nil, req.PageId); err != nil {
		if rbErr := txn.Rollback(); rbErr != nil {
			slog.Error(
				"rollback transaction after page linkage failure",
				"err",
				err,
				"rollback",
				rbErr,
			)
		}
		slog.Error("handle page linkage", "err", err)
		return nil, err
	}

	if err := txn.Commit(); err != nil {
		slog.Error("commit transaction", "err", err)
		return nil, status.Error(codes.Internal, "couldn't commit transaction")
	}

	return &msgs.CreateResponse{PhaseId: p.ID.String()}, nil
}

func (s *PhaseService) Edit(
	ctx context.Context,
	req *msgs.EditRequest,
) (*msgs.EditResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	phaseID, err := uuid.Parse(req.GetPhaseId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid phase_id: %v", err)
	}

	// Get the phase to find its hackathon_id and linked page
	phase, err := s.dbClient.Phase.Query().
		Where(entphase.IDEQ(phaseID)).
		WithHackathon().
		WithPage().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "phase %s not found", req.GetPhaseId())
		}
		slog.Error("query phase", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := phase.Edges.Hackathon.ID

	// Check Phase.Write permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Phase, mw.Write); err != nil {
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

	// Start transaction
	txn, err := s.dbClient.Tx(ctx)
	if err != nil {
		slog.Error("start transaction", "err", err)
		return nil, status.Error(codes.Internal, "couldn't start transaction")
	}

	// Build the update query with only provided fields
	update := txn.Phase.Update().
		Where(entphase.IDEQ(phaseID)).
		SetModifier(user)

	if req.Name != nil {
		update = update.SetName(req.GetName())
	}
	if req.Description != nil {
		update = update.SetDescription(req.GetDescription())
	}
	if req.GetStartsAt() != nil {
		t := req.GetStartsAt().AsTime()
		update = update.SetStartsAt(t)
	}
	if req.GetEndsAt() != nil {
		t := req.GetEndsAt().AsTime()
		update = update.SetEndsAt(t)
	}

	_, err = update.Save(ctx)
	if err != nil {
		_ = txn.Rollback()
		slog.Error("update phase", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't update phase in database")
	}

	// Handle page linkage (pass current page ID to unlink if different)
	var oldPageID *uuid.UUID
	if phase.Edges.Page != nil {
		p := phase.Edges.Page.ID
		oldPageID = &p
	}
	//nolint:protogetter // we have to pass PageId reference
	if err := s.handlePhasePageLinkage(ctx, txn, phaseID, hackathonID, oldPageID, req.PageId); err != nil {
		if rbErr := txn.Rollback(); rbErr != nil {
			slog.Error(
				"rollback transaction after page linkage failure",
				"err",
				err,
				"rollback",
				rbErr,
			)
		}
		slog.Error("handle page linkage", "err", err)
		return nil, err
	}

	if err := txn.Commit(); err != nil {
		slog.Error("commit transaction", "err", err)
		return nil, status.Error(codes.Internal, "couldn't commit transaction")
	}

	// Fetch the updated phase with creator, modifier, and linked page
	updated, err := s.dbClient.Phase.Query().
		Where(entphase.IDEQ(phaseID)).
		WithCreator().
		WithModifier().
		WithPage().
		Only(ctx)
	if err != nil {
		slog.Error("query updated phase", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query updated phase")
	}

	entry := phaseEntryFromEnt(updated, hackathonID)

	return &msgs.EditResponse{Phase: entry}, nil
}

func (s *PhaseService) Delete(
	ctx context.Context,
	req *msgs.DeleteRequest,
) (*msgs.DeleteResponse, error) {
	_, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	phaseID, err := uuid.Parse(req.GetPhaseId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid phase_id: %v", err)
	}

	// Get the phase to find its hackathon_id and linked page
	phase, err := s.dbClient.Phase.Query().
		Where(entphase.IDEQ(phaseID)).
		WithHackathon().
		WithPage().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "phase %s not found", req.GetPhaseId())
		}
		slog.Error("query phase", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := phase.Edges.Hackathon.ID

	// Check Phase.Write permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Phase, mw.Write); err != nil {
		return nil, err
	}

	// Start transaction to handle page cleanup
	txn, err := s.dbClient.Tx(ctx)
	if err != nil {
		slog.Error("start transaction", "err", err)
		return nil, status.Error(codes.Internal, "couldn't start transaction")
	}

	// If a page is linked to this phase, unlink it
	if phase.Edges.Page != nil {
		_, err := txn.Page.Update().
			Where(entpage.IDEQ(phase.Edges.Page.ID)).
			ClearPhase().
			Save(ctx)
		if err != nil {
			if rbErr := txn.Rollback(); rbErr != nil {
				slog.Error(
					"rollback transaction after page unlink failure",
					"err",
					err,
					"rollback",
					rbErr,
				)
			}
			slog.Error("unlink page from phase", "err", err)
			return nil, status.Error(codes.Internal, "couldn't unlink page")
		}
	}

	// Delete the phase
	err = txn.Phase.DeleteOne(phase).Exec(ctx)
	if err != nil {
		if rbErr := txn.Rollback(); rbErr != nil {
			slog.Error("rollback transaction after delete failure", "err", err, "rollback", rbErr)
		}
		slog.Error("delete phase", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't delete phase from database")
	}

	if err := txn.Commit(); err != nil {
		slog.Error("commit transaction", "err", err)
		return nil, status.Error(codes.Internal, "couldn't commit transaction")
	}

	return &msgs.DeleteResponse{}, nil
}

// handlePhasePageLinkage handles page-to-phase linkage based on pageIDStr.
// Returns nil if no change needed.
func (s *PhaseService) handlePhasePageLinkage(
	ctx context.Context,
	txn *ent.Tx,
	phaseID uuid.UUID,
	hackathonID uuid.UUID,
	oldPageID *uuid.UUID,
	pageIDStr *string,
) error {
	if pageIDStr == nil {
		// Not specified: no change
		return nil
	}

	if *pageIDStr == "" {
		// Empty string = unlink the page linked to this specific phase
		if oldPageID != nil {
			_, err := txn.Page.Update().
				Where(entpage.IDEQ(*oldPageID)).
				ClearPhase().
				Save(ctx)
			if err != nil {
				return status.Error(codes.Internal, "couldn't unlink page")
			}
		}
		return nil
	}

	// Non-empty string = link page to this phase
	pageID, err := uuid.Parse(*pageIDStr)
	if err != nil {
		return status.Errorf(codes.InvalidArgument, "invalid page_id: %v", err)
	}

	// Verify page exists and belongs to the same hackathon
	page, err := txn.Page.Query().
		Where(entpage.IDEQ(pageID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return status.Errorf(codes.NotFound, "page %s not found", *pageIDStr)
		}
		return status.Error(codes.Internal, "couldn't query page")
	}

	if page.Edges.Hackathon.ID != hackathonID {
		return status.Errorf(
			codes.InvalidArgument,
			"page %s does not belong to hackathon %s",
			*pageIDStr,
			hackathonID.String(),
		)
	}

	// If phase was previously linked to another page, unlink it first
	if oldPageID != nil && *oldPageID != pageID {
		_, err := txn.Page.Update().
			Where(entpage.IDEQ(*oldPageID)).
			ClearPhase().
			Save(ctx)
		if err != nil {
			return status.Error(codes.Internal, "couldn't unlink old page")
		}
	}

	// Link new page to this phase by setting the phase_id
	_, err = txn.Page.Update().
		Where(entpage.IDEQ(pageID)).
		SetPhaseID(phaseID).
		Save(ctx)
	if err != nil {
		return status.Error(codes.Internal, "couldn't link page to phase")
	}
	return nil
}
