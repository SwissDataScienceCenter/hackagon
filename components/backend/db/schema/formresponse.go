package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// FormResponse holds the schema definition for the FormResponse entity.
type FormResponse struct {
	ent.Schema
}

func (FormResponse) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment(
			"One registrant's answers to a hackathon's registration form, " +
				"validated against the organizer's schema at submission time.",
		),
	}
}

// Fields of the FormResponse.
func (FormResponse) Fields() []ent.Field {
	return []ent.Field{
		field.JSON("responses", map[string]any{}).
			Comment("Field answers keyed by the form field key."),
		field.JSON("consents", map[string]bool{}).
			Comment("Consent checkboxes keyed by the consent key."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the response was submitted."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
	}
}

// Edges of the FormResponse.
func (FormResponse) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("form_responses").Unique().Required().
			Comment("The hackathon the response belongs to."),
		edge.From("user", User.Type).
			Ref("form_responses").Unique().Required().
			Comment("The registrant the response is about."),
		edge.From("submitted_by", User.Type).
			Ref("submitted_form_responses").Unique().Required().
			Comment("Who actually entered it — the registrant, or an organizer digitizing a paper form."),
	}
}

// Indexes of the FormResponse.
func (FormResponse) Indexes() []ent.Index {
	return []ent.Index{
		index.Edges("hackathon", "user").Unique(),
	}
}

func (FormResponse) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
