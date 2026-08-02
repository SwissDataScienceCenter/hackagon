package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Capability holds the schema definition for the Capability entity.
type Capability struct {
	ent.Schema
}

func (Capability) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment(
			"Whether one member-facing action is currently open in a hackathon. " +
				"One row per capability per hackathon, pre-created on hackathon creation.",
		),
	}
}

// Fields of the Capability.
func (Capability) Fields() []ent.Field {
	return []ent.Field{
		field.Enum("capability").
			Values(
				"register",
				"submit_proposal",
				"set_team_preferences",
				"submit_project",
				"vote",
				"view_results",
			).
			Immutable().
			Comment("Which action this row gates. Immutable: it identifies the row."),
		field.Bool("enabled").
			Default(false).
			Comment(
				"The authoritative gate. Phases may describe when this is expected to " +
					"change, but never change it themselves — a wrong date can only " +
					"produce a wrong countdown, never an unauthorized action.",
			),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the capability row was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
	}
}

// Edges of the Capability.
func (Capability) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("capabilities").Unique().Required().
			Comment("The hackathon this capability belongs to."),
		edge.From("modifier", User.Type).
			Ref("modified_capabilities").Unique().
			Comment(
				"Who last flipped the flag. Optional so seeded and backfilled rows " +
					"need no attribution; set on every edit.",
			),
	}
}

// Indexes of the Capability.
func (Capability) Indexes() []ent.Index {
	return []ent.Index{
		// One row per capability per hackathon. Without this a double-create
		// would silently produce two rows disagreeing about whether an action
		// is open.
		index.Fields("capability").Edges("hackathon").Unique(),
	}
}

func (Capability) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
