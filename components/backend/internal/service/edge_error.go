package service

import (
	"log/slog"

	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// edgeError turns the error from an Edges.XOrErr() call into a gRPC error.
// Only call it when that error is not nil.
//
// NotFound means the edge was loaded but is empty. For a hackathon, this
// means it was deleted. The caller gets notFoundMessage.
//
// NotLoaded means the query forgot WithX(). That is a bug in the handler,
// so the caller gets Internal.
func edgeError(err error, notFoundMessage string) error {
	if ent.IsNotFound(err) {
		return status.Error(codes.NotFound, notFoundMessage)
	}
	slog.Error("load edge", "err", err)

	return status.Error(codes.Internal, "couldn't query database")
}

// edgeHackathon takes the result of an Edges.HackathonOrErr() call and returns
// the hackathon, or a gRPC error if it is missing (see edgeError). The returned
// hackathon is live, so pass it to Enforcer.RequirePermissionOn.
//
// Usage:
//
//	h, err := edgeHackathon(track.Edges.HackathonOrErr())
//	if err != nil {
//		return nil, err
//	}
func edgeHackathon(h *ent.Hackathon, err error) (*ent.Hackathon, error) {
	if err != nil {
		return nil, edgeError(err, "hackathon not found")
	}

	return h, nil
}

// teamHackathon returns the hackathon of a team loaded with
// WithProject(), or a gRPC error if something is missing.
func teamHackathon(t *ent.Team) (*ent.Hackathon, error) {
	if t.Edges.Project == nil {
		return nil, status.Error(codes.Internal, "team project not found")
	}

	return edgeHackathon(t.Edges.Project.Edges.HackathonOrErr())
}
