package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/google/uuid"
)

// TeamParticipant holds the schema definition for the TeamParticipant entity.
type TeamParticipant struct {
	ent.Schema
}

func (TeamParticipant) Annotations() []schema.Annotation {
	return []schema.Annotation{
		field.ID("user_id", "team_id"),
		schema.Comment("Join table for the M2M relationship between users and teams."),
	}
}

// Fields of the TeamParticipant.
func (TeamParticipant) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("team_id", uuid.UUID{}).
			Comment("Foreign key to the team."),
		field.UUID("user_id", uuid.UUID{}).
			Comment("Foreign key to the user."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the user joined the team."),
	}
}

// Edges of the TeamParticipant.
func (TeamParticipant) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("team", Team.Type).
			Unique().Required().
			Field("team_id").
			Annotations(entsql.OnDelete(entsql.Cascade)).
			Comment("The team."),
		edge.To("user", User.Type).
			Unique().Required().
			Field("user_id").
			Annotations(entsql.OnDelete(entsql.Cascade)).
			Comment("The team member."),
	}
}

func (TeamParticipant) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
