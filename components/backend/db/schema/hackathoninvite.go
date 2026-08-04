package schema

import (
	"log/slog"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

// newInviteToken mints the link secret. v4 (random) rather than the v7 used
// for ids: a token must not encode its creation time or be guessable from a
// neighbouring one.
func newInviteToken() uuid.UUID {
	t, err := uuid.NewRandom()
	if err != nil {
		slog.Error("couldn't create invite token", "err", err)
		panic(err)
	}

	return t
}

// HackathonInvite is a shareable link that lets someone reach a private
// hackathon they could not otherwise see.
//
// The token is the whole secret: anyone holding it may view the event and ask
// to join, so it is generated server-side (never derived from the hackathon
// id) and can be revoked. Invites are deliberately MULTI-USE — an organizer
// mails one link to a group — and redeeming one does NOT admit anybody: it
// unlocks the event page, and the normal Join → waitlist → approval path still
// applies, so a forwarded link cannot put a stranger into the roster.
type HackathonInvite struct {
	ent.Schema
}

func (HackathonInvite) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("A revocable, shareable invitation link granting visibility of a private hackathon."),
	}
}

// Fields of the HackathonInvite.
func (HackathonInvite) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("token", uuid.UUID{}).
			Default(newInviteToken).
			Unique().
			Immutable().
			Comment("The secret in the invite URL. Generated server-side; never derived from the hackathon id."),
		field.String("note").
			Optional().
			Comment("Free-text reminder of who the link was sent to; organizer-facing only."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the invite was generated."),
		field.Time("revoked_at").
			Optional().
			Nillable().
			Comment("When set, the link stops working. Revoking is preferred over deletion so the audit trail survives."),
	}
}

// Edges of the HackathonInvite.
func (HackathonInvite) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("invites").Unique().Required().Immutable().
			Comment("The hackathon this invite grants visibility of."),
		edge.From("creator", User.Type).
			Ref("created_invites").Unique().Required().Immutable().
			Comment("The organizer or admin who generated the link."),
	}
}

// Indexes of the HackathonInvite.
func (HackathonInvite) Indexes() []ent.Index {
	return []ent.Index{
		// Every redemption looks the row up by token alone.
		index.Fields("token").Unique(),
	}
}

func (HackathonInvite) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
