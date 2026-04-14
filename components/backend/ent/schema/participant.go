package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Participant holds the schema definition for the Participant entity.
type Participant struct {
	ent.Schema
}

// Fields of the Participant.
func (Participant) Fields() []ent.Field {
	return []ent.Field{
		field.String("hackathon_id").
			NotEmpty(),
		field.String("user_id").
			NotEmpty(),
		field.Bool("is_waiting").
			Default(false),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
	}
}

// Edges of the Participant.
func (Participant) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("participants").
			Field("hackathon_id"),
		edge.From("user", User.Type).
			Ref("participant_hackathons").
			Field("user_id"),
	}
}