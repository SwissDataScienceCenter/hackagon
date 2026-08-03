package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// VoteResult holds the schema definition for the VoteResult entity.
type VoteResult struct {
	ent.Schema
}

func (VoteResult) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment(
			"A placement entry within a vote category. Multiple VoteResults can exist per category.",
		),
	}
}

// Fields of the VoteResult.
func (VoteResult) Fields() []ent.Field {
	return []ent.Field{
		field.Int("position").
			Comment("Ordering hint (1 = first place, 2 = second, etc.). Not unique — ties allowed."),
		field.String("title").
			Optional().
			Comment("Optional custom title for the placement (e.g. \"Most Innovative\")."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the result was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
	}
}

// Edges of the VoteResult.
func (VoteResult) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("vote_category", VoteCategory.Type).
			Ref("results").Unique().Required().
			Comment("The category this result belongs to."),
		edge.From("submission", Submission.Type).
			Ref("vote_results").Unique().Required().
			Comment("The submission being placed."),
	}
}

func (VoteResult) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
