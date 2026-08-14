package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// HackathonForms holds the schema definition for the HackathonForms entity.
type HackathonForms struct {
	ent.Schema
}

func (HackathonForms) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment(
			"Organizer-defined form schemas and voting policy for a hackathon. " +
				"Schemas are stored as JSON; SubmitRegistrationForm validates " +
				"responses against them.",
		),
	}
}

// Fields of the HackathonForms.
func (HackathonForms) Fields() []ent.Field {
	return []ent.Field{
		field.JSON("registration_fields", []map[string]any{}).
			Optional().
			Comment("Registration form fields ({key,label,type,required,maxMb})."),
		field.JSON("registration_consents", []map[string]any{}).
			Optional().
			Comment("Registration consents ({key,label,required})."),
		field.JSON("submission_fields", []map[string]any{}).
			Optional().
			Comment("Submission form fields ({key,label,type,required,maxMb})."),
		field.JSON("voting_policy", map[string]any{}).
			Optional().
			Comment("Pinned voting mechanism decisions (mechanism, scale, tie-breaks)."),
		field.JSON("email_templates", map[string]string{}).
			Optional().
			Comment(
				"Organizer-authored notification copy, keyed by moment " +
					"(registrationConfirmed, teamAssigned, deadlineReminder, results). " +
					"Stored only — no notification service sends them yet.",
			),
		field.JSON("branding", map[string]string{}).
			Optional().
			Comment("Event branding (primaryColor, accentColor, bannerText). The logo lives on the hackathon row itself."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the forms row was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
	}
}

// Edges of the HackathonForms.
func (HackathonForms) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("forms").Unique().Required().
			Comment("The hackathon these forms belong to."),
		edge.From("modifier", User.Type).
			Ref("modified_forms").Unique().Required().
			Comment("The user who last modified these forms."),
	}
}

func (HackathonForms) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
