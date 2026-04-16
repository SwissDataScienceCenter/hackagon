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
		field.Time("created_at").
			Immutable().
			Default(time.Now),
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
			Ref("submissions").Unique().Required(),
		edge.From("project", Project.Type).
			Ref("submissions").Unique().Required(),
		edge.From("creator", User.Type).
			Ref("created_submissions").Unique().Required().Immutable(),
	}
}

// Indexes of the Submission.
func (Submission) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("version").Edges("project", "team").Unique(),
	}
}
