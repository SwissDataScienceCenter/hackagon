package service

import (
	"context"
	"log/slog"

	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entsitepage "github.com/swissdatasciencecenter/hackagon/components/backend/ent/sitepage"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	site "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/site"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/site/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/site/messages/site_page_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// SitePageService serves the platform's own content pages (about, privacy,
// terms). They belong to the site rather than to a hackathon, so there is no
// casbin domain to scope them to: published pages are world-readable — a
// visitor reaches them from the footer before ever logging in — and every
// mutation requires the global Admin role.
type SitePageService struct {
	site.UnimplementedSitePageServiceServer

	dbClient *ent.Client
	enforcer *m.Enforcer
}

func NewSitePageService(dbClient *ent.Client, enforcer *m.Enforcer) *SitePageService {
	//exhaustruct:ignore
	return &SitePageService{dbClient: dbClient, enforcer: enforcer}
}

// callerIsAdmin reports admin standing without failing the request — reads use
// it to decide whether drafts are visible.
func (s *SitePageService) callerIsAdmin(ctx context.Context) bool {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil || uid == m.AnonSubject {
		return false
	}
	ok, err := s.enforcer.IsGlobalAdmin(uid)

	return err == nil && ok
}

func (s *SitePageService) List(
	ctx context.Context,
	req *msgs.ListRequest,
) (*msgs.ListResponse, error) {
	admin := s.callerIsAdmin(ctx)
	if req.GetIncludeHidden() && !admin {
		return nil, status.Error(codes.PermissionDenied, "only admins may list unpublished pages")
	}

	q := s.dbClient.SitePage.Query().
		WithCreator().
		WithModifier().
		Order(ent.Asc(entsitepage.FieldOrder))
	// Drafts stay invisible unless an admin explicitly asks for them.
	if !req.GetIncludeHidden() {
		q = q.Where(entsitepage.VisibleEQ(true))
	}

	pages, err := q.All(ctx)
	if err != nil {
		slog.Error("list site pages", "err", err)

		return nil, status.Error(codes.Internal, "couldn't list site pages")
	}

	entries := make([]*ents.SitePage, 0, len(pages))
	for _, p := range pages {
		entries = append(entries, sitePageFromEnt(p))
	}

	return &msgs.ListResponse{SitePages: entries}, nil
}

func (s *SitePageService) Get(
	ctx context.Context,
	req *msgs.GetRequest,
) (*msgs.GetResponse, error) {
	p, err := s.dbClient.SitePage.Query().
		Where(entsitepage.SlugEQ(req.GetSlug())).
		WithCreator().
		WithModifier().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "page %q not found", req.GetSlug())
		}
		slog.Error("get site page", "err", err)

		return nil, status.Error(codes.Internal, "couldn't get site page")
	}

	// An unpublished page is indistinguishable from a missing one for
	// non-admins: revealing the draft's existence leaks the roadmap.
	if !p.Visible && !s.callerIsAdmin(ctx) {
		return nil, status.Errorf(codes.NotFound, "page %q not found", req.GetSlug())
	}

	return &msgs.GetResponse{SitePage: sitePageFromEnt(p)}, nil
}

func (s *SitePageService) Create(
	ctx context.Context,
	req *msgs.CreateRequest,
) (*msgs.CreateResponse, error) {
	if err := s.enforcer.RequireGlobalAdmin(ctx); err != nil {
		return nil, err
	}
	u, err := s.actingUser(ctx)
	if err != nil {
		return nil, err
	}

	create := s.dbClient.SitePage.Create().
		SetSlug(req.GetSlug()).
		SetTitle(req.GetTitle()).
		SetContent(req.GetContent()).
		SetCreator(u).
		SetModifier(u)
	if req.Visible != nil {
		create = create.SetVisible(req.GetVisible())
	}
	if req.Order != nil {
		create = create.SetOrder(int(req.GetOrder()))
	}

	p, err := create.Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			return nil, status.Errorf(
				codes.AlreadyExists, "a page with slug %q already exists", req.GetSlug(),
			)
		}
		if ent.IsValidationError(err) {
			return nil, status.Errorf(codes.InvalidArgument, "invalid site page: %v", err)
		}
		slog.Error("create site page", "err", err)

		return nil, status.Error(codes.Internal, "couldn't create site page")
	}

	return &msgs.CreateResponse{Id: p.ID.String()}, nil
}

func (s *SitePageService) Edit(
	ctx context.Context,
	req *msgs.EditRequest,
) (*msgs.EditResponse, error) {
	if err := s.enforcer.RequireGlobalAdmin(ctx); err != nil {
		return nil, err
	}
	u, err := s.actingUser(ctx)
	if err != nil {
		return nil, err
	}

	p, err := s.dbClient.SitePage.Query().
		Where(entsitepage.SlugEQ(req.GetSlug())).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "page %q not found", req.GetSlug())
		}
		slog.Error("get site page for edit", "err", err)

		return nil, status.Error(codes.Internal, "couldn't get site page")
	}

	// Optional fields: nil means unchanged, so an explicit "" clears.
	update := p.Update().SetModifier(u)
	if req.NewSlug != nil {
		update = update.SetSlug(req.GetNewSlug())
	}
	if req.Title != nil {
		update = update.SetTitle(req.GetTitle())
	}
	if req.Content != nil {
		update = update.SetContent(req.GetContent())
	}
	if req.Visible != nil {
		update = update.SetVisible(req.GetVisible())
	}
	if req.Order != nil {
		update = update.SetOrder(int(req.GetOrder()))
	}

	if _, err := update.Save(ctx); err != nil {
		if ent.IsConstraintError(err) {
			return nil, status.Errorf(
				codes.AlreadyExists, "a page with slug %q already exists", req.GetNewSlug(),
			)
		}
		if ent.IsValidationError(err) {
			return nil, status.Errorf(codes.InvalidArgument, "invalid site page: %v", err)
		}
		slog.Error("edit site page", "err", err)

		return nil, status.Error(codes.Internal, "couldn't edit site page")
	}

	// Re-query with edges — Save() doesn't return them.
	updated, err := s.dbClient.SitePage.Query().
		Where(entsitepage.IDEQ(p.ID)).
		WithCreator().
		WithModifier().
		Only(ctx)
	if err != nil {
		slog.Error("reload site page after edit", "err", err)

		return nil, status.Error(codes.Internal, "couldn't reload site page")
	}

	return &msgs.EditResponse{SitePage: sitePageFromEnt(updated)}, nil
}

func (s *SitePageService) Delete(
	ctx context.Context,
	req *msgs.DeleteRequest,
) (*msgs.DeleteResponse, error) {
	if err := s.enforcer.RequireGlobalAdmin(ctx); err != nil {
		return nil, err
	}

	deleted, err := s.dbClient.SitePage.Delete().
		Where(entsitepage.SlugEQ(req.GetSlug())).
		Exec(ctx)
	if err != nil {
		slog.Error("delete site page", "err", err)

		return nil, status.Error(codes.Internal, "couldn't delete site page")
	}
	if deleted == 0 {
		return nil, status.Errorf(codes.NotFound, "page %q not found", req.GetSlug())
	}

	return &msgs.DeleteResponse{}, nil
}

// actingUser resolves the caller's DB row for the creator/modifier edges.
func (s *SitePageService) actingUser(ctx context.Context) (*ent.User, error) {
	uid, _, err := m.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}
	u, err := s.dbClient.User.Query().
		Where(entuser.KeycloakIDEQ(uid)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Error(codes.NotFound, "acting user does not exist")
		}
		slog.Error("get acting user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't resolve acting user")
	}

	return u, nil
}

func sitePageFromEnt(p *ent.SitePage) *ents.SitePage {
	//exhaustruct:ignore
	entry := &ents.SitePage{
		Id:      p.ID.String(),
		Slug:    p.Slug,
		Title:   p.Title,
		Content: p.Content,
		Visible: p.Visible,
		//nolint:gosec // G115: a site page's display order, a handful of platform pages
		Order:      int32(p.Order),
		CreatedAt:  timestamppb.New(p.CreatedAt),
		ModifiedAt: timestamppb.New(p.ModifiedAt),
	}
	if p.Edges.Creator != nil {
		entry.CreatorId = p.Edges.Creator.ID.String()
	}
	if p.Edges.Modifier != nil {
		entry.ModifierId = p.Edges.Modifier.ID.String()
	}

	return entry
}
