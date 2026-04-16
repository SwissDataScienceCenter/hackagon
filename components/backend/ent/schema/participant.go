package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Participant holds the schema definition for the Participant entity.
type Participant struct {
	ent.Schema
}

func (Participant) Annotations() []schema.Annotation {
	return []schema.Annotation{
		field.ID("user_id", "hackathon_id"),
	}
}

// Fields of the Participant.
func (Participant) Fields() []ent.Field {
	return []ent.Field{
		field.Int("hackathon_id"),
		field.Int("user_id"),
		field.Bool("is_waiting").
			Default(true),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
	}
}

// Edges of the Participant.
func (Participant) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("hackathon", Hackathon.Type).
			Unique().Required().
			Field("hackathon_id"),
		edge.To("user", User.Type).
			Unique().Required().
			Field("user_id"),
	}
}
