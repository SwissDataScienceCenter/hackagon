package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// TeamParticipant holds the schema definition for the TeamParticipant entity.
type TeamParticipant struct {
	ent.Schema
}

func (TeamParticipant) Annotations() []schema.Annotation {
	return []schema.Annotation{
		field.ID("user_id", "team_id"),
	}
}

// Fields of the TeamParticipant.
func (TeamParticipant) Fields() []ent.Field {
	return []ent.Field{
		field.Int("team_id"),

		field.Int("user_id"),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
	}
}

// Edges of the TeamParticipant.
func (TeamParticipant) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("team", Team.Type).
			Unique().Required().
			Field("team_id"),
		edge.To("user", User.Type).
			Unique().Required().
			Field("user_id"),
	}
}
