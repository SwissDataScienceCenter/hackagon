package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entinvite "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathoninvite"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Invitation links for private hackathons.
//
// The token in the URL is the entire secret, so the organizer-facing RPCs
// (which return it) require hackathon write, while the redemption RPC takes
// only the token — never a hackathon id — so it cannot be used to probe which
// events exist. Redeeming grants VISIBILITY, not membership: the holder still
// goes through Join and the organizer's approval.

// requireLiveInvite fails unless token names a non-revoked invite of this
// hackathon. Every rejection returns the same PermissionDenied, so a caller
// cannot tell a wrong token from a revoked one or from one belonging to a
// different event.
func (s *HackathonService) requireLiveInvite(
	ctx context.Context,
	hackathonID uuid.UUID,
	token string,
) error {
	denied := status.Error(
		codes.PermissionDenied,
		"this hackathon is private: a valid invitation link is required to join",
	)
	if token == "" {
		return denied
	}
	t, err := uuid.Parse(token)
	if err != nil {
		return denied
	}

	inv, err := s.dbClient.HackathonInvite.Query().
		Where(entinvite.TokenEQ(t)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return denied
		}
		slog.Error("query invite", "err", err)

		return status.Error(codes.Internal, "couldn't query database")
	}
	if inv.RevokedAt != nil {
		return denied
	}
	if inv.Edges.Hackathon == nil || inv.Edges.Hackathon.ID != hackathonID {
		return denied
	}

	return nil
}

func (s *HackathonService) CreateInvite(
	ctx context.Context,
	req *msgs.CreateInviteRequest,
) (*msgs.CreateInviteResponse, error) {
	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	// Generating a link hands out access, so it is a write on the hackathon.
	if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}

	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	creator, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Error(codes.NotFound, "acting user does not exist")
		}
		slog.Error("query acting user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	h, err := s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(id)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "hackathon %s not found", id)
		}
		slog.Error("query hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	create := s.dbClient.HackathonInvite.Create().
		SetHackathon(h).
		SetCreator(creator)
	if req.Note != nil {
		create = create.SetNote(req.GetNote())
	}
	inv, err := create.Save(ctx)
	if err != nil {
		slog.Error("create invite", "err", err)

		return nil, status.Error(codes.Internal, "couldn't create invite")
	}

	return &msgs.CreateInviteResponse{Invite: inviteEntryFromEnt(inv, id, creator.ID)}, nil
}

func (s *HackathonService) ListInvites(
	ctx context.Context,
	req *msgs.ListInvitesRequest,
) (*msgs.ListInvitesResponse, error) {
	id, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}
	// The response carries live secrets — same permission as creating one.
	if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
		return nil, err
	}

	q := s.dbClient.HackathonInvite.Query().
		Where(entinvite.HasHackathonWith(enthackathon.IDEQ(id))).
		WithCreator().
		Order(ent.Desc(entinvite.FieldCreatedAt))
	if !req.GetIncludeRevoked() {
		q = q.Where(entinvite.RevokedAtIsNil())
	}

	invites, err := q.All(ctx)
	if err != nil {
		slog.Error("list invites", "err", err)

		return nil, status.Error(codes.Internal, "couldn't list invites")
	}

	out := make([]*ents.HackathonInvite, 0, len(invites))
	for _, inv := range invites {
		var creatorID uuid.UUID
		if inv.Edges.Creator != nil {
			creatorID = inv.Edges.Creator.ID
		}
		out = append(out, inviteEntryFromEnt(inv, id, creatorID))
	}

	return &msgs.ListInvitesResponse{Invites: out}, nil
}

func (s *HackathonService) RevokeInvite(
	ctx context.Context,
	req *msgs.RevokeInviteRequest,
) (*msgs.RevokeInviteResponse, error) {
	inviteID, err := uuid.Parse(req.GetInviteId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid invite_id: %v", err)
	}

	inv, err := s.dbClient.HackathonInvite.Query().
		Where(entinvite.IDEQ(inviteID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "invite %s not found", inviteID)
		}
		slog.Error("query invite", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	if inv.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "invite has no hackathon")
	}
	if err := s.enforcer.RequirePermission(
		ctx, inv.Edges.Hackathon.ID.String(), m.Hackathon, m.Write,
	); err != nil {
		return nil, err
	}

	// Revoking twice is a no-op rather than an error: the caller's intent
	// (this link must not work) already holds.
	if inv.RevokedAt == nil {
		if _, err := inv.Update().SetRevokedAt(time.Now()).Save(ctx); err != nil {
			slog.Error("revoke invite", "err", err)

			return nil, status.Error(codes.Internal, "couldn't revoke invite")
		}
	}

	return &msgs.RevokeInviteResponse{}, nil
}

// PreviewInvite is the redemption side: it takes only the token, so it can
// never confirm whether a given hackathon id exists. Any bad, revoked or
// unknown token yields the same NotFound.
func (s *HackathonService) PreviewInvite(
	ctx context.Context,
	req *msgs.PreviewInviteRequest,
) (*msgs.PreviewInviteResponse, error) {
	notFound := status.Error(codes.NotFound, "this invitation link is not valid")

	t, err := uuid.Parse(req.GetToken())
	if err != nil {
		return nil, notFound
	}

	inv, err := s.dbClient.HackathonInvite.Query().
		Where(entinvite.TokenEQ(t)).
		WithHackathon(func(q *ent.HackathonQuery) {
			q.WithParticipants(func(pq *ent.ParticipantQuery) { pq.WithUser() })
		}).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, notFound
		}
		slog.Error("query invite", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	if inv.RevokedAt != nil || inv.Edges.Hackathon == nil {
		return nil, notFound
	}

	h := inv.Edges.Hackathon

	// Anonymous visitors may preview: the link is the credential, and they are
	// sent to sign in before Join. Only report membership for a real user.
	already := false
	if uid, _, serr := m.RequireSubject(ctx); serr == nil && uid != m.AnonSubject {
		for _, p := range h.Edges.Participants {
			if p.Edges.User != nil && p.Edges.User.KeycloakID == uid {
				already = true

				break
			}
		}
	}

	return &msgs.PreviewInviteResponse{
		Hackathon:          hackathonEntryFromEnt(h, time.Now()),
		AlreadyParticipant: already,
	}, nil
}

func inviteEntryFromEnt(
	inv *ent.HackathonInvite,
	hackathonID uuid.UUID,
	creatorID uuid.UUID,
) *ents.HackathonInvite {
	//exhaustruct:ignore
	e := &ents.HackathonInvite{
		Id:          inv.ID.String(),
		Token:       inv.Token.String(),
		HackathonId: hackathonID.String(),
		Note:        inv.Note,
		CreatedAt:   timestamppb.New(inv.CreatedAt),
		CreatorId:   creatorID.String(),
	}
	if inv.RevokedAt != nil {
		e.RevokedAt = timestamppb.New(*inv.RevokedAt)
	}

	return e
}
