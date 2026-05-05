package service

import (
	"context"
	"log/slog"
	"slices"

	"entgo.io/ent/dialect/sql"
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
		UnimplementedPageServiceServer: hackathon.UnimplementedPageServiceServer{},
		dbClient:                       dbClient,
		enforcer:                       enf,
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
	pageQuery := s.dbClient.Page.Query().
		Where(entpage.HasHackathonWith(enthackathon.IDEQ(hackathonID)))
	if err = s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Page, mw.Write); err != nil {
		// user can't write pages, so we don't return hidden pages
		pageQuery = pageQuery.Where(entpage.VisibleEQ(true))
	}
	pages, err := pageQuery.
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
		WithCreator().
		WithModifier().
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

	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Page, mw.Read); err != nil {
		return nil, err
	}
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Page, mw.Write); err != nil &&
		!page.Visible {
		// page is not visible and user does not have write permissions
		return nil, err
	}

	entry := pageEntryFromEnt(page, hackathonID)

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

	// Determine the next order (max(order) + 1 for this hackathon)
	maxOrder, err := s.dbClient.Page.Query().
		Where(entpage.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		Order(entpage.ByOrder(sql.OrderDesc())).
		First(ctx)
	if err != nil && !ent.IsNotFound(err) {
		slog.Error("query max order", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	newOrder := 0
	if maxOrder != nil {
		newOrder = maxOrder.Order + 1
	}

	// Create the page
	p, err := s.dbClient.Page.Create().
		SetHackathonID(hackathonID).
		SetTitle(req.GetTitle()).
		SetContent(req.GetContent()).
		SetVisible(req.GetVisible()).
		SetOrder(newOrder).
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
		update = update.SetTitle(req.GetTitle())
	}
	if req.Content != nil {
		update = update.SetContent(req.GetContent())
	}
	if req.Visible != nil {
		update = update.SetVisible(req.GetVisible())
	}

	_, err = update.Save(ctx)
	if err != nil {
		slog.Error("update page", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't update page in database")
	}

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

	// Start transaction
	txn, err := s.dbClient.Tx(ctx)
	if err != nil {
		slog.Error("start transaction", "err", err)
		return nil, status.Error(codes.Internal, "couldn't start transaction")
	}

	// Delete the page
	if err := txn.Page.DeleteOne(page).Exec(ctx); err != nil {
		if rbErr := txn.Rollback(); rbErr != nil {
			slog.Error("rollback transaction after delete failure", "err", err, "rollback", rbErr)
		}
		slog.Error("delete page", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't delete page from database")
	}

	// Get all remaining pages in the hackathon
	pages, err := txn.Page.Query().
		Where(entpage.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		Order(entpage.ByOrder()).
		All(ctx)
	if err != nil {
		if rbErr := txn.Rollback(); rbErr != nil {
			slog.Error("rollback transaction after query failure", "err", err, "rollback", rbErr)
		}
		slog.Error("query remaining pages", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query remaining pages")
	}

	// Renumber remaining pages with sequential order values
	for i, p := range pages {
		_, err := txn.Page.Update().
			Where(entpage.IDEQ(p.ID)).
			SetOrder(i).
			Save(ctx)
		if err != nil {
			if rbErr := txn.Rollback(); rbErr != nil {
				slog.Error(
					"rollback transaction after update failure",
					"err",
					err,
					"rollback",
					rbErr,
				)
			}
			slog.Error("update page order", "err", err)
			return nil, status.Error(codes.Internal, "couldn't renumber pages")
		}
	}

	if err := txn.Commit(); err != nil {
		slog.Error("commit transaction", "err", err)
		return nil, status.Error(codes.Internal, "couldn't commit transaction")
	}

	return &msgs.DeleteResponse{}, nil
}

func (s *PageService) MoveUp(
	ctx context.Context,
	req *msgs.MoveUpRequest,
) (*msgs.MoveUpResponse, error) {
	_, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	pageID, err := uuid.Parse(req.GetPageId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid page_id: %v", err)
	}

	increment := int32(1)
	if req.Increment != nil {
		increment = req.GetIncrement()
	}

	newOrder, err := s.movePages(ctx, pageID, -int(increment))
	if err != nil {
		return nil, err
	}

	return &msgs.MoveUpResponse{
		PageId: pageID.String(),
		Order:  newOrder,
	}, nil
}

func (s *PageService) MoveDown(
	ctx context.Context,
	req *msgs.MoveDownRequest,
) (*msgs.MoveDownResponse, error) {
	_, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	pageID, err := uuid.Parse(req.GetPageId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid page_id: %v", err)
	}

	increment := int32(1)
	if req.Increment != nil {
		increment = req.GetIncrement()
	}

	newOrder, err := s.movePages(ctx, pageID, int(increment))
	if err != nil {
		return nil, err
	}

	return &msgs.MoveDownResponse{
		PageId: pageID.String(),
		Order:  newOrder,
	}, nil
}

// movePages handles moving a page up or down by reordering all pages in the hackathon.
// increment: negative to move up, positive to move down
func (s *PageService) movePages(
	ctx context.Context,
	pageID uuid.UUID,
	increment int,
) (int32, error) {
	// Get the page to find its hackathon_id
	page, err := s.dbClient.Page.Query().
		Where(entpage.IDEQ(pageID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return 0, status.Errorf(codes.NotFound, "page %s not found", pageID)
		}
		slog.Error("query page", "err", err)
		return 0, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := page.Edges.Hackathon.ID

	// Check Page.Write permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Page, mw.Write); err != nil {
		return 0, err
	}

	// Get all pages in the hackathon ordered
	pages, err := s.dbClient.Page.Query().
		Where(entpage.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		Order(entpage.ByOrder()).
		All(ctx)
	if err != nil {
		slog.Error("query pages", "err", err)
		return 0, status.Error(codes.Internal, "couldn't query database")
	}

	// Find current position
	currentPos := -1
	for i, p := range pages {
		if p.ID == pageID {
			currentPos = i
			break
		}
	}

	if currentPos == -1 {
		return 0, status.Errorf(codes.NotFound, "page not found in hackathon pages")
	}

	// Calculate new position with clamping
	newPos := min(max(currentPos+increment, 0), len(pages)-1)

	// No move needed
	if newPos == currentPos {
		//nolint:gosec // there will never be enough pages for this to overflow
		return int32(
			page.Order,
		), nil
	}

	// Remove page from current position
	pages = append(pages[:currentPos], pages[currentPos+1:]...)

	// Insert page at new position
	pages = append(pages[:newPos], append([]*ent.Page{page}, pages[newPos:]...)...)

	// Assign new sequential order values starting from 0 and update all pages
	txn, err := s.dbClient.Tx(ctx)
	if err != nil {
		slog.Error("start transaction", "err", err)
		return 0, status.Error(codes.Internal, "couldn't start transaction")
	}

	for i, p := range pages {
		newOrder := i
		_, err := txn.Page.Update().
			Where(entpage.IDEQ(p.ID)).
			SetOrder(newOrder).
			Save(ctx)
		if err != nil {
			if rbErr := txn.Rollback(); rbErr != nil {
				slog.Error(
					"rollback transaction after update failure",
					"err",
					err,
					"rollback",
					rbErr,
				)
			}
			slog.Error("update page order", "err", err)
			return 0, status.Error(codes.Internal, "couldn't update page order")
		}
	}

	if err := txn.Commit(); err != nil {
		slog.Error("commit transaction", "err", err)
		return 0, status.Error(codes.Internal, "couldn't commit transaction")
	}

	//nolint:gosec // there will never be enough pages for this to overflow
	return int32(
		newPos,
	), nil
}

func (s *PageService) SetOrder(
	ctx context.Context,
	req *msgs.SetOrderRequest,
) (*msgs.SetOrderResponse, error) {
	_, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	pageIDs := req.GetPageIds()
	if len(pageIDs) == 0 {
		return nil, status.Errorf(codes.InvalidArgument, "page_ids list cannot be empty")
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

	// Get all pages in the hackathon
	pages, err := s.dbClient.Page.Query().
		Where(entpage.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		All(ctx)
	if err != nil {
		slog.Error("query pages", "err", err)
		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	// check that all pages were specified
	if len(pages) != len(pageIDs) {
		return nil, status.Errorf(
			codes.InvalidArgument,
			"SetOrder requires all pages to be passed for reordering, got %d, expected %d",
			len(pageIDs),
			len(pages))
	}

	for _, page := range pages {
		if !slices.Contains(pageIDs, page.ID.String()) {
			return nil, status.Error(
				codes.InvalidArgument,
				"SetOrder requires all pages to be passed for reordering2",
			)
		}
	}

	// Build a map of page ID to page entity
	pageMap := make(map[uuid.UUID]*ent.Page, len(pages))
	for _, p := range pages {
		pageMap[p.ID] = p
	}

	// Start transaction
	txn, err := s.dbClient.Tx(ctx)
	if err != nil {
		slog.Error("start transaction", "err", err)
		return nil, status.Error(codes.Internal, "couldn't start transaction")
	}

	// Update order for each page in the list
	for i, pageIDStr := range pageIDs {
		pageID, err := uuid.Parse(pageIDStr)
		if err != nil {
			if rbErr := txn.Rollback(); rbErr != nil {
				slog.Error(
					"rollback transaction after parse failure",
					"err",
					err,
					"rollback",
					rbErr,
				)
			}
			return nil, status.Errorf(
				codes.InvalidArgument,
				"invalid page_id %s: %v",
				pageIDStr,
				err,
			)
		}

		_, ok := pageMap[pageID]
		if !ok {
			if rbErr := txn.Rollback(); rbErr != nil {
				slog.Error(
					"rollback transaction after validation failure",
					"err",
					err,
					"rollback",
					rbErr,
				)
			}
			return nil, status.Errorf(codes.NotFound, "page %s not found in hackathon", pageIDStr)
		}

		_, err = txn.Page.Update().
			Where(entpage.IDEQ(pageID)).
			SetOrder(i).
			Save(ctx)
		if err != nil {
			if rbErr := txn.Rollback(); rbErr != nil {
				slog.Error(
					"rollback transaction after update failure",
					"err",
					err,
					"rollback",
					rbErr,
				)
			}
			slog.Error("update page order", "err", err)
			return nil, status.Error(codes.Internal, "couldn't update page order")
		}
	}

	if err := txn.Commit(); err != nil {
		slog.Error("commit transaction", "err", err)
		return nil, status.Error(codes.Internal, "couldn't commit transaction")
	}

	return &msgs.SetOrderResponse{
		PageIds: pageIDs,
	}, nil
}
