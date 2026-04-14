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
		field.String("hackathon_id").
			NotEmpty(),
		field.Time("start_date").
			NotEmpty(),
		field.Time("end_date").
			NotEmpty(),
		field.String("name").
			NotEmpty(),
		field.Text("description").
			Optional(),
		field.String("page_id").
			Optional(),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.Time("modified_at").
			Default(time.Now),
		field.String("created_by").
			Immutable().
			NotEmpty(),
		field.String("modified_by").
			NotEmpty(),
	}
}

// Edges of the Phase.
func (Phase) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("phases").
			Field("hackathon_id"),
		edge.From("page", Page.Type).
			Ref("phase").
			Field("page_id"),
		edge.From("creator", User.Type).
			Field("created_by"),
		edge.From("modifier", User.Type).
			Field("modified_by"),
	}
}

// Indexes of the Phase.
func (Phase) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("hackathon_id"),
		index.Fields("start_date"),
		index.Fields("end_date"),
		index.Fields("name"),
	}
}
