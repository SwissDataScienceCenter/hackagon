package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	enthackathonforms "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathonforms"
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

// ─── Forms & voting policy ───────────────────────────────────────────

// formsRowFor returns the hackathon's forms row, or nil when none exists.
func formsRowFor(
	ctx context.Context,
	db *ent.Client,
	hackathonID uuid.UUID,
) (*ent.HackathonForms, error) {
	f, err := db.HackathonForms.Query().
		Where(enthackathonforms.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, nil
		}

		return nil, err
	}

	return f, nil
}

func fieldsToJSON(fields []*ents.FormField) []map[string]any {
	out := make([]map[string]any, 0, len(fields))
	for _, f := range fields {
		m := map[string]any{
			"key":      f.GetKey(),
			"label":    f.GetLabel(),
			"type":     f.GetType(),
			"required": f.GetRequired(),
		}
		if f.MaxMb != nil {
			m["maxMb"] = f.GetMaxMb()
		}
		out = append(out, m)
	}

	return out
}

func consentsToJSON(consents []*ents.ConsentField) []map[string]any {
	out := make([]map[string]any, 0, len(consents))
	for _, c := range consents {
		out = append(out, map[string]any{
			"key":      c.GetKey(),
			"label":    c.GetLabel(),
			"required": c.GetRequired(),
		})
	}

	return out
}

func formSchemaFromJSON(fields, consents []map[string]any) *ents.FormSchema {
	str := func(m map[string]any, k string) string {
		if v, ok := m[k].(string); ok {
			return v
		}

		return ""
	}
	boolean := func(m map[string]any, k string) bool {
		if v, ok := m[k].(bool); ok {
			return v
		}

		return false
	}
	schema := &ents.FormSchema{}
	for _, f := range fields {
		schema.Fields = append(schema.Fields, &ents.FormField{
			Key:      str(f, "key"),
			Label:    str(f, "label"),
			Type:     str(f, "type"),
			Required: boolean(f, "required"),
		})
	}
	for _, c := range consents {
		schema.Consents = append(schema.Consents, &ents.ConsentField{
			Key:      str(c, "key"),
			Label:    str(c, "label"),
			Required: boolean(c, "required"),
		})
	}

	return schema
}

// upsertForms applies mutate to the hackathon's forms row, creating it first
// when missing.
func (s *ConfigService) upsertForms(
	ctx context.Context,
	hackathonID uuid.UUID,
	modifier *ent.User,
	mutateCreate func(*ent.HackathonFormsCreate),
	mutateUpdate func(*ent.HackathonFormsUpdateOne),
) (*ent.HackathonForms, error) {
	existing, err := formsRowFor(ctx, s.dbClient, hackathonID)
	if err != nil {
		slog.Error("query hackathon forms", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	if existing == nil {
		create := s.dbClient.HackathonForms.Create().
			SetHackathonID(hackathonID).
			SetModifierID(modifier.ID)
		mutateCreate(create)
		row, err := create.Save(ctx)
		if err != nil {
			if ent.IsConstraintError(err) {
				return nil, status.Errorf(codes.NotFound, "hackathon %s not found", hackathonID)
			}
			slog.Error("create hackathon forms", "err", err)

			return nil, status.Error(codes.Internal, "couldn't create hackathon forms")
		}

		return row, nil
	}
	update := existing.Update().SetModifierID(modifier.ID)
	mutateUpdate(update)
	row, err := update.Save(ctx)
	if err != nil {
		slog.Error("update hackathon forms", "err", err)

		return nil, status.Error(codes.Internal, "couldn't update hackathon forms")
	}

	return row, nil
}

func (s *ConfigService) SetRegistrationForm(
	ctx context.Context,
	req *cfgMsgs.SetRegistrationFormRequest,
) (*cfgMsgs.SetRegistrationFormResponse, error) {
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

	fields := fieldsToJSON(req.GetFields())
	consents := consentsToJSON(req.GetConsents())
	row, err := s.upsertForms(ctx, hackathonID, modifier,
		func(c *ent.HackathonFormsCreate) {
			c.SetRegistrationFields(fields).SetRegistrationConsents(consents)
		},
		func(u *ent.HackathonFormsUpdateOne) {
			u.SetRegistrationFields(fields).SetRegistrationConsents(consents)
		},
	)
	if err != nil {
		return nil, err
	}

	return &cfgMsgs.SetRegistrationFormResponse{
		Form: formSchemaFromJSON(row.RegistrationFields, row.RegistrationConsents),
	}, nil
}

func (s *ConfigService) SetSubmissionForm(
	ctx context.Context,
	req *cfgMsgs.SetSubmissionFormRequest,
) (*cfgMsgs.SetSubmissionFormResponse, error) {
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

	fields := fieldsToJSON(req.GetFields())
	row, err := s.upsertForms(ctx, hackathonID, modifier,
		func(c *ent.HackathonFormsCreate) { c.SetSubmissionFields(fields) },
		func(u *ent.HackathonFormsUpdateOne) { u.SetSubmissionFields(fields) },
	)
	if err != nil {
		return nil, err
	}

	return &cfgMsgs.SetSubmissionFormResponse{
		Form: formSchemaFromJSON(row.SubmissionFields, nil),
	}, nil
}

func (s *ConfigService) SetVotingPolicy(
	ctx context.Context,
	req *cfgMsgs.SetVotingPolicyRequest,
) (*cfgMsgs.SetVotingPolicyResponse, error) {
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

	policy := map[string]any{
		"mechanism":       req.GetMechanism(),
		"oneBallotPer":    req.GetOneBallotPer(),
		"ownTeamVoting":   req.GetOwnTeamVoting(),
		"organizerVoting": req.GetOrganizerVoting(),
		"tieBreak":        req.GetTieBreak(),
	}
	if req.GetScale() != nil {
		policy["scale"] = map[string]any{
			"min": req.GetScale().GetMin(),
			"max": req.GetScale().GetMax(),
		}
	}
	if _, err := s.upsertForms(ctx, hackathonID, modifier,
		func(c *ent.HackathonFormsCreate) { c.SetVotingPolicy(policy) },
		func(u *ent.HackathonFormsUpdateOne) { u.SetVotingPolicy(policy) },
	); err != nil {
		return nil, err
	}

	return &cfgMsgs.SetVotingPolicyResponse{}, nil
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
