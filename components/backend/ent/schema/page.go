package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Page holds the schema definition for the Page entity.
type Page struct {
	ent.Schema
}

func (Page) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("A content page associated with a hackathon, used for information display."),
	}
}

// Fields of the Page.
func (Page) Fields() []ent.Field {
	return []ent.Field{
		field.String("title").
			NotEmpty().
			Comment("Title of the page."),
		field.Text("content").
			Comment("Rich text content of the page."),
		field.Bool("visible").
			Default(true).
			Comment("Whether the page is visible to participants."),
		field.Int("order").
			Comment("Sort order for display; lower values appear first."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the page was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
	}
}

// Edges of the Page.
func (Page) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("pages").Unique().Required().
			Comment("The hackathon this page belongs to."),
		edge.From("phase", Phase.Type).Ref("page").Unique().
			Comment("The phase this page is linked to, if any."),
		edge.From("creator", User.Type).
			Ref("created_pages").Unique().Required().Immutable().
			Comment("The user who created this page."),
		edge.From("modifier", User.Type).
			Ref("modified_pages").Unique().
			Comment("The user who last modified this page."),
	}
}

// Indexes of the Page.
func (Page) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("order"),
		index.Fields("visible"),
	}
}
