package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Phase holds the schema definition for the Phase entity.
type Phase struct {
	ent.Schema
}

func (Phase) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("A temporal phase of a hackathon (e.g. ideation, hacking, judging)."),
	}
}

// Fields of the Phase.
func (Phase) Fields() []ent.Field {
	return []ent.Field{
		field.Time("starts_at").Optional().Nillable().
			Comment("When this phase begins; nil if not yet scheduled."),
		field.Time("ends_at").Optional().Nillable().
			Comment("When this phase ends; nil if not yet scheduled."),
		field.String("name").
			NotEmpty().
			Comment("Display name of the phase."),
		field.Text("description").
			Optional().
			Comment("Description of the phase and its objectives."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the phase was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
		field.JSON("capabilities", []string{}).
			Optional().
			Comment(
				"Capability tags for this phase, drawn from the same enum as " +
					"HackathonState. Purely informational — does not auto-enable " +
					"or disable any capability. Each value must be one of: " +
					"register, propose_projects, set_team_preferences, " +
					"create_project_submissions, vote, view_results.",
			),
	}
}

// Edges of the Phase.
func (Phase) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("phases").Unique().Required().
			Comment("The hackathon this phase belongs to."),
		edge.To("page", Page.Type).Unique().
			Comment("Content page linked to this phase."),
		edge.To("current_of", Hackathon.Type).
			Comment(
				"The hackathon currently sitting in this phase, if an organizer has " +
					"advanced to it. At most one in practice, since a phase belongs to " +
					"exactly one hackathon.",
			),
		edge.From("creator", User.Type).
			Ref("created_phases").Unique().Required().Immutable().
			Comment("The user who created this phase."),
		edge.From("modifier", User.Type).
			Ref("modified_phases").Unique().Required().
			Comment("The user who last modified this phase."),
		edge.To("current_state", HackathonState.Type).
			Unique().
			Comment(
				"The hackathon that has this phase set as its current phase.",
			),
	}
}

// Indexes of the Phase.
func (Phase) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("starts_at"),
		index.Fields("ends_at"),
		index.Fields("name"),
	}
}

func (Phase) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
