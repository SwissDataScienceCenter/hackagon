package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entparticipant "github.com/swissdatasciencecenter/hackagon/components/backend/ent/participant"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type HackathonService struct {
	hackathon.UnimplementedHackathonServiceServer
	dbClient *ent.Client
	enforcer *m.Enforcer
}

func NewHackathonService(dbClient *ent.Client, enf *m.Enforcer) *HackathonService {
	return &HackathonService{
		dbClient: dbClient,
		enforcer: enf,
	}
}

func visibilityFromEnt(v enthackathon.Visibility) ents.Visibility {
	switch v {
	case enthackathon.VisibilityPublic:
		return ents.Visibility_VISIBILITY_PUBLIC
	case enthackathon.VisibilityPrivate:
		return ents.Visibility_VISIBILITY_PRIVATE
	default:
		return ents.Visibility_VISIBILITY_UNSPECIFIED
	}
}

func visibilityToEnt(v ents.Visibility) (enthackathon.Visibility, bool) {
	switch v {
	case ents.Visibility_VISIBILITY_PUBLIC:
		return enthackathon.VisibilityPublic, true
	case ents.Visibility_VISIBILITY_PRIVATE:
		return enthackathon.VisibilityPrivate, true
	default:
		return "", false
	}
}

func computeHackathonStatus(startsAt, endsAt *time.Time, now time.Time) ents.HackathonStatus {
	if startsAt == nil || now.Before(*startsAt) {
		return ents.HackathonStatus_HACKATHON_STATUS_PENDING
	}
	if endsAt != nil && !now.Before(*endsAt) {
		return ents.HackathonStatus_HACKATHON_STATUS_FINISHED
	}
	return ents.HackathonStatus_HACKATHON_STATUS_ACTIVE
}

func hackathonEntryFromEnt(h *ent.Hackathon, now time.Time) *ents.Hackathon {
	e := &ents.Hackathon{
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

func (s *HackathonService) List(
	ctx context.Context,
	req *msgs.ListRequest,
) (*msgs.ListResponse, error) {
	// TODO: casbin check once role-granting RPCs exist
	q := s.dbClient.Hackathon.Query()
	if vf := req.GetVisibilityFilter(); vf != ents.Visibility_VISIBILITY_UNSPECIFIED {
		entV, ok := visibilityToEnt(vf)
		if !ok {
			return nil, status.Errorf(codes.InvalidArgument, "unknown visibility: %v", vf)
		}
		q = q.Where(enthackathon.VisibilityEQ(entV))
	}
	if ownerID := req.GetOwnerId(); ownerID != "" {
		uid, err := uuid.Parse(ownerID)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid owner_id: %v", ownerID)
		}
		q = q.Where(enthackathon.HasCreatorWith(entuser.IDEQ(uid)))
	}

	if participantID := req.GetParticipantId(); participantID != "" {
		uid, err := uuid.Parse(participantID)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid participant_id: %v", participantID)
		}
		q = q.Where(enthackathon.HasParticipantsWith(
			entparticipant.UserIDEQ(uid),
			entparticipant.IsWaitingEQ(false),
		))
	}
	hs, err := q.Order(ent.Asc(enthackathon.FieldCreatedAt)).All(ctx)
	if err != nil {
		slog.Error("query hackathon", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	now := time.Now()
	wanted := make(map[ents.HackathonStatus]struct{}, len(req.GetStatusFilter()))
	for _, sf := range req.GetStatusFilter() {
		wanted[sf] = struct{}{}
	}

	entries := make([]*ents.Hackathon, 0, len(hs))
	for _, h := range hs {
		e := hackathonEntryFromEnt(h, now)
		if len(wanted) > 0 {
			if _, ok := wanted[e.Status]; !ok {
				continue
			}
		}
		entries = append(entries, e)
	}
	return &msgs.ListResponse{Hackathons: entries}, nil
}
