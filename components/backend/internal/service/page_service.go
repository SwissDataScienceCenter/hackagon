package service

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entpage "github.com/swissdatasciencecenter/hackagon/components/backend/ent/page"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/page_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type PageService struct {
	hackathon.UnimplementedPageServiceServer
	dbClient *ent.Client
	enforcer *mw.Enforcer
}

func NewPageService(dbClient *ent.Client, enf *mw.Enforcer) *PageService {
	return &PageService{
		dbClient: dbClient,
		enforcer: enf,
	}
}

func (s *PageService) List(
	ctx context.Context,
	req *msgs.ListRequest,
) (*msgs.ListResponse, error) {
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Page.Read permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Page, mw.Read); err != nil {
		return nil, err
	}

	// Verify hackathon exists
	_, err = s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(hackathonID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"hackathon %s not found",
				req.GetHackathonId(),
			)
		}
		slog.Error("query hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Query pages ordered by order field with creator and modifier
	pages, err := s.dbClient.Page.Query().
		Where(entpage.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		WithCreator().
		WithModifier().
		Order(entpage.ByOrder()).
		All(ctx)
	if err != nil {
		slog.Error("query pages", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	entries := make([]*ents.Page, 0, len(pages))
	for _, p := range pages {
		entries = append(entries, pageEntryFromEnt(p, hackathonID))
		// Override creator/modifier IDs since we have them loaded
		entries[len(entries)-1].CreatorId = p.Edges.Creator.ID.String()
		entries[len(entries)-1].ModifierId = p.Edges.Modifier.ID.String()
	}

	return &msgs.ListResponse{Pages: entries}, nil
}

func (s *PageService) Get(
	ctx context.Context,
	req *msgs.GetRequest,
) (*msgs.GetResponse, error) {
	pageID, err := uuid.Parse(req.GetPageId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid page_id: %v", err)
	}

	// Get the page to find its hackathon_id
	page, err := s.dbClient.Page.Query().
		Where(entpage.IDEQ(pageID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "page %s not found", req.GetPageId())
		}
		slog.Error("query page", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := page.Edges.Hackathon.ID

	// Check Page.Read permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Page, mw.Read); err != nil {
		return nil, err
	}

	// Query page with creator and modifier
	page, err = s.dbClient.Page.Query().
		Where(entpage.IDEQ(pageID)).
		WithCreator().
		WithModifier().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "page %s not found", req.GetPageId())
		}
		slog.Error("query page", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	entry := pageEntryFromEnt(page, hackathonID)
	entry.CreatorId = page.Edges.Creator.ID.String()
	entry.ModifierId = page.Edges.Modifier.ID.String()

	return &msgs.GetResponse{Page: entry}, nil
}

func (s *PageService) Create(
	ctx context.Context,
	req *msgs.CreateRequest,
) (*msgs.CreateResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Page.Write permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Page, mw.Write); err != nil {
		return nil, err
	}

	// Verify hackathon exists
	_, err = s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(hackathonID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(
				codes.NotFound,
				"hackathon %s not found",
				req.GetHackathonId(),
			)
		}
		slog.Error("query hackathon", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Ensure user exists and get their entity ID
	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Create the page
	p, err := s.dbClient.Page.Create().
		SetHackathonID(hackathonID).
		SetTitle(req.GetTitle()).
		SetContent(req.GetContent()).
		SetVisible(req.GetVisible()).
		SetOrder(int(req.GetOrder())).
		SetCreator(user).
		SetModifier(user).
		Save(ctx)
	if err != nil {
		slog.Error("create page", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't create page in database")
	}

	return &msgs.CreateResponse{PageId: p.ID.String()}, nil
}

func (s *PageService) Edit(
	ctx context.Context,
	req *msgs.EditRequest,
) (*msgs.EditResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	pageID, err := uuid.Parse(req.GetPageId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid page_id: %v", err)
	}

	// Get the page to find its hackathon_id
	page, err := s.dbClient.Page.Query().
		Where(entpage.IDEQ(pageID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "page %s not found", req.GetPageId())
		}
		slog.Error("query page", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := page.Edges.Hackathon.ID

	// Check Page.Write permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Page, mw.Write); err != nil {
		return nil, err
	}

	// Ensure user exists and get their entity ID
	user, err := s.dbClient.User.Query().Where(entuser.KeycloakIDEQ(uid)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "user does not exist: %s", uid)
		}
		slog.Error("query user", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// Build the update query with only provided fields
	update := s.dbClient.Page.Update().
		Where(entpage.IDEQ(pageID)).
		SetModifier(user)

	if req.Title != nil {
		update = update.SetTitle(*req.Title)
	}
	if req.Content != nil {
		update = update.SetContent(*req.Content)
	}
	if req.Visible != nil {
		update = update.SetVisible(*req.Visible)
	}
	if req.Order != nil {
		update = update.SetOrder(int(*req.Order))
	}

	_, err = update.Save(ctx)
	if err != nil {
		slog.Error("update page", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't update page in database")
	}

	// Query the updated page with creator and modifier
	page, err = s.dbClient.Page.Query().
		Where(entpage.IDEQ(pageID)).
		WithCreator().
		WithModifier().
		WithHackathon().
		Only(ctx)

	entry := pageEntryFromEnt(page, hackathonID)
	entry.CreatorId = page.Edges.Creator.ID.String()
	entry.ModifierId = user.ID.String()

	return &msgs.EditResponse{}, nil
}

func (s *PageService) Delete(
	ctx context.Context,
	req *msgs.DeleteRequest,
) (*msgs.DeleteResponse, error) {
	_, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	pageID, err := uuid.Parse(req.GetPageId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid page_id: %v", err)
	}

	// Get the page to find its hackathon_id
	page, err := s.dbClient.Page.Query().
		Where(entpage.IDEQ(pageID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "page %s not found", req.GetPageId())
		}
		slog.Error("query page", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := page.Edges.Hackathon.ID

	// Check Page.Write permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Page, mw.Write); err != nil {
		return nil, err
	}

	// Delete the page
	err = s.dbClient.Page.DeleteOne(page).Exec(ctx)
	if err != nil {
		slog.Error("delete page", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't delete page from database")
	}

	return &msgs.DeleteResponse{}, nil
}
