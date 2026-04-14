package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Submission holds the schema definition for the Submission entity.
type Submission struct {
	ent.Schema
}

// Fields of the Submission.
func (Submission) Fields() []ent.Field {
	return []ent.Field{
		field.String("team_id").
			NotEmpty(),
		field.String("project_id").
			NotEmpty(),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.String("created_by").
			NotEmpty(),
		field.String("result").
			Optional(),
		field.Enum("status").
			Values("draft", "final"),
		field.Int("version").
			Positive(),
	}
}

// Edges of the Submission.
func (Submission) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("team", Team.Type).
			Ref("submissions").
			Field("team_id"),
		edge.From("project", Project.Type).
			Ref("submissions").
			Field("project_id"),
		edge.From("creator", User.Type).
			Ref("submitted_projects").
			Field("created_by"),
		edge.From("modifier", User.Type).
			Field("modified_by"),
	}
}

// Indexes of the Submission.
func (Submission) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("team_id", "project_id", "version"),
	}
}
