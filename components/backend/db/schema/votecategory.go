package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
)

// VoteCategory holds the schema definition for the VoteCategory entity.
type VoteCategory struct {
	ent.Schema
}

func (VoteCategory) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment(
			"A voting category within a hackathon, defining the criteria and rules for one dimension of evaluation.",
		),
	}
}

// Fields of the VoteCategory.
func (VoteCategory) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			NotEmpty().
			Comment("Display name of the category (e.g. \"Coolness\", \"Novelty\")."),
		field.Text("description").
			Optional().
			Comment("Criteria and instructions for voters."),
		field.Enum("voting_method").
			Values("single_choice", "ranked", "points").
			Comment("How votes are cast: single choice, ranked, or points-based."),
		field.Enum("voter_type").
			Values("all_participants", "jury").
			Comment("Who can vote: all participants or jury only."),
	}
}

// Edges of the VoteCategory.
func (VoteCategory) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("vote_categories").Unique().Required().
			Comment("The hackathon this category belongs to."),
		edge.From("jury_members", User.Type).
			Ref("jury_categories").
			Comment("Users assigned as jury members for this category (M2M). Only used when voter_type is JURY."),
		edge.To("votes", Vote.Type).
			Comment("All votes cast for this category."),
		edge.To("results", VoteResult.Type).
			Comment("Placements assigned to this category."),
	}
}

func (VoteCategory) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
