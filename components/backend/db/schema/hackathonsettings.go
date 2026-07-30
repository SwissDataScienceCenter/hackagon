package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// HackathonSettings holds the schema definition for the HackathonSettings entity.
type HackathonSettings struct {
	ent.Schema
}

func (HackathonSettings) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("Configuration settings for a hackathon."),
	}
}

// Fields of the HackathonSettings.
func (HackathonSettings) Fields() []ent.Field {
	return []ent.Field{
		field.Bool("registrations_enabled").
			Default(false).
			Comment("Whether new participants can register for this hackathon."),
		field.Bool("voting_enabled").
			Default(false).
			Comment("Whether voting is enabled for this hackathon."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the settings were created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
	}
}

// Edges of the HackathonSettings.
func (HackathonSettings) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("settings").Unique().Required().
			Comment("The hackathon this settings entry belongs to."),
		edge.From("modifier", User.Type).
			Ref("modified_settings").Unique().Required().
			Comment("The user who last modified these settings."),
	}
}

func (HackathonSettings) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
