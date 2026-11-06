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
//
// Usage:
//
//	h, err := track.Edges.HackathonOrErr()
//	if err != nil {
//		return nil, edgeError(err, "hackathon not found")
//	}
func edgeError(err error, notFoundMessage string) error {
	if ent.IsNotFound(err) {
		return status.Error(codes.NotFound, notFoundMessage)
	}
	slog.Error("load edge", "err", err)

	return status.Error(codes.Internal, "couldn't query database")
}
