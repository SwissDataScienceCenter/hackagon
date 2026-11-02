package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Hackathon holds the schema definition for the Hackathon entity.
type Hackathon struct {
	ent.Schema
}

func (Hackathon) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("A hackathon event containing tracks, projects, phases, and participants."),
	}
}

// Fields of the Hackathon.
func (Hackathon) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			NotEmpty().
			Comment("Display name of the hackathon, unique among live hackathons."),
		field.Time("starts_at").Optional().Nillable().
			Comment("Scheduled start time; nil if not yet scheduled."),
		field.Time("ends_at").Optional().Nillable().
			Comment("Scheduled end time; nil if not yet scheduled."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the hackathon was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
		field.Time("deleted_at").
			Optional().Nillable().
			Comment("When the hackathon was deleted. It is nil while the hackathon is live."),
		field.Enum("visibility").
			Values("public", "private").
			Comment("Controls whether non-participants can discover this hackathon."),
		field.Text("description").Optional().
			Comment("Detailed description of the hackathon, supports rich text."),
		field.String("logo").
			Optional().
			Comment("URL or path to the hackathon logo image."),
	}
}

// Edges of the Hackathon.
func (Hackathon) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("tracks", Track.Type).
			Comment("Thematic tracks within this hackathon."),
		edge.To("projects", Project.Type).
			Comment("Projects submitted to this hackathon."),
		edge.From("participating_users", User.Type).
			Ref("participates_in_hackathons").
			Through("participants", Participant.Type).
			Comment("Users who are participating or waitlisted."),
		edge.To("pages", Page.Type).
			Comment("Content pages associated with this hackathon."),
		edge.To("phases", Phase.Type).
			Comment("Temporal phases (e.g. ideation, hacking, judging)."),
		edge.To("state", HackathonState.Type).
			Unique().
			Comment("Configuration state for this hackathon."),
		edge.To("vote_categories", VoteCategory.Type).
			Comment("Voting categories scoped to this hackathon."),
		edge.To("questions", Question.Type).
			Comment("Registration questions configured for this hackathon."),
		edge.To("owners", User.Type).
			Comment("Users who are owners of this hackathon (in addition to the creator)."),
		edge.From("creator", User.Type).
			Ref("created_hackathons").Unique().Required().Immutable().
			Comment("The user who created this hackathon."),
		edge.From("modifier", User.Type).
			Ref("modified_hackathons").Unique().Required().
			Comment("The user who last modified this hackathon."),
		edge.From("deleter", User.Type).
			Ref("deleted_hackathons").Unique().
			Comment("The user who deleted this hackathon. It is nil while the hackathon is live."),
	}
}

// Indexes of the Hackathon.
func (Hackathon) Indexes() []ent.Index {
	return []ent.Index{
		// Names must be unique for live hackathons only. A deleted hackathon's
		// name can be reused.
		//
		// As there was already an existing index for the name, we hardcode the
		// storage key "hackathons_name_key" to make sure Ent overwrites the
		// previous one instead of creating a new one, which would keep the old
		// index and prevent us from reusing the name of a deleted hackathon.
		index.Fields("name").
			Unique().
			Annotations(entsql.IndexWhere("deleted_at IS NULL")).
			StorageKey("hackathons_name_key"),
		index.Fields("starts_at"),
		index.Fields("ends_at"),
		index.Fields("visibility"),
	}
}

func (Hackathon) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
