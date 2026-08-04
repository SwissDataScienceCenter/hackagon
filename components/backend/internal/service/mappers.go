package service

import (
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	userEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func userEntryFromEnt(u *ent.User) *userEnts.User {
	return &userEnts.User{
		Id:          u.ID.String(),
		Username:    u.Username,
		KeycloakId:  u.KeycloakID,
		DisplayName: u.DisplayName,
		Email:       u.Email,
		CreatedAt:   timestamppb.New(u.CreatedAt),
		ModifiedAt:  timestamppb.New(u.ModifiedAt),
	}
}

func VisibilityFromEnt(v enthackathon.Visibility) hackEnts.Visibility {
	switch v {
	case enthackathon.VisibilityPublic:
		return hackEnts.Visibility_VISIBILITY_PUBLIC
	case enthackathon.VisibilityPrivate:
		return hackEnts.Visibility_VISIBILITY_PRIVATE
	default:
		return hackEnts.Visibility_VISIBILITY_UNSPECIFIED
	}
}

func VisibilityToEnt(v hackEnts.Visibility) (enthackathon.Visibility, bool) {
	switch v {
	case hackEnts.Visibility_VISIBILITY_PUBLIC:
		return enthackathon.VisibilityPublic, true
	case hackEnts.Visibility_VISIBILITY_PRIVATE:
		return enthackathon.VisibilityPrivate, true
	case hackEnts.Visibility_VISIBILITY_UNSPECIFIED:
		return "", false
	default:
		return "", false
	}
}

func computeHackathonStatus(startsAt, endsAt *time.Time, now time.Time) hackEnts.HackathonStatus {
	if startsAt == nil || now.Before(*startsAt) {
		return hackEnts.HackathonStatus_HACKATHON_STATUS_PENDING
	}
	if endsAt != nil && !now.Before(*endsAt) {
		return hackEnts.HackathonStatus_HACKATHON_STATUS_FINISHED
	}

	return hackEnts.HackathonStatus_HACKATHON_STATUS_ACTIVE
}

// brandingEntryFromEnt maps the free-form branding map stored on the forms row
// (written by ConfigService.SetBranding) onto the wire entity.
//
// Returns nil when nothing usable is set, so "no branding" is an absent field
// rather than a message full of empty strings — clients can then treat presence
// as "this event has a look of its own" without inspecting every member.
func brandingEntryFromEnt(b map[string]string) *hackEnts.HackathonBranding {
	if len(b) == 0 {
		return nil
	}
	e := &hackEnts.HackathonBranding{}
	set := false
	// Each `if` scopes its own copy, so taking the address is safe.
	if v, ok := b["primaryColor"]; ok && v != "" {
		e.PrimaryColor = &v
		set = true
	}
	if v, ok := b["accentColor"]; ok && v != "" {
		e.AccentColor = &v
		set = true
	}
	if v, ok := b["bannerText"]; ok && v != "" {
		e.BannerText = &v
		set = true
	}
	if !set {
		return nil
	}

	return e
}

func hackathonEntryFromEnt(h *ent.Hackathon, now time.Time) *hackEnts.Hackathon {
	e := &hackEnts.Hackathon{
		Id:         h.ID.String(),
		Name:       h.Name,
		CreatedAt:  timestamppb.New(h.CreatedAt),
		ModifiedAt: timestamppb.New(h.ModifiedAt),
		Visibility: VisibilityFromEnt(h.Visibility),
		Status:     computeHackathonStatus(h.StartsAt, h.EndsAt, now),
	}
	if h.StartsAt != nil {
		e.StartsAt = timestamppb.New(*h.StartsAt)
	}
	if h.EndsAt != nil {
		e.EndsAt = timestamppb.New(*h.EndsAt)
	}
	if h.Description != "" {
		d := h.Description
		e.Description = &d
	}
	if h.Logo != "" {
		l := h.Logo
		e.Logo = &l
	}
	// A plain column on `hackathons`, not an edge, so this is populated on List
	// as well as Get — no eager load needed.
	if h.CurrentPhaseID != nil {
		p := h.CurrentPhaseID.String()
		e.CurrentPhaseId = &p
	}
	// Branding lives on the forms row, so it only arrives when the caller
	// eager-loaded WithForms(). A missing edge is indistinguishable from no
	// branding here on purpose: both mean "render the default theme".
	if h.Edges.Forms != nil {
		e.Branding = brandingEntryFromEnt(h.Edges.Forms.Branding)
		// The schemas a client needs to RENDER the registration/submission
		// forms it is about to fill in. Without them the only way to complete
		// one was to guess the organizer's field keys. Nil when unset, which
		// the write path reads as "accept anything".
		if len(h.Edges.Forms.RegistrationFields) > 0 ||
			len(h.Edges.Forms.RegistrationConsents) > 0 {
			e.RegistrationForm = formSchemaFromJSON(
				h.Edges.Forms.RegistrationFields, h.Edges.Forms.RegistrationConsents,
			)
		}
		if len(h.Edges.Forms.SubmissionFields) > 0 {
			e.SubmissionForm = formSchemaFromJSON(h.Edges.Forms.SubmissionFields, nil)
		}
	}

	return e
}

func trackEntryFromEnt(t *ent.Track, hackathonID uuid.UUID) *hackEnts.Track {
	return &hackEnts.Track{
		Id:          t.ID.String(),
		Name:        t.Name,
		Description: t.Description,
		CreatedAt:   timestamppb.New(t.CreatedAt),
		ModifiedAt:  timestamppb.New(t.ModifiedAt),
		HackathonId: hackathonID.String(),
	}
}

func projectStatusFromEnt(s string) hackEnts.ProjectStatus {
	switch s {
	case "proposed":
		return hackEnts.ProjectStatus_PROJECT_STATUS_PROPOSED
	case "approved":
		return hackEnts.ProjectStatus_PROJECT_STATUS_APPROVED
	default:
		return hackEnts.ProjectStatus_PROJECT_STATUS_UNSPECIFIED
	}
}

func projectEntryFromEnt(p *ent.Project, hackathonID uuid.UUID) *hackEnts.Project {
	trackID := ""
	if p.Edges.Track != nil {
		trackID = p.Edges.Track.ID.String()
	}
	e := &hackEnts.Project{
		Id:          p.ID.String(),
		Title:       p.Title,
		Description: p.Description,
		Status:      projectStatusFromEnt(p.Status.String()),
		CreatedAt:   timestamppb.New(p.CreatedAt),
		ModifiedAt:  timestamppb.New(p.ModifiedAt),
		HackathonId: hackathonID.String(),
		TrackId:     trackID,
		CreatorId:   p.Edges.Creator.ID.String(),
	}
	if p.Image != "" {
		img := p.Image
		e.Image = &img
	}
	e.ModifierId = p.Edges.Modifier.ID.String()

	return e
}

func projectWithPreferencesEntryFromEnt(
	p *ent.Project,
	hackathonID uuid.UUID,
) *hackEnts.ProjectWithPreferences {
	e := &hackEnts.ProjectWithPreferences{
		Id:          p.ID.String(),
		Title:       p.Title,
		Description: p.Description,
		Status:      projectStatusFromEnt(string(p.Status)),
		CreatedAt:   timestamppb.New(p.CreatedAt),
		ModifiedAt:  timestamppb.New(p.ModifiedAt),
		HackathonId: hackathonID.String(),
	}
	if p.Edges.Track != nil {
		trackID := p.Edges.Track.ID.String()
		e.TrackId = trackID
	}
	if p.Image != "" {
		e.Image = &p.Image
	}
	if len(p.Edges.PreferredByUsers) > 0 {
		e.Preferences = make([]*userEnts.User, 0, len(p.Edges.PreferredByUsers))
		for _, u := range p.Edges.PreferredByUsers {
			e.Preferences = append(e.Preferences, userEntryFromEnt(u))
		}
	}

	return e
}

func pageEntryFromEnt(p *ent.Page, hackathonID uuid.UUID) *hackEnts.Page {
	e := &hackEnts.Page{
		Id:      p.ID.String(),
		Title:   p.Title,
		Content: p.Content,
		Visible: p.Visible,
		Order: int32(
			p.Order, //nolint:gosec // G115: Order is a bounded position index, overflow not possible
		),
		CreatedAt:   timestamppb.New(p.CreatedAt),
		ModifiedAt:  timestamppb.New(p.ModifiedAt),
		HackathonId: hackathonID.String(),
		CreatorId:   p.Edges.Creator.ID.String(),
	}
	if p.Edges.Phase != nil {
		pid := p.Edges.Phase.ID.String()
		e.PhaseId = &pid
	}
	e.ModifierId = p.Edges.Modifier.ID.String()

	return e
}

func submissionStatusFromEnt(s string) hackEnts.SubmissionStatus {
	switch s {
	case "draft":
		return hackEnts.SubmissionStatus_SUBMISSION_STATUS_DRAFT
	case "final":
		return hackEnts.SubmissionStatus_SUBMISSION_STATUS_FINAL
	default:
		return hackEnts.SubmissionStatus_SUBMISSION_STATUS_UNSPECIFIED
	}
}

func submissionEntryFromEnt(s *ent.Submission) *hackEnts.Submission {
	e := &hackEnts.Submission{
		Id:         s.ID.String(),
		Status:     submissionStatusFromEnt(s.Status.String()),
		Version:    int32(s.Version),
		CreatedAt:  timestamppb.New(s.CreatedAt),
		ModifiedAt: timestamppb.New(s.ModifiedAt),
		TeamId:     s.Edges.Team.ID.String(),
		ProjectId:  s.Edges.Project.ID.String(),
		CreatorId:  s.Edges.Creator.ID.String(),
	}
	if s.Result != "" {
		res := s.Result
		e.Result = &res
	}
	if s.Edges.Modifier != nil {
		modID := s.Edges.Modifier.ID.String()
		e.ModifierId = &modID
	}
	return e
}

func teamEntryFromEnt(t *ent.Team) *hackEnts.Team {
	e := &hackEnts.Team{
		Id:         t.ID.String(),
		Name:       t.Name,
		CreatedAt:  timestamppb.New(t.CreatedAt),
		ModifiedAt: timestamppb.New(t.ModifiedAt),
		ProjectId:  t.Edges.Project.ID.String(),
		CreatorId:  t.Edges.Creator.ID.String(),
	}
	if t.Description != "" {
		d := t.Description
		e.Description = &d
	}
	if t.Edges.Modifier != nil {
		modID := t.Edges.Modifier.ID.String()
		e.ModifierId = &modID
	}
	if len(t.Edges.Members) > 0 {
		e.Members = make([]*userEnts.User, 0, len(t.Edges.Members))
		for _, u := range t.Edges.Members {
			e.Members = append(e.Members, userEntryFromEnt(u))
		}
	}
	if len(t.Edges.Submissions) > 0 {
		e.Submissions = make([]*hackEnts.Submission, 0, len(t.Edges.Submissions))
		for _, s := range t.Edges.Submissions {
			e.Submissions = append(e.Submissions, submissionEntryFromEnt(s))
		}
	}

	return e
}

func phaseEntryFromEnt(p *ent.Phase, hackathonID uuid.UUID) *hackEnts.Phase {
	e := &hackEnts.Phase{
		Id:          p.ID.String(),
		Name:        p.Name,
		CreatedAt:   timestamppb.New(p.CreatedAt),
		ModifiedAt:  timestamppb.New(p.ModifiedAt),
		HackathonId: hackathonID.String(),
		CreatorId:   p.Edges.Creator.ID.String(),
	}
	if p.Description != "" {
		d := p.Description
		e.Description = &d
	}
	if p.StartsAt != nil {
		e.StartsAt = timestamppb.New(*p.StartsAt)
	}
	if p.EndsAt != nil {
		e.EndsAt = timestamppb.New(*p.EndsAt)
	}
	if p.Edges.Page != nil {
		pid := p.Edges.Page.ID.String()
		e.PageId = &pid
	}
	e.ModifierId = p.Edges.Modifier.ID.String()

	return e
}

func settingsEntryFromEnt(s *ent.HackathonSettings) *hackEnts.HackathonSettings {
	return &hackEnts.HackathonSettings{
		Id:                   s.ID.String(),
		RegistrationsEnabled: s.RegistrationsEnabled,
		VotingEnabled:        s.VotingEnabled,
		ModifiedAt:           timestamppb.New(s.ModifiedAt),
	}
}

// validateAgainstFormSchema checks answers against an organizer-defined form
// schema (the []map{key,label,type,required} shape stored on HackathonForms).
// Same rules the registration form uses: unknown keys are rejected so a typo
// is never silently accepted, and every required field must be present and
// non-empty.
//
// A nil/empty schema means the organizer defined no form, so anything goes —
// validation is opt-in by configuring one.
func validateAgainstFormSchema(
	schema []map[string]any,
	answers map[string]string,
	what string,
) error {
	if len(schema) == 0 {
		return nil
	}

	fieldByKey := make(map[string]map[string]any, len(schema))
	for _, f := range schema {
		if k, ok := f["key"].(string); ok {
			fieldByKey[k] = f
		}
	}

	for k := range answers {
		if _, ok := fieldByKey[k]; !ok {
			return status.Errorf(codes.InvalidArgument, "unknown %s field %q", what, k)
		}
	}
	for k, f := range fieldByKey {
		if required, _ := f["required"].(bool); required {
			if v, ok := answers[k]; !ok || v == "" {
				return status.Errorf(
					codes.InvalidArgument, "missing required %s field %q", what, k,
				)
			}
		}
	}

	return nil
}
