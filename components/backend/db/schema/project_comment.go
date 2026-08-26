package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// ProjectComment holds the schema definition for a review comment on a project.
type ProjectComment struct {
	ent.Schema
}

func (ProjectComment) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("A review comment on a project, written by a user."),
	}
}

// Fields of the ProjectComment.
func (ProjectComment) Fields() []ent.Field {
	return []ent.Field{
		field.Text("text").
			Comment("The comment text."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the comment was created."),
	}
}

// Edges of the ProjectComment.
func (ProjectComment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("project", Project.Type).
			Ref("comments").Unique().Required().
			Comment("The project this comment belongs to."),
		edge.From("user", User.Type).
			Ref("project_comments").Unique().Required().
			Comment("The user who wrote this comment."),
	}
}

func (ProjectComment) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
