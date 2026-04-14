package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Hackathon holds the schema definition for the Hackathon entity.
type Hackathon struct {
	ent.Schema
}

// Fields of the Hackathon.
func (Hackathon) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			NotEmpty(),
		field.Time("start_date"),
		field.Time("end_date"),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.Time("modified_at").
			Default(time.Now),
		field.Enum("visibility").
			Values("public", "private"),
		field.Text("description"),
		field.String("logo").
			Optional(),
		field.String("created_by").
			Immutable().
			NotEmpty(),
		field.String("modified_by").
			NotEmpty(),
	}
}

// Edges of the Hackathon.
func (Hackathon) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("tracks", Track.Type),
		edge.To("projects", Project.Type),
		edge.To("participants", Participant.Type),
	}
}

// Indexes of the Hackathon.
func (Hackathon) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("name"),
		index.Fields("start_date"),
		index.Fields("end_date"),
		index.Fields("visibility"),
		index.Fields("created_by"),
		index.Fields("modified_by"),
	}
}
