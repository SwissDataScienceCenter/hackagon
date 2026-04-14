package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Phase holds the schema definition for the Phase entity.
type Phase struct {
	ent.Schema
}

// Fields of the Phase.
func (Phase) Fields() []ent.Field {
	return []ent.Field{
		field.Time("start_date"),
		field.Time("end_date"),
		field.String("name").
			NotEmpty(),
		field.Text("description").
			Optional(),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.Time("modified_at").
			Default(time.Now),
	}
}

// Edges of the Phase.
func (Phase) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("phases"),
		edge.From("page", Page.Type).
			Ref("phases"),
		edge.From("creator", User.Type).
			Ref("created_phases").Unique().Required().Immutable(),
		edge.From("modifier", User.Type).
			Ref("modified_phases").Unique(),
	}
}

// Indexes of the Phase.
func (Phase) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("start_date"),
		index.Fields("end_date"),
		index.Fields("name"),
	}
}
