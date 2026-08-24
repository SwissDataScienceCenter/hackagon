package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
)

// HackathonInvite holds the schema definition for the HackathonInvite entity.
type HackathonInvite struct {
	ent.Schema
}

func (HackathonInvite) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("An invite for a hackathon."),
	}
}

// Fields of the HackathonInvite.
func (HackathonInvite) Fields() []ent.Field {
	return []ent.Field{
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.Time("revoked_at").
			Optional().
			Nillable(),
		field.UUID("token", uuid.UUID{}).
			Unique().
			Default(func() uuid.UUID {
				id, err := uuid.NewV7()
				if err != nil {
					panic(err)
				}
				return id
			}),
		field.String("note").
			Optional().
			MaxLen(500),
		field.Time("expires_at").
			Optional().
			Nillable(),
	}
}

// Edges of the HackathonInvite.
func (HackathonInvite) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("hackathon", Hackathon.Type).
			Unique().Required().Immutable().
			Field("hackathon_id").
			Comment("The hackathon this invite grants access to."),
		edge.From("creator", User.Type).
			Ref("created_hackathon_invites").Unique().Required().Immutable().
			Comment("The user who created this invite."),
	}
}

func (HackathonInvite) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
