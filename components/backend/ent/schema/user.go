package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// User holds the schema definition for the User entity.
type User struct {
	ent.Schema
}

// Fields of the User.
func (User) Fields() []ent.Field {
	return []ent.Field{
		field.String("username"),
		field.String("keycloak_id").NotEmpty().Unique(),
		field.Time("created_at").Immutable().Default(time.Now),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now),
	}
}

// Edges of the User.
func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("created_hackathons", Hackathon.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("modified_hackathons", Hackathon.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("created_projects", Project.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("modified_projects", Project.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("participates_in_hackathons", Hackathon.Type).Through("participations", Participant.Type),
		edge.To("participates_in_teams", Team.Type).Through("team_participations", TeamParticipant.Type),
		edge.To("created_teams", Team.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("modified_teams", Team.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("created_pages", Page.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("modified_pages", Page.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("created_phases", Phase.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("modified_phases", Phase.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("created_submissions", Submission.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("preferred_projects", Project.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
	}
}
