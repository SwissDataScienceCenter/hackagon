package service

import (
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	userEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
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

func visibilityFromEnt(v enthackathon.Visibility) hackEnts.Visibility {
	switch v {
	case enthackathon.VisibilityPublic:
		return hackEnts.Visibility_VISIBILITY_PUBLIC
	case enthackathon.VisibilityPrivate:
		return hackEnts.Visibility_VISIBILITY_PRIVATE
	default:
		return hackEnts.Visibility_VISIBILITY_UNSPECIFIED
	}
}

func visibilityToEnt(v hackEnts.Visibility) (enthackathon.Visibility, bool) {
	switch v {
	case hackEnts.Visibility_VISIBILITY_PUBLIC:
		return enthackathon.VisibilityPublic, true
	case hackEnts.Visibility_VISIBILITY_PRIVATE:
		return enthackathon.VisibilityPrivate, true
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

func hackathonEntryFromEnt(h *ent.Hackathon, now time.Time) *hackEnts.Hackathon {
	e := &hackEnts.Hackathon{
		Id:         h.ID.String(),
		Name:       h.Name,
		CreatedAt:  timestamppb.New(h.CreatedAt),
		ModifiedAt: timestamppb.New(h.ModifiedAt),
		Visibility: visibilityFromEnt(h.Visibility),
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
	e := &hackEnts.Project{
		Id:          p.ID.String(),
		Title:       p.Title,
		Description: p.Description,
		Status:      projectStatusFromEnt(p.Status.String()),
		CreatedAt:   timestamppb.New(p.CreatedAt),
		ModifiedAt:  timestamppb.New(p.ModifiedAt),
		HackathonId: hackathonID.String(),
		TrackId:     p.Edges.Track.ID.String(),
		CreatorId:   p.Edges.Creator.ID.String(),
	}
	if p.Image != "" {
		img := p.Image
		e.Image = &img
	}
	if p.Edges.Modifier != nil {
		mid := p.Edges.Modifier.ID.String()
		e.ModifierId = &mid
	}
	return e
}

func pageEntryFromEnt(p *ent.Page, hackathonID uuid.UUID) *hackEnts.Page {
	e := &hackEnts.Page{
		Id:          p.ID.String(),
		Title:       p.Title,
		Content:     p.Content,
		Visible:     p.Visible,
		Order:       int32(p.Order),
		CreatedAt:   timestamppb.New(p.CreatedAt),
		ModifiedAt:  timestamppb.New(p.ModifiedAt),
		HackathonId: hackathonID.String(),
		CreatorId:   p.Edges.Creator.ID.String(),
	}
	if p.Edges.Phase != nil {
		pid := p.Edges.Phase.ID.String()
		e.PhaseId = &pid
	}
	if p.Edges.Modifier != nil {
		mid := p.Edges.Modifier.ID.String()
		e.ModifierId = &mid
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
	if p.Edges.Modifier != nil {
		mid := p.Edges.Modifier.ID.String()
		e.ModifierId = &mid
	}
	return e
}
