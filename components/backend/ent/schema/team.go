package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// Team holds the schema definition for the Team entity.
type Team struct {
	ent.Schema
}

// Fields of the Team.
func (Team) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			NotEmpty(),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now),
		field.Text("description").
			Optional(),
	}
}

// Edges of the Team.
func (Team) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("project", Project.Type).
			Ref("teams").Unique().Required(),
		edge.From("creator", User.Type).
			Ref("created_teams").Unique().Immutable().Required(),
		edge.From("modifier", User.Type).
			Ref("modified_teams").Unique(),
		edge.To("submissions", Submission.Type),
		edge.From("members", User.Type).
			Ref("participates_in_teams").
			Through("team_participants", TeamParticipant.Type),
	}
}
