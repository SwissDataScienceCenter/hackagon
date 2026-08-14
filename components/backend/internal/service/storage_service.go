package service

import (
	"context"
	"log/slog"
	"path"
	"sort"
	"strconv"
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
	// sitePrefix is the one prefix that is NOT an owner id, because platform
	// pages have no owning entity — see authorizeUpload's SITE_MEDIA branch and
	// docs/storage.md. Nothing purges it for the same reason.
	sitePrefix = "site/"

	// objectPurgeTimeout bounds the post-commit purge. The row is already
	// gone; nobody waits minutes to be told the bucket was slow.
	objectPurgeTimeout = 20 * time.Second

	// How big a listing may be. The page size is a rendering preference, so an
	// over-large ask is clamped rather than refused.
	listDefaultPageSize = 60
	listMaxPageSize     = 200
	// listScanCap is how many KEYS one ListObjects request will read out of
	// the store, across every prefix in the scope.
	//
	// It exists because the answer is ordered newest-first and S3 orders
	// lexicographically by key — and every key here ends in a v4 uuid, so the
	// store's order is noise. Sorting by date means holding the candidates, and
	// holding candidates means capping how many. Reaching the cap is reported
	// (`truncated`) rather than hidden: a gallery that silently stops is how
	// someone concludes their upload failed.
	listScanCap = 2000
	// listObjectsTimeout bounds the whole scan. Up to listScanCap/1000 round
	// trips to the store, and a person is waiting for the grid to appear.
	listObjectsTimeout = 15 * time.Second

	// Per-kind byte ceilings for uploadRules below, in MiB.
	logoMaxMB       = 5
	mediaMaxMB      = 15
	avatarMaxMB     = 5
	attachmentMaxMB = 50
	siteMediaMaxMB  = 15
)

// listableExts is every extension the image allowlist accepts, as a set.
//
// Derived from imageTypes rather than restated, so a new image type cannot be
// accepted by the uploader and then be invisible in the picker that is supposed
// to offer it back.
//
//nolint:gochecknoglobals // derived lookup table, not mutable shared state
var listableExts = func() map[string]bool {
	exts := make(map[string]bool)
	for _, list := range imageTypes {
		for _, ext := range list {
			exts[ext] = true
		}
	}

	return exts
}()

// imageTypes is the allowlist for everything that renders in an <img>.
//
// The value is the extensions accepted from the user's filename; the FIRST is
// the canonical one and the only one that ever reaches a key.
//
// image/svg+xml is deliberately absent. Objects are served from the app's OWN
// origin at /objects (that is what makes stored paths portable), so an SVG is
// a script that runs as the application — an XSS with a stable URL. Adding it
// would need a separate, non-same-origin host to serve from.
//
//nolint:gochecknoglobals // fixed allowlist, not mutable shared state
var imageTypes = map[string][]string{
	"image/webp": {"webp"},
	"image/png":  {"png"},
	"image/jpeg": {"jpg", "jpeg"},
	"image/gif":  {"gif"},
}

// attachmentTypes is what a team may turn in: the imagery above plus the
// document formats a poster or a slide deck actually arrives as.
//
//nolint:gochecknoglobals // derived allowlist, not mutable shared state
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

// UNSPECIFIED is deliberately absent: it is not a valid upload kind, and the
// comma-ok lookup at its call site already answers InvalidArgument for it
// exactly like any other unmapped kind.
//
//nolint:exhaustive,gochecknoglobals // see comment above; fixed per-kind ceiling table, not mutable shared state
var uploadRules = map[ents.UploadKind]uploadRule{
	ents.UploadKind_UPLOAD_KIND_HACKATHON_LOGO: {
		public: true, maxBytes: logoMaxMB * mib, contentTypes: imageTypes,
	},
	ents.UploadKind_UPLOAD_KIND_HACKATHON_MEDIA: {
		public: true, maxBytes: mediaMaxMB * mib, contentTypes: imageTypes,
	},
	ents.UploadKind_UPLOAD_KIND_USER_AVATAR: {
		public: true, maxBytes: avatarMaxMB * mib, contentTypes: imageTypes,
	},
	ents.UploadKind_UPLOAD_KIND_SUBMISSION_ATTACHMENT: {
		public: false, maxBytes: attachmentMaxMB * mib, contentTypes: attachmentTypes,
	},
	// The same job as HACKATHON_MEDIA — a picture dropped into prose from a
	// markdown editor — so deliberately the same ceiling and the same allowlist.
	// A platform page is world-readable, so its imagery has to be too.
	ents.UploadKind_UPLOAD_KIND_SITE_MEDIA: {
		public: true, maxBytes: siteMediaMaxMB * mib, contentTypes: imageTypes,
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
		return nil, status.Errorf(
			codes.InvalidArgument,
			"unsupported upload kind %s",
			req.GetKind(),
		)
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
	name := uuid.New().String() + "." + ext

	switch kind {
	// A platform page (about, privacy, terms) belongs to no event and no person,
	// so this is the one kind that reads NO owner id: there is nothing to name,
	// no hackathon domain to scope a casbin check to, and no owner segment in the
	// key. It authorizes exactly as every SitePageService mutation does — the
	// GLOBAL Admin role. `owner_id` reaches neither the key nor the decision, so
	// whatever a caller sends is inert.
	case ents.UploadKind_UPLOAD_KIND_SITE_MEDIA:
		if err := s.enforcer.RequireGlobalAdmin(ctx); err != nil {
			return "", err
		}

		return sitePrefix + "media/" + name, nil

	// Writing an event's imagery is writing the event: same permission as
	// renaming it, because the logo is as much the event's identity.
	case ents.UploadKind_UPLOAD_KIND_HACKATHON_LOGO,
		ents.UploadKind_UPLOAD_KIND_HACKATHON_MEDIA:
		id, err := ownerUUID(ownerID)
		if err != nil {
			return "", err
		}
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
		id, err := ownerUUID(ownerID)
		if err != nil {
			return "", err
		}
		if err := s.authorizeAvatarOwner(ctx, id); err != nil {
			return "", err
		}

		return userPrefix + id.String() + "/avatar/" + name, nil

	// owner_id is the SUBMISSION; the team half of the key is looked up here,
	// so a caller cannot file an attachment under a team that is not the one
	// that owns the submission they were allowed to write.
	case ents.UploadKind_UPLOAD_KIND_SUBMISSION_ATTACHMENT:
		id, err := ownerUUID(ownerID)
		if err != nil {
			return "", err
		}
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

// authorizeAvatarOwner allows a profile picture to be written by its owner, or
// by a global admin fixing someone's profile. Its own function only to keep
// authorizeUpload's branches readable at a glance.
func (s *StorageService) authorizeAvatarOwner(ctx context.Context, id uuid.UUID) error {
	sub, _, err := m.RequireUser(ctx)
	if err != nil {
		return err
	}
	owner, err := s.dbClient.User.Query().Where(entuser.IDEQ(id)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return status.Errorf(codes.NotFound, "user %s not found", id)
		}
		slog.Error("query user for upload", "err", err)

		return status.Error(codes.Internal, "couldn't query database")
	}
	if owner.KeycloakID == sub {
		return nil
	}

	admin, err := s.enforcer.IsGlobalAdmin(sub)
	if err != nil {
		slog.Error("check global admin", "err", err)

		return status.Error(codes.Internal, "authorization error")
	}
	if !admin {
		return status.Error(codes.PermissionDenied, "permission denied")
	}

	return nil
}

// ownerUUID parses the owner id a kind names. Per-branch rather than up front,
// because SITE_MEDIA names no owner at all and a parse before the switch made
// "there is nothing to own" indistinguishable from "that is not a uuid".
func ownerUUID(ownerID string) (uuid.UUID, error) {
	id, err := uuid.Parse(ownerID)
	if err != nil {
		return uuid.Nil, status.Errorf(codes.InvalidArgument, "invalid owner_id: %v", err)
	}

	return id, nil
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
	if strings.HasPrefix(key, hackathonPrefix) || strings.HasPrefix(key, userPrefix) ||
		strings.HasPrefix(key, sitePrefix) {
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

// ListObjects reports what is already in one scope of the store, newest first,
// so an image can be REUSED rather than uploaded a second time.
//
// The whole access-control surface of the read path is authorizeList, and its
// rule is one sentence: **you may list a prefix exactly when you may write to
// it.** Each scope's check is the check authorizeUpload already makes for the
// kind that files objects there, so "may I see what is in here" and "may I put
// something in here" cannot drift apart into two rules that disagree.
//
// Two prefixes are listable by nobody, whatever their role — `users/…/avatar/`
// and `teams/…/submissions/`. See ObjectScope in the proto for why; the short
// version is that one is other people's faces and the other is private by
// bucket policy and would leak who submitted what through the keys alone.
func (s *StorageService) ListObjects(
	ctx context.Context,
	req *msgs.ListObjectsRequest,
) (*msgs.ListObjectsResponse, error) {
	// Authorization FIRST — before the store-configured check, before the
	// page-token parse, before any I/O.
	//
	// The order is the answer's meaning. "Who are you" and "is this server set
	// up" are different questions, and answering the second one first tells an
	// anonymous caller something about the deployment in place of the
	// Unauthenticated they are owed. It also keeps a caller who may not list
	// this scope from telling a malformed cursor from a well-formed one, and
	// from costing the store a round trip.
	prefixes, err := s.authorizeList(ctx, req.GetScope(), req.GetOwnerId())
	if err != nil {
		return nil, err
	}

	if s.store == nil {
		return nil, status.Error(codes.Unavailable, "object storage is not configured")
	}

	offset, err := parsePageToken(req.GetPageToken())
	if err != nil {
		return nil, err
	}

	pageSize := int(req.GetPageSize())
	if pageSize <= 0 {
		pageSize = listDefaultPageSize
	}
	if pageSize > listMaxPageSize {
		pageSize = listMaxPageSize
	}

	scanCtx, cancel := context.WithTimeout(ctx, listObjectsTimeout)
	defer cancel()

	found, truncated, err := s.scanPrefixes(scanCtx, prefixes)
	if err != nil {
		slog.Error("list objects", "prefixes", prefixes, "err", err)

		return nil, status.Error(codes.Unavailable, "couldn't read the object store")
	}

	sortNewestFirst(found)

	if offset > len(found) {
		offset = len(found)
	}
	end := offset + pageSize
	if end > len(found) {
		end = len(found)
	}
	next := ""
	if end < len(found) {
		next = strconv.Itoa(end)
	}

	objects := make([]*ents.StoredObject, 0, end-offset)
	for _, info := range found[offset:end] {
		objects = append(objects, s.storedObjectFromInfo(info))
	}

	return &msgs.ListObjectsResponse{
		Objects:       objects,
		NextPageToken: next,
		Truncated:     truncated,
	}, nil
}

// sortNewestFirst orders a listing the way a person opening a picker reads it:
// "the one I just uploaded" is at the top.
//
// The key breaks ties, and that is not cosmetic. The cursor is an OFFSET into
// this ordering, so two objects written in the same second that swapped places
// between two requests would make the second page skip one and repeat another.
// A store that reports no timestamp at all sorts oldest, which puts the objects
// we know least about last rather than first.
func sortNewestFirst(objects []objstore.ObjectInfo) {
	sort.Slice(objects, func(i, j int) bool {
		if !objects[i].LastModified.Equal(objects[j].LastModified) {
			return objects[i].LastModified.After(objects[j].LastModified)
		}

		return objects[i].Key < objects[j].Key
	})
}

// parsePageToken reads the cursor, which is a plain offset into the
// newest-first ordering.
//
// An offset rather than the store's own continuation token, because the answer
// is not in the store's order: it is re-sorted by date, so a token that means
// "resume the S3 scan here" would resume a DIFFERENT sequence than the one the
// caller was reading. The cost is that each page rescans, which is bounded by
// listScanCap and is the reason that cap is small.
func parsePageToken(token string) (int, error) {
	if token == "" {
		return 0, nil
	}
	offset, err := strconv.Atoi(token)
	if err != nil || offset < 0 {
		return 0, status.Error(codes.InvalidArgument, "invalid page_token")
	}

	return offset, nil
}

// authorizeList turns a scope into the prefixes it covers, and refuses first.
// The prefixes are returned by this function and never accepted from a caller —
// same shape as authorizeUpload returning the key.
func (s *StorageService) authorizeList(
	ctx context.Context,
	scope ents.ObjectScope,
	ownerID string,
) ([]string, error) {
	switch scope {
	// The platform's own imagery: no owner to name, so it authorizes on the
	// global Admin role — identical to UPLOAD_KIND_SITE_MEDIA and to every
	// SitePageService mutation.
	case ents.ObjectScope_OBJECT_SCOPE_SITE_MEDIA:
		if err := s.enforcer.RequireGlobalAdmin(ctx); err != nil {
			return nil, err
		}

		return []string{sitePrefix + "media/"}, nil

	// Every listable prefix at once, for the platform's media library. It spans
	// events the caller may have no part in, so it takes the only role that is
	// entitled to look at all of them.
	case ents.ObjectScope_OBJECT_SCOPE_ALL_MEDIA:
		if err := s.enforcer.RequireGlobalAdmin(ctx); err != nil {
			return nil, err
		}

		return []string{hackathonPrefix, sitePrefix + "media/"}, nil

	// One event's own imagery — logo and page media alike, since the person
	// picking a picture wants everything the event has. The permission is
	// hackathon `write`, which is what uploading either of them takes.
	case ents.ObjectScope_OBJECT_SCOPE_HACKATHON_MEDIA:
		id, err := ownerUUID(ownerID)
		if err != nil {
			return nil, err
		}
		if err := s.enforcer.RequirePermission(ctx, id.String(), m.Hackathon, m.Write); err != nil {
			return nil, err
		}
		exists, err := s.dbClient.Hackathon.Query().Where(enthackathon.IDEQ(id)).Exist(ctx)
		if err != nil {
			slog.Error("query hackathon for listing", "err", err)

			return nil, status.Error(codes.Internal, "couldn't query database")
		}
		if !exists {
			return nil, status.Errorf(codes.NotFound, "hackathon %s not found", id)
		}

		return []string{hackathonPrefix + id.String() + "/"}, nil

	case ents.ObjectScope_OBJECT_SCOPE_UNSPECIFIED:
		fallthrough
	default:
		return nil, status.Error(codes.InvalidArgument, "unsupported object scope")
	}
}

// scanPrefixes reads up to listScanCap keys across prefixes and keeps the ones
// that are images. It reports whether the cap stopped it.
//
// The budget counts KEYS READ, not images kept: the cost being bounded is the
// store round trips, and a prefix full of non-images would otherwise be scanned
// without limit.
func (s *StorageService) scanPrefixes(
	ctx context.Context,
	prefixes []string,
) ([]objstore.ObjectInfo, bool, error) {
	found := make([]objstore.ObjectInfo, 0, listDefaultPageSize)
	scanned := 0

	for _, prefix := range prefixes {
		token := ""
		for {
			budget := listScanCap - scanned
			if budget <= 0 {
				return found, true, nil
			}
			batch, next, err := s.store.ListPrefix(ctx, prefix, token, budget)
			if err != nil {
				return nil, false, err
			}
			scanned += len(batch)
			for _, info := range batch {
				if isListableImage(info.Key) {
					found = append(found, info)
				}
			}
			if next == "" {
				break
			}
			token = next
		}
	}

	return found, false, nil
}

// isListableImage keeps a picture gallery to pictures. Every listable prefix is
// an imagery prefix by policy, so this only ever filters out strays — the
// bootstrap script's `_selftest/probe.txt` is the one that exists today — but a
// gallery is a grid of <img> tags and a row that can only ever render broken is
// worse than a row that is not there.
func isListableImage(key string) bool {
	ext := strings.ToLower(strings.TrimPrefix(path.Ext(key), "."))

	return listableExts[ext]
}

// storedObjectFromInfo is the ent-to-proto mapper's equivalent for the store:
// it maps what ListObjectsV2 reported onto the entity, and its one decision is
// that `url` is the STABLE public path, never a presign. Every listable prefix
// is public-read, so a signature would be an expiring bearer credential handed
// out for something that needs none — sixty of them per gallery page, some
// lapsing while the grid was still on screen.
func (s *StorageService) storedObjectFromInfo(info objstore.ObjectInfo) *ents.StoredObject {
	var lastModified *timestamppb.Timestamp
	if !info.LastModified.IsZero() {
		lastModified = timestamppb.New(info.LastModified)
	}

	return &ents.StoredObject{
		Key:          info.Key,
		Url:          s.store.PublicURL(info.Key),
		SizeBytes:    info.SizeBytes,
		LastModified: lastModified,
	}
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
