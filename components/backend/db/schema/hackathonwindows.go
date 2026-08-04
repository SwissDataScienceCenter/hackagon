package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// HackathonWindows holds the schema definition for the HackathonWindows entity.
type HackathonWindows struct {
	ent.Schema
}

func (HackathonWindows) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment(
			"Per-hackathon time windows enforced on the acting RPCs " +
				"(Join, Propose, SetPreference, CreateSubmission). " +
				"Unset windows are not enforced; overrides are one-shot " +
				"absolute extensions granted by an organizer.",
		),
	}
}

// Fields of the HackathonWindows.
func (HackathonWindows) Fields() []ent.Field {
	return []ent.Field{
		field.Time("registration_opens").
			Optional().Nillable().
			Comment("Join is rejected before this instant."),
		field.Time("registration_closes").
			Optional().Nillable().
			Comment("Join is rejected after this instant (unless overridden)."),
		field.Time("proposals_close").
			Optional().Nillable().
			Comment("Propose is rejected after this instant."),
		field.Time("preferences_close").
			Optional().Nillable().
			Comment("SetPreference is rejected after this instant."),
		field.Time("submissions_close").
			Optional().Nillable().
			Comment("CreateSubmission is rejected after this instant (unless overridden)."),
		field.Time("registration_override_until").
			Optional().Nillable().
			Comment("Manual walk-in window: registration stays open until this instant."),
		field.Time("submissions_override_until").
			Optional().Nillable().
			Comment("Manual grace window: submissions stay open until this instant."),
		field.String("late_policy").
			Optional().
			Comment("Human-readable note on how late submissions are handled."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the windows were created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
	}
}

// Edges of the HackathonWindows.
func (HackathonWindows) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("windows").Unique().Required().
			Comment("The hackathon these windows belong to."),
		edge.From("modifier", User.Type).
			Ref("modified_windows").Unique().Required().
			Comment("The user who last modified these windows."),
	}
}

func (HackathonWindows) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
