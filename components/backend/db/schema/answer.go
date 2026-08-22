package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

// Answer holds the schema definition for a participant's answer to a registration question.
type Answer struct {
	ent.Schema
}

func (Answer) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment(
			"A participant's answer to a registration question. One answer per user per question.",
		),
	}
}

// Fields of the Answer.
func (Answer) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("question_id", uuid.UUID{}).
			Comment("The question this answer belongs to."),
		field.UUID("user_id", uuid.UUID{}).
			Comment("The user who submitted this answer."),
		field.String("value").
			Comment("The answer value. For bool questions, stored as \"true\" or \"false\"."),
		field.Enum("type").
			Values("text", "bool").
			Comment("The type of the question (for readability when reading answers)."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the answer was first submitted."),
		field.Time("updated_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last update."),
	}
}

// Edges of the Answer.
func (Answer) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("question", Question.Type).
			Ref("answers").Unique().Required().
			Field("question_id").
			Comment("The question this answer belongs to."),
		edge.From("user", User.Type).
			Ref("created_answers").Unique().Required().
			Field("user_id").
			Comment("The user who submitted this answer."),
	}
}

// Indexes of the Answer.
func (Answer) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("question_id", "user_id").Unique(),
	}
}

func (Answer) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
