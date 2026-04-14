package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Team holds the schema definition for the Team entity.
type Team struct {
	ent.Schema
}

// Fields of the Team.
func (Team) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			NotEmpty(),
		field.String("created_by").
			Immutable().
			NotEmpty(),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.Text("description").
			Optional(),
		field.String("project_id").
			NotEmpty(),
	}
}

// Edges of the Team.
func (Team) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("project", Project.Type).
			Ref("teams").
			Field("project_id"),
		edge.From("creator", User.Type).
			Ref("created_teams").
			Field("created_by"),
		edge.To("submissions", Submission.Type),
	}
}