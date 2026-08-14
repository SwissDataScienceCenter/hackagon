package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Submission holds the schema definition for the Submission entity.
type Submission struct {
	ent.Schema
}

func (Submission) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("A versioned submission from a team for a project."),
	}
}

// Fields of the Submission.
func (Submission) Fields() []ent.Field {
	return []ent.Field{
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the submission was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
		field.String("result").
			Optional().
			Comment("Result or output of the submission (e.g. a URL)."),
		field.JSON("form", map[string]string{}).
			Optional().
			Comment(
				"Structured answers keyed by the organizer's submission form fields " +
					"(ConfigService.SetSubmissionForm). Validated on write against that schema.",
			),
		field.Enum("status").
			Values("draft", "final").
			Comment("Whether the submission is a draft or final."),
		field.Int("version").
			Positive().
			Comment("Monotonically increasing version number, unique per project+team."),
	}
}

// Edges of the Submission.
func (Submission) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("team", Team.Type).
			Ref("submissions").Unique().Required().
			Comment("The team that made this submission."),
		edge.From("project", Project.Type).
			Ref("submissions").Unique().Required().
			Comment("The project this submission is for."),
		edge.From("creator", User.Type).
			Ref("created_submissions").Unique().Required().Immutable().
			Comment("The user who created this submission."),
		edge.From("modifier", User.Type).
			Ref("modified_submissions").Unique().
			Comment("The user who last modified this submission."),
		edge.To("votes", Vote.Type).
			Comment("Votes cast on this submission."),
		edge.To("vote_results", VoteResult.Type).
			Comment("Vote results placing this submission."),
	}
}

// Indexes of the Submission.
func (Submission) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("version").Edges("project", "team").Unique(),
	}
}

func (Submission) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
