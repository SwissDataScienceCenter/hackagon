package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// User holds the schema definition for the User entity.
type User struct {
	ent.Schema
}

// Fields of the User.
func (User) Fields() []ent.Field {
	return []ent.Field{
		field.String("username"),
		field.String("keycloak_id"),
		field.Time("created_at").Default(time.Now),
	}
}

// Edges of the User.
func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("created_hackathons", Hackathon.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("modified_hackathons", Hackathon.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("created_projects", Project.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("modified_projects", Project.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("participant_hackathons", Participant.Type),
	}
}
