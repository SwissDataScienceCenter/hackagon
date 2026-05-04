package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Project holds the schema definition for the Project entity.
type Project struct {
	ent.Schema
}

func (Project) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("A project proposal within a hackathon track."),
	}
}

// Fields of the Project.
func (Project) Fields() []ent.Field {
	return []ent.Field{
		field.String("title").
			NotEmpty().
			Comment("Title of the project."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the project was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
		field.Enum("status").
			Values("proposed", "approved").
			Comment("Approval status of the project."),
		field.String("image").
			Optional().
			Comment("URL or path to the project cover image."),
		field.Text("description").
			Comment("Detailed description of the project."),
	}
}

// Edges of the Project.
func (Project) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("track", Track.Type).
			Ref("projects").Unique().Required().
			Comment("The track this project belongs to."),
		edge.From("hackathon", Hackathon.Type).
			Ref("projects").Unique().Required().
			Comment("The hackathon this project belongs to."),
		edge.From("creator", User.Type).
			Ref("created_projects").Unique().Immutable().Required().
			Comment("The user who proposed this project."),
		edge.From("modifier", User.Type).
			Ref("modified_projects").Unique().Required().
			Comment("The user who last modified this project."),
		edge.To("teams", Team.Type).
			Comment("Teams working on this project."),
		edge.To("submissions", Submission.Type).
			Comment("Submissions made for this project."),
		edge.From("preferred_by_users", User.Type).Ref("preferred_projects").
			Comment("Users who marked this project as preferred."),
	}
}

// Indexes of the Project.
func (Project) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("title"),
		index.Fields("status"),
	}
}

func (Project) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
