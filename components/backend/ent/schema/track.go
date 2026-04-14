package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Track holds the schema definition for the Track entity.
type Track struct {
	ent.Schema
}

// Fields of the Track.
func (Track) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			NotEmpty(),
		field.Text("description").
			NotEmpty(),
		field.String("hackathon_id").
			NotEmpty(),
	}
}

// Edges of the Track.
func (Track) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("tracks").
			Field("hackathon_id"),
		edge.To("projects", Project.Type),
	}
}

// Indexes of the Track.
func (Track) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("name"),
		index.Fields("hackathon_id"),
	}
}
