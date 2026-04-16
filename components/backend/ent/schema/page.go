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
			Default(time.Now).UpdateDefault(time.Now),
	}
}

// Edges of the Page.
func (Page) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("pages"),
		edge.From("phase", Phase.Type).Ref("page").Unique(),
		edge.From("creator", User.Type).
			Ref("created_pages").Unique().Required().Immutable(),
		edge.From("modifier", User.Type).
			Ref("modified_pages").Unique(),
	}
}

// Indexes of the Page.
func (Page) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("order"),
		index.Fields("visible"),
	}
}
