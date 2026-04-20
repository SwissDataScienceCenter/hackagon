package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// User holds the schema definition for the User entity.
type User struct {
	ent.Schema
}

func (User) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("An authenticated user, synced from Keycloak on first login."),
	}
}

// Fields of the User.
func (User) Fields() []ent.Field {
	return []ent.Field{
		field.String("username").
			Comment("Username in Keycloak."),
		field.String("keycloak_id").NotEmpty().Unique().
			Comment("Unique identifier from Keycloak (sub claim)."),
		field.String("display_name").Optional().Default("").
			Comment("Preferred display name of the user."),
		field.String("email").Optional().Default("").
			Comment("Email of the user, same as in Keycloak"),
		field.Time("created_at").Immutable().Default(time.Now).
			Comment("Timestamp when the user was first seen."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last profile update."),
	}
}

// Edges of the User.
func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("created_hackathons", Hackathon.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Hackathons this user created."),
		edge.To("modified_hackathons", Hackathon.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Hackathons this user last modified."),
		edge.To("created_projects", Project.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Projects this user created."),
		edge.To("modified_projects", Project.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Projects this user last modified."),
		edge.To("participates_in_hackathons", Hackathon.Type).Through("participations", Participant.Type).
			Comment("Hackathons this user participates in."),
		edge.To("participates_in_teams", Team.Type).Through("team_participations", TeamParticipant.Type).
			Comment("Teams this user is a member of."),
		edge.To("created_teams", Team.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Teams this user created."),
		edge.To("modified_teams", Team.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Teams this user last modified."),
		edge.To("created_pages", Page.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Content pages this user created."),
		edge.To("modified_pages", Page.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Content pages this user last modified."),
		edge.To("created_phases", Phase.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Phases this user created."),
		edge.To("modified_phases", Phase.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Phases this user last modified."),
		edge.To("created_submissions", Submission.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Submissions this user created."),
		edge.To("modified_submissions", Submission.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Submissions this user last modified."),
		edge.To("preferred_projects", Project.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)).
			Comment("Projects this user has marked as preferred."),
	}
}
