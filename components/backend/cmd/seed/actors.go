package main

// The people the fixture is made of, and how the seed acts as each of them.

import (
	"context"
	"fmt"

	"google.golang.org/grpc/metadata"

	userEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
	userMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/messages/user_svc"
)

// actor is one identity, together with the context that authenticates as it —
// so a seeded call reads `h.hackathon.Join(bob.ctx, req)`.
//
// `id` is the ent user id, which the RPCs that name somebody else want
// (ApproveParticipant, AssignUser, AddRole), as opposed to the Keycloak id,
// which is what a token's `sub` carries and what casbin keys roles by. Register
// hands back the former, so an actor knows both.
type actor struct {
	keycloakID  string
	username    string
	displayName string
	email       string

	id  string
	ctx context.Context //nolint:containedctx // carrying the identity is the point
}

// register creates the actor's user row the way the application does: by
// authenticating as them and calling Register, which reads username, display
// name and email off the token's claims. No RPC creates a user on somebody
// else's behalf, and none sets a display name afterwards — which is the whole
// reason the seed signs its own tokens.
func (h *harness) register(keycloakID, username, displayName, email string) (*actor, error) {
	token, err := h.mintToken(keycloakID, username, displayName, email)
	if err != nil {
		return nil, err
	}

	a := &actor{
		keycloakID:  keycloakID,
		username:    username,
		displayName: displayName,
		email:       email,
		// filled in from the Register response below
		id: "",
		ctx: metadata.AppendToOutgoingContext(
			h.ctx, "authorization", "Bearer "+token,
		),
	}

	resp, err := h.user.Register(a.ctx, &userMsgs.RegisterRequest{})
	if err != nil {
		return nil, fmt.Errorf("register %s: %w", username, err)
	}
	a.id = resp.GetUser().GetId()

	return a, nil
}

// makeOrganizer grants the global role that lets somebody create a hackathon.
// Only an admin may hand it out, which is why it takes one.
func (h *harness) makeOrganizer(admin, who *actor) error {
	_, err := h.user.AddRole(admin.ctx, &userMsgs.AddRoleRequest{
		UserId: who.id,
		Role:   userEnts.GlobalRole_GLOBAL_ROLE_HACKATHON_ORGANIZER,
	})
	if err != nil {
		return fmt.Errorf("grant organizer role to %s: %w", who.username, err)
	}

	return nil
}
