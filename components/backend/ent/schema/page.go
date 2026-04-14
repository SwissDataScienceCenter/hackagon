package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Page holds the schema definition for the Page entity.
type Page struct {
	ent.Schema
}

// Fields of the Page.
func (Page) Fields() []ent.Field {
	return []ent.Field{
		field.String("hackathon_id").
			NotEmpty(),
		field.String("title").
			NotEmpty(),
		field.Text("content"),
		field.Bool("visible").
			Default(true),
		field.Int("order"),
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

// Edges of the Page.
func (Page) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("pages").
			Field("hackathon_id"),
		edge.From("creator", User.Type).
			Field("created_by"),
		edge.From("modifier", User.Type).
			Field("modified_by"),
	}
}

// Indexes of the Page.
func (Page) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("hackathon_id"),
		index.Fields("order"),
		index.Fields("visible"),
	}
}
