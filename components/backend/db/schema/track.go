package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Track holds the schema definition for the Track entity.
type Track struct {
	ent.Schema
}

func (Track) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("A thematic track within a hackathon that groups related projects."),
	}
}

// Fields of the Track.
func (Track) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			NotEmpty().
			Comment("Display name of the track."),
		field.Text("description").
			NotEmpty().
			Comment("Description of the track's theme and goals."),
		field.Time("created_at").Immutable().Default(time.Now).
			Comment("Timestamp when the track was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
	}
}

// Edges of the Track.
func (Track) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("hackathon", Hackathon.Type).
			Ref("tracks").
			Unique().
			Comment("The hackathon this track belongs to."),
		edge.To("projects", Project.Type).
			Comment("Projects within this track."),
	}
}

// Indexes of the Track.
func (Track) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("name").Edges("hackathon").Unique(),
	}
}

func (Track) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
