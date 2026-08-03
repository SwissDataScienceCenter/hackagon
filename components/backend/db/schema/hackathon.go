package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
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
			NotEmpty().Unique().
			Comment("Display name of the hackathon, must be unique."),
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
		field.Enum("visibility").
			Values("public", "private").
			Comment("Controls whether non-participants can discover this hackathon."),
		field.Text("description").Optional().
			Comment("Detailed description of the hackathon, supports rich text."),
		field.String("logo").
			Optional().
			Comment("URL or path to the hackathon logo image."),
		field.UUID("current_phase_id", uuid.UUID{}).Optional().Nillable().
			Comment(
				"The phase an organizer has declared current. Nil means fall back to " +
					"deriving it from phase dates, which is right before the event but " +
					"wrong during one, where the schedule always slips.",
			),
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
		edge.To("capabilities", Capability.Type).
			Comment("Which member-facing actions are available on this hackathon."),
		// Inverse side so the foreign key lands on `hackathons`, letting
		// current_phase_id be read without joining the phases table.
		edge.From("current_phase", Phase.Type).
			Ref("current_of").Unique().
			Field("current_phase_id").
			Annotations(entsql.OnDelete(entsql.SetNull)).
			Comment("Set by AdvancePhase; SET NULL so deleting a phase does not orphan it."),
		edge.To("vote_categories", VoteCategory.Type).
			Comment("Voting categories scoped to this hackathon."),
		edge.To("settings", HackathonSettings.Type).
			Unique().
			Comment("Configuration settings for this hackathon."),
		edge.From("creator", User.Type).
			Ref("created_hackathons").Unique().Required().Immutable().
			Comment("The user who created this hackathon."),
		edge.From("modifier", User.Type).
			Ref("modified_hackathons").Unique().Required().
			Comment("The user who last modified this hackathon."),
	}
}

// Indexes of the Hackathon.
func (Hackathon) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("name"),
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
