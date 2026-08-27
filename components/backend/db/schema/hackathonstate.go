package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

// HackathonState holds the schema definition for the HackathonState entity.
type HackathonState struct {
	ent.Schema
}

func (HackathonState) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment(
			"Configuration state for a hackathon. One row per hackathon, " +
				"pre-created on hackathon creation.",
		),
	}
}

// Fields of the HackathonState.
func (HackathonState) Fields() []ent.Field {
	return []ent.Field{
		field.Bool("registrations_enabled").
			Default(false).
			Comment("Whether new participants can register for this hackathon."),
		field.Bool("voting_enabled").
			Default(false).
			Comment("Whether voting is enabled for this hackathon."),
		field.Bool("propose_projects_enabled").
			Default(false).
			Comment("Whether project proposals are enabled for this hackathon."),
		field.Bool("set_team_preferences_enabled").
			Default(false).
			Comment("Whether teams can set preferences for this hackathon."),
		field.Bool("create_project_submissions_enabled").
			Default(false).
			Comment("Whether teams can create project submissions for this hackathon."),
		field.Bool("view_results_enabled").
			Default(false).
			Comment("Whether results can be viewed for this hackathon."),
		field.Bool("view_teams_enabled").
			Default(false).
			Comment("Whether team assignments are visible to all participants."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the state was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
		field.UUID("current_phase_id", uuid.UUID{}).
			Optional().
			Comment(
				"The phase an organizer has declared current. Nil means no current " +
					"phase is set; purely for UI display.",
			),
	}
}

// Edges of the HackathonState.
func (HackathonState) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("state").Unique().Required().
			Comment("The hackathon this state belongs to."),
		edge.From("modifier", User.Type).
			Ref("modified_states").Unique().
			Comment(
				"Who last modified the state. Optional so seeded rows " +
					"need no attribution; set on every edit.",
			),
		edge.From("current_phase", Phase.Type).
			Ref("current_state").
			Field("current_phase_id").
			Unique().
			Comment("The phase currently set as active for this hackathon."),
	}
}

func (HackathonState) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("current_phase_id").StorageKey("current_phase_id").Unique(),
	}
}

func (HackathonState) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
