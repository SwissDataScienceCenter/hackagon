package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
)

// Participant holds the schema definition for the Participant entity.
type Participant struct {
	ent.Schema
}

func (Participant) Annotations() []schema.Annotation {
	return []schema.Annotation{
		field.ID("user_id", "hackathon_id"),
		schema.Comment("Join table for the M2M relationship between users and hackathons, with participation metadata."),
	}
}

// Fields of the Participant.
func (Participant) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("hackathon_id", uuid.UUID{}).
			Comment("Foreign key to the hackathon."),
		field.UUID("user_id", uuid.UUID{}).
			Comment("Foreign key to the user."),
		field.Bool("is_waiting").
			Default(true).
			Comment("Whether the participant is on the waitlist (true) or confirmed (false)."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the participant joined."),
	}
}

// Edges of the Participant.
func (Participant) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("hackathon", Hackathon.Type).
			Unique().Required().
			Field("hackathon_id").
			Comment("The hackathon being participated in."),
		edge.To("user", User.Type).
			Unique().Required().
			Field("user_id").
			Comment("The participating user."),
	}
}
func (Participant) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
