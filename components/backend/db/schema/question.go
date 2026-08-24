package schema

import (
	"regexp"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

// Question holds the schema definition for the registration question entity.
type Question struct {
	ent.Schema
}

func (Question) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("A registration question configured by a hackathon owner."),
	}
}

// Fields of the Question.
func (Question) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("hackathon_id", uuid.UUID{}).
			Comment("The hackathon this question belongs to."),
		field.String("key").
			Match(regexp.MustCompile(`^[a-z][a-z0-9_]*$`)).
			Comment("Unique identifier for the question within the hackathon."),
		field.String("label").
			Comment("Display label for the question."),
		field.Enum("data_type").
			Values("text", "bool", "enum").
			Comment("The type of answer expected from participants."),
		field.Bool("mandatory").
			Default(false).
			Comment("Whether the participant must answer this question to join."),
		field.Int("order").
			Default(0).
			Comment("Display order; lower values appear first."),
		field.JSON("options", []string{}).
			Comment("Allowed values for enum-type questions."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the question was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
	}
}

// Edges of the Question.
func (Question) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("questions").Unique().Required().
			Field("hackathon_id").
			Comment("The hackathon this question belongs to."),
		edge.From("creator", User.Type).
			Ref("created_questions").Unique().Required().Immutable().
			Comment("The user who created the question."),
		edge.From("modifier", User.Type).
			Ref("modified_questions").Unique().Required().
			Comment("The user who last modified the question."),
		edge.To("answers", Answer.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)).
			Comment("Answers submitted by participants for this question."),
	}
}

// Indexes of the Question.
func (Question) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("key", "hackathon_id").Unique(),
		index.Fields("order"),
	}
}

func (Question) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
