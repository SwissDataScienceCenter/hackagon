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
			NotEmpty().Unique(),
		field.Time("start_date").Optional().Nillable(),
		field.Time("end_date").Optional().Nillable(),
		field.Time("created_at").
			Immutable().
			Default(time.Now),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now),
		field.Enum("visibility").
			Values("public", "private"),
		field.Text("description").Optional(),
		field.String("logo").
			Optional(),
	}
}

// Edges of the Hackathon.
func (Hackathon) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("tracks", Track.Type),
		edge.To("projects", Project.Type),
		edge.From("participating_users", User.Type).Ref("participates_in_hackathons").Through("participants", Participant.Type),
		edge.To("pages", Page.Type),
		edge.To("phases", Phase.Type),
		edge.From("creator", User.Type).
			Ref("created_hackathons").Unique().Required().Immutable(),
		edge.From("modifier", User.Type).
			Ref("modified_hackathons").Unique(),
	}
}

// Indexes of the Hackathon.
func (Hackathon) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("name"),
		index.Fields("start_date"),
		index.Fields("end_date"),
		index.Fields("visibility"),
	}
}
