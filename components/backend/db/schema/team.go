package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Team holds the schema definition for the Team entity.
type Team struct {
	ent.Schema
}

func (Team) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("A team of participants working on a project."),
	}
}

// Fields of the Team.
func (Team) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			NotEmpty().
			Comment("Display name of the team."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the team was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
		field.Text("description").
			Optional().
			Comment("Optional description of the team."),
	}
}

// Edges of the Team.
func (Team) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("project", Project.Type).
			Ref("teams").Unique().Required().
			Comment("The project this team is working on."),
		edge.From("creator", User.Type).
			Ref("created_teams").Unique().Immutable().Required().
			Comment("The user who created this team."),
		edge.From("modifier", User.Type).
			Ref("modified_teams").Unique().
			Comment("The user who last modified this team."),
		edge.To("submissions", Submission.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)).
			Comment("Submissions made by this team."),
		edge.From("members", User.Type).
			Ref("participates_in_teams").
			Through("team_participants", TeamParticipant.Type).
			Comment("Users who are members of this team."),
	}
}

func (Team) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
