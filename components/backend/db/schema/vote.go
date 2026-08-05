package schema

import (
	"context"
	"errors"
	"fmt"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Vote holds the schema definition for the Vote entity.
type Vote struct {
	ent.Schema
}

func (Vote) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment(
			"A single atomic judgment from one voter on one submission within one category.",
		),
	}
}

// VoteType is the discriminator for the vote method.
type VoteType string

const (
	VoteTypeSingleChoice VoteType = "single_choice"
	VoteTypeRanked       VoteType = "ranked"
	VoteTypePoints       VoteType = "points"
)

// Fields of the Vote.
func (Vote) Fields() []ent.Field {
	return []ent.Field{
		field.Enum("vote_type").
			Values(string(VoteTypeSingleChoice), string(VoteTypeRanked), string(VoteTypePoints)).
			Comment("Discriminator for the vote method."),
		field.Int("value").
			Optional().
			Comment("Rank position (ranked) or points awarded (points-based). Optional for single_choice."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the vote was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
	}
}

// Edges of the Vote.
func (Vote) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("category", VoteCategory.Type).
			Ref("votes").Unique().Required().
			Comment("The vote category this vote belongs to."),
		edge.From("voter", User.Type).
			Ref("votes").Unique().Required().
			Comment("Keycloak user ID of the voter."),
		edge.From("submission", Submission.Type).
			Ref("votes").
			Unique().
			Comment("The submission this vote is for."),
	}
}

// Indexes of the Vote.
func (Vote) Indexes() []ent.Index {
	return []ent.Index{
		index.Edges("category", "voter", "submission").Unique(),
	}
}

// Hooks of the Vote.
func (Vote) Hooks() []ent.Hook {
	return []ent.Hook{
		ValidateVoteType,
	}
}

func (Vote) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}

// ValidateVoteType enforces that subtype-specific fields match the vote_type discriminator.
//
//nolint:gocognit // necessary complexity
func ValidateVoteType(next ent.Mutator) ent.Mutator {
	return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
		op := m.Op()
		if !op.Is(ent.OpCreate | ent.OpUpdate | ent.OpUpdateOne) {
			return next.Mutate(ctx, m)
		}
		vt, ok := m.Field("vote_type")
		if !ok {
			return next.Mutate(ctx, m)
		}
		voteType, ok := vt.(string)
		if !ok {
			return next.Mutate(ctx, m)
		}

		hasSubmission := false
		for _, e := range m.AddedEdges() {
			if e == "submission" {
				hasSubmission = true
				break
			}
		}

		switch voteType {
		case string(VoteTypeSingleChoice):
			if !hasSubmission {
				return nil, errors.New("single_choice vote must have a submission")
			}
		case string(VoteTypeRanked):
			if !hasSubmission {
				return nil, errors.New("ranked vote must have a submission")
			}
			if val, ok := m.Field("value"); ok {
				v, ok := val.(int)
				if !ok || v <= 0 {
					return nil, errors.New("ranked vote value must be a positive integer")
				}
			} else {
				return nil, errors.New("ranked vote must have a value")
			}
		case string(VoteTypePoints):
			if !hasSubmission {
				return nil, errors.New("points vote must have a submission")
			}
			if val, ok := m.Field("value"); ok {
				v, ok := val.(int)
				if !ok || v <= 0 {
					return nil, errors.New("points vote value must be a positive integer")
				}
			} else {
				return nil, errors.New("points vote must have a value")
			}
		default:
			return nil, fmt.Errorf("unknown vote_type: %s", voteType)
		}
		return next.Mutate(ctx, m)
	})
}
