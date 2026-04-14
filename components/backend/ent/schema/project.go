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
		field.String("hackathon_id").
			NotEmpty(),
		field.String("track_id").
			NotEmpty(),
		field.String("created_by").
			Immutable().
			NotEmpty(),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.String("modified_by").
			NotEmpty(),
		field.Time("modified_at").
			Default(time.Now),
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
			Ref("projects").
			Field("track_id"),
		edge.From("hackathon", Hackathon.Type).
			Ref("projects").
			Field("hackathon_id"),
		edge.From("creator", User.Type).
			Ref("created_projects").
			Field("created_by"),
		edge.From("modifier", User.Type).
			Field("modified_by"),
		edge.To("teams", Team.Type),
		edge.To("submissions", Submission.Type),
	}
}

// Indexes of the Project.
func (Project) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("title"),
		index.Fields("hackathon_id"),
		index.Fields("track_id"),
		index.Fields("created_by"),
		index.Fields("modified_by"),
		index.Fields("status"),
	}
}
