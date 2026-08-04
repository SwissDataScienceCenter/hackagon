package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	enthackathonwindows "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonwindows"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	cfgMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/config_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type ConfigService struct {
	hackathon.UnimplementedConfigServiceServer
	dbClient *ent.Client
	enforcer *m.Enforcer
}

func NewConfigService(dbClient *ent.Client, enf *m.Enforcer) *ConfigService {
	return &ConfigService{
		UnimplementedConfigServiceServer: hackathon.UnimplementedConfigServiceServer{},
		dbClient:                         dbClient,
		enforcer:                         enf,
	}
}

func windowsEntryFromEnt(w *ent.HackathonWindows, hackathonID uuid.UUID) *ents.HackathonWindows {
	entry := &ents.HackathonWindows{
		HackathonId: hackathonID.String(),
		ModifiedAt:  timestamppb.New(w.ModifiedAt),
	}
	if w.RegistrationOpens != nil {
		entry.RegistrationOpens = timestamppb.New(*w.RegistrationOpens)
	}
	if w.RegistrationCloses != nil {
		entry.RegistrationCloses = timestamppb.New(*w.RegistrationCloses)
	}
	if w.ProposalsClose != nil {
		entry.ProposalsClose = timestamppb.New(*w.ProposalsClose)
	}
	if w.PreferencesClose != nil {
		entry.PreferencesClose = timestamppb.New(*w.PreferencesClose)
	}
	if w.SubmissionsClose != nil {
		entry.SubmissionsClose = timestamppb.New(*w.SubmissionsClose)
	}
	if w.RegistrationOverrideUntil != nil {
		entry.RegistrationOverrideUntil = timestamppb.New(*w.RegistrationOverrideUntil)
	}
	if w.SubmissionsOverrideUntil != nil {
		entry.SubmissionsOverrideUntil = timestamppb.New(*w.SubmissionsOverrideUntil)
	}
	if w.LatePolicy != "" {
		entry.LatePolicy = &w.LatePolicy
	}

	return entry
}

// windowsRowFor returns the hackathon's windows row, or nil when none exists.
func windowsRowFor(
	ctx context.Context,
	db *ent.Client,
	hackathonID uuid.UUID,
) (*ent.HackathonWindows, error) {
	w, err := db.HackathonWindows.Query().
		Where(enthackathonwindows.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, nil
		}

		return nil, err
	}

	return w, nil
}

// callerUser resolves the authenticated caller's platform user row.
func (s *ConfigService) callerUser(ctx context.Context) (*ent.User, error) {
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

func (s *ConfigService) SetWindows(
	ctx context.Context,
	req *cfgMsgs.SetWindowsRequest,
) (*cfgMsgs.SetWindowsResponse, error) {
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}
	modifier, err := s.callerUser(ctx)
	if err != nil {
		return nil, err
	}

	existing, err := windowsRowFor(ctx, s.dbClient, hackathonID)
	if err != nil {
		slog.Error("query hackathon windows", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	asTime := func(ts *timestamppb.Timestamp) *time.Time {
		if ts == nil {
			return nil
		}
		t := ts.AsTime()

		return &t
	}

	if existing == nil {
		create := s.dbClient.HackathonWindows.Create().
			SetHackathonID(hackathonID).
			SetModifierID(modifier.ID).
			SetNillableRegistrationOpens(asTime(req.RegistrationOpens)).
			SetNillableRegistrationCloses(asTime(req.RegistrationCloses)).
			SetNillableProposalsClose(asTime(req.ProposalsClose)).
			SetNillablePreferencesClose(asTime(req.PreferencesClose)).
			SetNillableSubmissionsClose(asTime(req.SubmissionsClose))
		if req.LatePolicy != nil {
			create.SetLatePolicy(req.GetLatePolicy())
		}
		if existing, err = create.Save(ctx); err != nil {
			if ent.IsConstraintError(err) {
				return nil, status.Errorf(codes.NotFound, "hackathon %s not found", hackathonID)
			}
			slog.Error("create hackathon windows", "err", err)

			return nil, status.Error(codes.Internal, "couldn't create hackathon windows")
		}
	} else {
		update := existing.Update().
			SetModifierID(modifier.ID).
			SetNillableRegistrationOpens(asTime(req.RegistrationOpens)).
			SetNillableRegistrationCloses(asTime(req.RegistrationCloses)).
			SetNillableProposalsClose(asTime(req.ProposalsClose)).
			SetNillablePreferencesClose(asTime(req.PreferencesClose)).
			SetNillableSubmissionsClose(asTime(req.SubmissionsClose))
		if req.LatePolicy != nil {
			update.SetLatePolicy(req.GetLatePolicy())
		}
		if existing, err = update.Save(ctx); err != nil {
			slog.Error("update hackathon windows", "err", err)

			return nil, status.Error(codes.Internal, "couldn't update hackathon windows")
		}
	}

	return &cfgMsgs.SetWindowsResponse{
		Windows: windowsEntryFromEnt(existing, hackathonID),
	}, nil
}

func (s *ConfigService) OverrideWindow(
	ctx context.Context,
	req *cfgMsgs.OverrideWindowRequest,
) (*cfgMsgs.OverrideWindowResponse, error) {
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}
	modifier, err := s.callerUser(ctx)
	if err != nil {
		return nil, err
	}

	existing, err := windowsRowFor(ctx, s.dbClient, hackathonID)
	if err != nil {
		slog.Error("query hackathon windows", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	if existing == nil {
		return nil, status.Error(codes.FailedPrecondition, "no windows configured for this hackathon")
	}

	// The override is anchored at NOW, not at the configured close: months of
	// story time compress into a run, and "extend by 30 minutes" always means
	// "30 more minutes from this moment" to the organizer saying it.
	until := time.Now().Add(time.Duration(req.GetExtendMinutes()) * time.Minute)
	update := existing.Update().SetModifierID(modifier.ID)
	switch req.GetWindow() {
	case "registration":
		update.SetRegistrationOverrideUntil(until)
	case "submissions":
		update.SetSubmissionsOverrideUntil(until)
	default:
		return nil, status.Errorf(codes.InvalidArgument, "unknown window %q", req.GetWindow())
	}
	slog.Info("window override",
		"hackathon", hackathonID.String(),
		"window", req.GetWindow(),
		"until", until,
		"reason", req.GetReason(),
	)
	updated, err := update.Save(ctx)
	if err != nil {
		slog.Error("override hackathon window", "err", err)

		return nil, status.Error(codes.Internal, "couldn't override window")
	}

	return &cfgMsgs.OverrideWindowResponse{
		Windows: windowsEntryFromEnt(updated, hackathonID),
	}, nil
}

// ─── Enforcement (consulted by the acting RPCs) ─────────────────────

type windowKind int

const (
	windowRegistration windowKind = iota
	windowProposals
	windowPreferences
	windowSubmissions
)

// requireWindowOpen returns FailedPrecondition when the hackathon has a
// windows row and the given window is closed at `now`. No row or an unset
// window means no enforcement.
func requireWindowOpen(
	ctx context.Context,
	db *ent.Client,
	hackathonID uuid.UUID,
	kind windowKind,
	now time.Time,
) error {
	w, err := windowsRowFor(ctx, db, hackathonID)
	if err != nil {
		slog.Error("query hackathon windows", "err", err)

		return status.Error(codes.Internal, "couldn't query hackathon windows")
	}
	if w == nil {
		return nil
	}

	closedAfter := func(closes, override *time.Time) bool {
		if closes == nil || !now.After(*closes) {
			return false
		}

		return override == nil || now.After(*override)
	}

	switch kind {
	case windowRegistration:
		if w.RegistrationOpens != nil && now.Before(*w.RegistrationOpens) {
			return status.Error(codes.FailedPrecondition, "registration is not open yet")
		}
		if closedAfter(w.RegistrationCloses, w.RegistrationOverrideUntil) {
			return status.Error(codes.FailedPrecondition, "registration is closed")
		}
	case windowProposals:
		if closedAfter(w.ProposalsClose, nil) {
			return status.Error(codes.FailedPrecondition, "proposals are closed")
		}
	case windowPreferences:
		if closedAfter(w.PreferencesClose, nil) {
			return status.Error(codes.FailedPrecondition, "preferences are closed")
		}
	case windowSubmissions:
		if closedAfter(w.SubmissionsClose, w.SubmissionsOverrideUntil) {
			return status.Error(codes.FailedPrecondition, "submissions are closed")
		}
	}

	return nil
}
