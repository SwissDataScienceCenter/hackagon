package schema

import (
	"regexp"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// Slugs go straight into a URL path segment, so keep them to lowercase
// kebab-case rather than escaping surprises later.
var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// SitePage holds the schema definition for the SitePage entity.
//
// This is the platform-level counterpart to Page: About, Privacy, Terms and
// friends belong to the site itself, not to any single hackathon, so they
// cannot use Page (whose hackathon edge is Required) nor its casbin domain
// (/hackathon/<uuid>). SitePages are addressed by a stable slug so the
// frontend can route /about straight to one, and are authorized in the fixed
// "site" domain: global admins write, everyone reads the visible ones.
type SitePage struct {
	ent.Schema
}

func (SitePage) Annotations() []schema.Annotation {
	return []schema.Annotation{
		schema.Comment("A platform-level content page (about, privacy, terms), addressed by slug."),
	}
}

// Fields of the SitePage.
func (SitePage) Fields() []ent.Field {
	return []ent.Field{
		field.String("slug").
			Unique().
			NotEmpty().
			Match(slugPattern).
			Comment("URL segment identifying the page (e.g. \"about\"); lowercase kebab-case."),
		field.String("title").
			NotEmpty().
			Comment("Title of the page."),
		field.Text("content").
			Comment("Markdown content of the page. Rendered through the frontend's sanitizing pipeline."),
		field.Bool("visible").
			Default(false).
			Comment("Whether the page is published. Drafts are readable by admins only."),
		field.Int("order").
			Default(0).
			Comment("Sort order for navigation listings; lower values appear first."),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			Comment("Timestamp when the page was created."),
		field.Time("modified_at").
			Default(time.Now).UpdateDefault(time.Now).
			Comment("Timestamp of the last modification."),
	}
}

// Edges of the SitePage.
func (SitePage) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("creator", User.Type).
			Ref("created_site_pages").Unique().Required().Immutable().
			Comment("The user who created this page."),
		edge.From("modifier", User.Type).
			Ref("modified_site_pages").Unique().Required().
			Comment("The user who last modified this page."),
	}
}

// Indexes of the SitePage.
func (SitePage) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("order"),
		index.Fields("visible"),
	}
}

func (SitePage) Mixin() []ent.Mixin {
	return []ent.Mixin{
		UUIDMixin{},
	}
}
