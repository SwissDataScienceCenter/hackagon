package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// HackathonPrizes holds the schema definition for the HackathonPrizes entity.
type HackathonPrizes struct {
	ent.Schema
}

func (HackathonPrizes) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment(
			"The organizer-defined prize table and, after Finalize, the " +
				"awards. Votes are advisory: nothing is won until the admin " +
				"finalizes, and the table stays admin-editable afterwards.",
		),
	}
}

// Fields of the HackathonPrizes.
func (HackathonPrizes) Fields() []ent.Field {
	return []ent.Field{
		field.JSON("prizes", []map[string]any{}).
			Optional().
			Comment("Prize table ({rank,title}); rank 0 is a special prize."),
		field.JSON("awards", []map[string]any{}).
			Optional().
			Comment("Awarded submissions ({rank|special, submissionId}) set at Finalize."),
		field.Bool("finalized").
			Default(false).
			Comment("Whether the admin has spoken; results are advisory before this."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the prize table was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
	}
}

// Edges of the HackathonPrizes.
func (HackathonPrizes) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("prize_table").Unique().Required().
			Comment("The hackathon this prize table belongs to."),
		edge.From("modifier", User.Type).
			Ref("modified_prizes").Unique().Required().
			Comment("The user who last modified the prize table."),
	}
}

func (HackathonPrizes) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
