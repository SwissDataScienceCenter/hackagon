package service

import (
	"context"
	"log/slog"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enthackathon "github.com/swissdatasciencecenter/hackagon/components/backend/ent/hackathon"
	entsubmission "github.com/swissdatasciencecenter/hackagon/components/backend/ent/submission"
	entuser "github.com/swissdatasciencecenter/hackagon/components/backend/ent/user"
	m "github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	storagepb "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/storage"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/storage/entities"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/storage/messages/storage_svc"
	objstore "github.com/swissdatasciencecenter/hackagon/components/backend/internal/storage"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// StorageService hands out signed, single-purpose URLs for the object store
// (docs/storage.md). No file ever passes through it: it authorizes the caller,
// decides the key, and pins the content-type and the byte count into the
// signature so an upload that breaks either is refused by the store itself.
type StorageService struct {
	storagepb.UnimplementedStorageServiceServer

	dbClient *ent.Client
	enforcer *m.Enforcer
	// store is nil when no object store is configured (the unit-test config
	// leaves storage.endpoint empty). Every RPC then answers Unavailable
	// rather than panicking, and the delete handlers skip their purge.
	store *objstore.Client
}

func NewStorageService(
	dbClient *ent.Client,
	enforcer *m.Enforcer,
	store *objstore.Client,
) *StorageService {
	//exhaustruct:ignore
	return &StorageService{dbClient: dbClient, enforcer: enforcer, store: store}
}

const (
	// uploadTTL is the window the browser has to START the upload. Short,
	// because a presigned URL is a bearer credential; long enough that a slow
	// file picker or a re-render does not invalidate it.
	uploadTTL = 15 * time.Minute
	// downloadTTL is shorter still: a read URL is minted at the moment
	// something is clicked and used immediately.
	downloadTTL = 5 * time.Minute

	mib int64 = 1 << 20

	// Prefixes. These ARE the deletion contract: everything an entity owns
	// lives under its id, which is what makes DeletePrefix complete without a
	// manifest of what belongs to whom.
	hackathonPrefix = "hackathons/"
	userPrefix      = "users/"
	teamPrefix      = "teams/"

	// objectPurgeTimeout bounds the post-commit purge. The row is already
	// gone; nobody waits minutes to be told the bucket was slow.
	objectPurgeTimeout = 20 * time.Second
)

// imageTypes is the allowlist for everything that renders in an <img>.
//
// The value is the extensions accepted from the user's filename; the FIRST is
// the canonical one and the only one that ever reaches a key.
//
// image/svg+xml is deliberately absent. Objects are served from the app's OWN
// origin at /objects (that is what makes stored paths portable), so an SVG is
// a script that runs as the application — an XSS with a stable URL. Adding it
// would need a separate, non-same-origin host to serve from.
var imageTypes = map[string][]string{
	"image/webp": {"webp"},
	"image/png":  {"png"},
	"image/jpeg": {"jpg", "jpeg"},
	"image/gif":  {"gif"},
}

// attachmentTypes is what a team may turn in: the imagery above plus the
// document formats a poster or a slide deck actually arrives as.
var attachmentTypes = func() map[string][]string {
	types := map[string][]string{
		"application/pdf": {"pdf"},
		"application/zip": {"zip"},
		"text/plain":      {"txt"},
		"text/markdown":   {"md"},
		"text/csv":        {"csv"},
	}
	for contentType, exts := range imageTypes {
		types[contentType] = exts
	}

	return types
}()

// uploadRule is everything the KIND decides. The client picks a kind and
// nothing else — not the path, not the ceiling, not the type.
type uploadRule struct {
	// public objects are world-readable by bucket policy, so their path is
	// stable and goes in the database. Private ones are read through
	// CreateDownloadUrl instead.
	public       bool
	maxBytes     int64
	contentTypes map[string][]string
}

var uploadRules = map[ents.UploadKind]uploadRule{
	ents.UploadKind_UPLOAD_KIND_HACKATHON_LOGO: {
		public: true, maxBytes: 5 * mib, contentTypes: imageTypes,
	},
	ents.UploadKind_UPLOAD_KIND_HACKATHON_MEDIA: {
		public: true, maxBytes: 15 * mib, contentTypes: imageTypes,
	},
	ents.UploadKind_UPLOAD_KIND_USER_AVATAR: {
		public: true, maxBytes: 5 * mib, contentTypes: imageTypes,
	},
	ents.UploadKind_UPLOAD_KIND_SUBMISSION_ATTACHMENT: {
		public: false, maxBytes: 50 * mib, contentTypes: attachmentTypes,
	},
}

func (s *StorageService) CreateUploadUrl(
	ctx context.Context,
	req *msgs.CreateUploadUrlRequest,
) (*msgs.CreateUploadUrlResponse, error) {
	if s.store == nil {
		return nil, status.Error(codes.Unavailable, "object storage is not configured")
	}

	rule, known := uploadRules[req.GetKind()]
	if !known {
		return nil, status.Errorf(codes.InvalidArgument, "unsupported upload kind %s", req.GetKind())
	}

	// Limits before authorization lookups: a 4 GB request should cost one
	// comparison, not a database round trip.
	ext, err := checkContentType(rule, req.GetContentType(), req.GetFilename())
	if err != nil {
		return nil, err
	}
	if req.GetSizeBytes() > rule.maxBytes {
		return nil, status.Errorf(codes.InvalidArgument,
			"file is %d bytes; the limit for this kind of upload is %d bytes",
			req.GetSizeBytes(), rule.maxBytes)
	}

	// The KEY is decided here, from ids the server has verified — never from
	// anything the client sent. req.filename reached this point only as a
	// cross-check on the content type.
	key, err := s.authorizeUpload(ctx, req.GetKind(), req.GetOwnerId(), ext)
	if err != nil {
		return nil, err
	}

	uploadURL, expiresAt := s.store.PresignPut(
		key, req.GetContentType(), req.GetSizeBytes(), uploadTTL,
	)

	publicURL := ""
	if rule.public {
		publicURL = s.store.PublicURL(key)
	}

	return &msgs.CreateUploadUrlResponse{
		UploadUrl: uploadURL,
		Key:       key,
		PublicUrl: publicURL,
		ExpiresAt: timestamppb.New(expiresAt),
	}, nil
}

// checkContentType enforces the allowlist and returns the extension the key
// will carry. The extension comes from the CONTENT TYPE, not from the filename:
// nothing a user typed is allowed to shape a key.
//
// The filename is still consulted, for one thing — if it carries an extension
// that contradicts the declared type, the person almost certainly picked the
// wrong file, and saying so now beats storing a .mov as image/png.
func checkContentType(rule uploadRule, contentType, filename string) (string, error) {
	// "image/png; charset=binary" is a legal header value; compare the type.
	normalized := strings.ToLower(strings.TrimSpace(contentType))
	if i := strings.IndexByte(normalized, ';'); i >= 0 {
		normalized = strings.TrimSpace(normalized[:i])
	}

	exts, allowed := rule.contentTypes[normalized]
	if !allowed {
		return "", status.Errorf(codes.InvalidArgument,
			"content type %q is not accepted for this kind of upload", contentType)
	}

	if strings.ContainsAny(filename, "/\\\x00") {
		return "", status.Error(codes.InvalidArgument, "filename must not contain a path")
	}
	if given := strings.ToLower(strings.TrimPrefix(path.Ext(filename), ".")); given != "" {
		match := false
		for _, ext := range exts {
			if ext == given {
				match = true

				break
			}
		}
		if !match {
			return "", status.Errorf(codes.InvalidArgument,
				"%q does not look like a %s file", filename, normalized)
		}
	}

	return exts[0], nil
}

// authorizeUpload is the whole access-control surface of the upload path: one
// rule per kind, and the key it returns is built from ids this function has
// just checked.
func (s *StorageService) authorizeUpload(
	ctx context.Context,
	kind ents.UploadKind,
	ownerID, ext string,
) (string, error) {
	id, err := uuid.Parse(ownerID)
	if err != nil {
		return "", status.Errorf(codes.InvalidArgument, "invalid owner_id: %v", err)
	}
	name := uuid.New().String() + "." + ext

	switch kind {
	// Writing an event's imagery is writing the event: same permission as
	// renaming it, because the logo is as much the event's identity.
	case ents.UploadKind_UPLOAD_KIND_HACKATHON_LOGO,
		ents.UploadKind_UPLOAD_KIND_HACKATHON_MEDIA:
		if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
			return "", err
		}
		exists, err := s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(id)).Exist(ctx)
		if err != nil {
			slog.Error("query hackathon for upload", "err", err)

			return "", status.Error(codes.Internal, "couldn't query database")
		}
		if !exists {
			return "", status.Errorf(codes.NotFound, "hackathon %s not found", id)
		}
		folder := "logo"
		if kind == ents.UploadKind_UPLOAD_KIND_HACKATHON_MEDIA {
			folder = "media"
		}

		return hackathonPrefix + id.String() + "/" + folder + "/" + name, nil

	// An avatar is the one thing here with no hackathon to scope a domain to,
	// so it authorizes on identity: you, or a global admin fixing someone's
	// profile. There is no casbin object type for users.
	case ents.UploadKind_UPLOAD_KIND_USER_AVATAR:
		sub, _, err := m.RequireUser(ctx)
		if err != nil {
			return "", err
		}
		owner, err := s.dbClient.User.Query().Where(entuser.IDEQ(id)).Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return "", status.Errorf(codes.NotFound, "user %s not found", id)
			}
			slog.Error("query user for upload", "err", err)

			return "", status.Error(codes.Internal, "couldn't query database")
		}
		if owner.KeycloakID != sub {
			admin, err := s.enforcer.IsGlobalAdmin(sub)
			if err != nil {
				slog.Error("check global admin", "err", err)

				return "", status.Error(codes.Internal, "authorization error")
			}
			if !admin {
				return "", status.Error(codes.PermissionDenied, "permission denied")
			}
		}

		return userPrefix + id.String() + "/avatar/" + name, nil

	// owner_id is the SUBMISSION; the team half of the key is looked up here,
	// so a caller cannot file an attachment under a team that is not the one
	// that owns the submission they were allowed to write.
	case ents.UploadKind_UPLOAD_KIND_SUBMISSION_ATTACHMENT:
		subm, err := s.loadSubmission(ctx, id)
		if err != nil {
			return "", err
		}
		team := subm.Edges.Team
		hackathonID := team.Edges.Project.Edges.Hackathon.ID
		if err := s.enforcer.RequirePermission(
			ctx, hackathonID.String(), m.Submission, m.Write,
			m.WithTeam(team.ID.String()),
		); err != nil {
			return "", err
		}

		return teamPrefix + team.ID.String() + "/submissions/" + subm.ID.String() + "/" + name, nil

	case ents.UploadKind_UPLOAD_KIND_UNSPECIFIED:
		fallthrough
	default:
		return "", status.Error(codes.InvalidArgument, "unsupported upload kind")
	}
}

// loadSubmission fetches a submission with the team → project → hackathon chain
// every authorization decision about it needs.
func (s *StorageService) loadSubmission(
	ctx context.Context,
	id uuid.UUID,
) (*ent.Submission, error) {
	subm, err := s.dbClient.Submission.Query().
		Where(entsubmission.IDEQ(id)).
		WithTeam(func(tq *ent.TeamQuery) {
			tq.WithProject(func(pq *ent.ProjectQuery) {
				pq.WithHackathon()
			})
		}).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, status.Errorf(codes.NotFound, "submission %s not found", id)
		}
		slog.Error("query submission for storage", "err", err)

		return nil, status.Error(codes.Internal, "couldn't query database")
	}
	if subm.Edges.Team == nil || subm.Edges.Team.Edges.Project == nil ||
		subm.Edges.Team.Edges.Project.Edges.Hackathon == nil {
		return nil, status.Error(codes.Internal, "submission team or hackathon not found")
	}

	return subm, nil
}

// CreateDownloadUrl mints a short read URL for a PRIVATE object, and only after
// casbin has approved the read — the presign carries that decision to the
// object store rather than duplicating it there.
func (s *StorageService) CreateDownloadUrl(
	ctx context.Context,
	req *msgs.CreateDownloadUrlRequest,
) (*msgs.CreateDownloadUrlResponse, error) {
	if s.store == nil {
		return nil, status.Error(codes.Unavailable, "object storage is not configured")
	}

	key := req.GetKey()
	if err := checkKeyShape(key); err != nil {
		return nil, err
	}

	// Public imagery is world-readable by bucket policy, so its stored path
	// already works. Signing one would hand out an expiring bearer credential
	// for something that needs none — refuse, and say where to look instead.
	if strings.HasPrefix(key, hackathonPrefix) || strings.HasPrefix(key, userPrefix) {
		return nil, status.Error(codes.InvalidArgument,
			"this object is public; read it at its stored path instead of signing a URL")
	}
	if !strings.HasPrefix(key, teamPrefix) {
		return nil, status.Error(codes.InvalidArgument, "unknown object key")
	}

	// teams/<team-id>/submissions/<submission-id>/<name>
	const wantSegments = 5
	parts := strings.Split(key, "/")
	if len(parts) < wantSegments || parts[2] != "submissions" {
		return nil, status.Error(codes.InvalidArgument, "unknown object key")
	}
	teamID, err := uuid.Parse(parts[1])
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "unknown object key")
	}
	submissionID, err := uuid.Parse(parts[3])
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "unknown object key")
	}

	subm, err := s.loadSubmission(ctx, submissionID)
	if err != nil {
		return nil, err
	}
	// The team in the key is checked against the submission's real team, so a
	// forged path cannot borrow another team's permissions.
	if subm.Edges.Team.ID != teamID {
		return nil, status.Error(codes.InvalidArgument, "unknown object key")
	}
	if err := s.enforcer.RequirePermission(
		ctx, subm.Edges.Team.Edges.Project.Edges.Hackathon.ID.String(),
		m.Submission, m.Read, m.WithTeam(teamID.String()),
	); err != nil {
		return nil, err
	}

	downloadURL, expiresAt := s.store.PresignGet(key, downloadTTL)

	return &msgs.CreateDownloadUrlResponse{
		DownloadUrl: downloadURL,
		ExpiresAt:   timestamppb.New(expiresAt),
	}, nil
}

// checkKeyShape rejects the traversal and smuggling shapes before anything is
// parsed. The key is signed literally, but a proxy between the browser and the
// store may normalize ".." on the way, which would resolve to an object the
// signature was never meant to cover.
func checkKeyShape(key string) error {
	if key == "" || strings.HasPrefix(key, "/") || strings.Contains(key, "//") ||
		strings.Contains(key, "..") {
		return status.Error(codes.InvalidArgument, "malformed object key")
	}
	for _, r := range key {
		if r < 0x20 || r == 0x7f {
			return status.Error(codes.InvalidArgument, "malformed object key")
		}
	}

	return nil
}

// purgeObjects deletes everything under prefix, and is the shape docs/storage.md
// asks for on both counts:
//
//   - it runs AFTER the database delete has succeeded, so a failed delete never
//     leaves rows pointing at objects that are already gone;
//   - it CANNOT fail the delete. The event or the account is gone as far as the
//     person is concerned, and no bucket timeout is going to resurrect it. A
//     failure logs the orphaned prefix loudly enough to be swept by hand.
//
// The context is detached from the caller's: the RPC may be moments from
// returning, and a cancelled purge would be indistinguishable from one that was
// never attempted.
func purgeObjects(ctx context.Context, store *objstore.Client, prefix string) {
	if store == nil {
		return
	}

	purgeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), objectPurgeTimeout)
	defer cancel()

	deleted, err := store.DeletePrefix(purgeCtx, prefix)
	if err != nil {
		slog.Error(
			"ORPHANED OBJECTS: purge failed after delete; sweep this prefix by hand",
			"prefix", prefix, "deleted_before_failure", deleted, "err", err,
		)

		return
	}
	slog.Info("purged objects", "prefix", prefix, "deleted", deleted)
}
