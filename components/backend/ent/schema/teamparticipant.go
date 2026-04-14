package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// TeamParticipant holds the schema definition for the TeamParticipant entity.
type TeamParticipant struct {
	ent.Schema
}

// Fields of the TeamParticipant.
func (TeamParticipant) Fields() []ent.Field {
	return []ent.Field{
		field.String("team_id").
			NotEmpty(),
		field.String("user_id").
			NotEmpty(),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
	}
}

// Edges of the TeamParticipant.
func (TeamParticipant) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("team", Team.Type).
			Ref("participants").
			Field("team_id"),
		edge.From("user", User.Type).
			Ref("team_participations").
			Field("user_id"),
	}
}