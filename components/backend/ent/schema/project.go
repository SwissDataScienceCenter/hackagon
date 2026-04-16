package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Project holds the schema definition for the Project entity.
type Project struct {
	ent.Schema
}

// Fields of the Project.
func (Project) Fields() []ent.Field {
	return []ent.Field{
		field.String("title").
			NotEmpty(),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now),
		field.Enum("status").
			Values("proposed", "approved"),
		field.String("image").
			Optional(),
		field.Text("description"),
	}
}

// Edges of the Project.
func (Project) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("track", Track.Type).
			Ref("projects").Unique().Required(),
		edge.From("hackathon", Hackathon.Type).
			Ref("projects").Unique().Required(),
		edge.From("creator", User.Type).
			Ref("created_projects").Unique().Immutable().Required(),
		edge.From("modifier", User.Type).
			Ref("modified_projects").Unique(),
		edge.To("teams", Team.Type),
		edge.To("submissions", Submission.Type),
	}
}

// Indexes of the Project.
func (Project) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("title"),
		index.Fields("status"),
	}
}
