package service

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	enttrack "github.com/swissdatasciencecenter/hackagon/components/backend/ent/track"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	mw "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/track_svc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type TrackService struct {
	hackathon.UnimplementedTrackServiceServer
	dbClient *ent.Client
	enforcer *mw.Enforcer
}

func NewTrackService(dbClient *ent.Client, enf *mw.Enforcer) *TrackService {
	return &TrackService{
		UnimplementedTrackServiceServer: hackathon.UnimplementedTrackServiceServer{},
		dbClient:                        dbClient,
		enforcer:                        enf,
	}
}

func (s *TrackService) List(
	ctx context.Context,
	req *msgs.ListRequest,
) (*msgs.ListResponse, error) {
	hackathonID, err := uuid.Parse(req.GetHackathonId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid hackathon_id: %v", err)
	}

	// Check Track.Read permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Track, mw.Read); err != nil {
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

	// Query tracks ordered by name
	tracks, err := s.dbClient.Track.Query().
		Where(enttrack.HasHackathonWith(enthackathon.IDEQ(hackathonID))).
		Order(enttrack.ByName()).
		All(ctx)
	if err != nil {
		slog.Error("query tracks", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	entries := make([]*ents.Track, 0, len(tracks))
	for _, t := range tracks {
		entries = append(entries, trackEntryFromEnt(t, hackathonID))
	}

	return &msgs.ListResponse{Tracks: entries}, nil
}

func (s *TrackService) Get(
	ctx context.Context,
	req *msgs.GetRequest,
) (*msgs.GetResponse, error) {
	trackID, err := uuid.Parse(req.GetTrackId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid track_id: %v", err)
	}

	// Get the track to find its hackathon_id
	track, err := s.dbClient.Track.Query().
		Where(enttrack.IDEQ(trackID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "track %s not found", req.GetTrackId())
		}
		slog.Error("query track", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := track.Edges.Hackathon.ID

	// Check Track.Read permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Track, mw.Read); err != nil {
		return nil, err
	}

	return &msgs.GetResponse{Track: trackEntryFromEnt(track, hackathonID)}, nil
}

func (s *TrackService) Create(
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

	// Check Track.Write permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Track, mw.Write); err != nil {
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

	// Create the track
	t, err := s.dbClient.Track.Create().
		SetHackathonID(hackathonID).
		SetName(req.GetName()).
		SetDescription(req.GetDescription()).
		SetCreator(user).
		SetModifier(user).
		Save(ctx)
	if err != nil {
		slog.Error("create track", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't create track in database")
	}

	return &msgs.CreateResponse{TrackId: t.ID.String()}, nil
}

func (s *TrackService) Edit(
	ctx context.Context,
	req *msgs.EditRequest,
) (*msgs.EditResponse, error) {
	uid, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	trackID, err := uuid.Parse(req.GetTrackId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid track_id: %v", err)
	}

	// Get the track to find its hackathon_id
	track, err := s.dbClient.Track.Query().
		Where(enttrack.IDEQ(trackID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "track %s not found", req.GetTrackId())
		}
		slog.Error("query track", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := track.Edges.Hackathon.ID

	// Check Track.Write permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Track, mw.Write); err != nil {
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
	update := s.dbClient.Track.Update().
		Where(enttrack.IDEQ(trackID)).
		SetModifier(user)

	if req.Name != nil {
		update = update.SetName(req.GetName())
	}
	if req.Description != nil {
		update = update.SetDescription(req.GetDescription())
	}

	_, err = update.Save(ctx)
	if err != nil {
		slog.Error("update track", "err", err)

		return nil, status.Errorf(codes.Internal, "couldn't update track in database")
	}

	// Fetch the updated track with hackathon
	updated, err := s.dbClient.Track.Query().
		Where(enttrack.IDEQ(trackID)).
		Only(ctx)
	if err != nil {
		slog.Error("query updated track", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query updated track")
	}

	entry := trackEntryFromEnt(updated, hackathonID)

	return &msgs.EditResponse{Track: entry}, nil
}

func (s *TrackService) Delete(
	ctx context.Context,
	req *msgs.DeleteRequest,
) (*msgs.DeleteResponse, error) {
	_, _, err := mw.RequireSubject(ctx)
	if err != nil {
		return nil, err
	}

	trackID, err := uuid.Parse(req.GetTrackId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid track_id: %v", err)
	}

	// Get the track to find its hackathon_id
	track, err := s.dbClient.Track.Query().
		Where(enttrack.IDEQ(trackID)).
		WithHackathon().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "track %s not found", req.GetTrackId())
		}
		slog.Error("query track", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}

	hackathonID := track.Edges.Hackathon.ID

	// Check Track.Write permission
	if err := s.enforcer.RequirePermission(ctx, hackathonID.String(), mw.Track, mw.Write); err != nil {
		return nil, err
	}

	// Delete the track
	if err := s.dbClient.Track.DeleteOne(track).Exec(ctx); err != nil {
		slog.Error("delete track", "err", err)
		return nil, status.Errorf(codes.Internal, "couldn't delete track from database")
	}

	return &msgs.DeleteResponse{}, nil
}
