//go:build test && unittest

package service_test

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"github.com/google/uuid"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	hackathonEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	hackathonMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	storageSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/storage"
	storageEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/storage/entities"
	storageMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/storage/messages/storage_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

// ListObjects is a READ over other people's uploads, so its whole risk is the
// authorization rule. That rule is tested here from BOTH sides for every scope:
// the caller who may not list it is refused, and the caller who may gets past
// the check — the two together are what make a refusal mean something.
//
// "Gets past the check" is `Unavailable`, and that is the point rather than a
// compromise. This suite's config leaves `storage.endpoint` empty, so the
// service holds no object-store client; `Unavailable` is therefore the FIRST
// answer that can only come from the far side of authorizeList. A test that
// only ever saw PermissionDenied would agree just as loudly with a handler that
// refused everybody.
//
// It also pins the ORDER of the two checks. Authorization is answered before
// "is storage configured", so an anonymous caller is told to authenticate
// rather than told about the deployment — and the deny side stays testable on a
// server with no store at all.
var _ = Describe("StorageService.ListObjects", func() {
	var (
		dbClient *ent.Client
		conn     *grpc.ClientConn
		enf      *middleware.Enforcer
		client   storageSvc.StorageServiceClient
		admin    string
	)

	// authed builds a context carrying `keycloakID`'s bearer token.
	authed := func(keycloakID string) context.Context {
		return metadata.NewOutgoingContext(
			context.Background(),
			metadata.Pairs(
				"authorization",
				"Bearer "+testutils.CreateTestJWTToken(keycloakID),
			),
		)
	}

	// newUser inserts a user with no roles at all and returns its Keycloak ID.
	newUser := func(username string) string {
		keycloakID := "keycloak-" + username
		_, err := dbClient.User.Create().
			SetKeycloakID(keycloakID).
			SetUsername(username).
			Save(context.Background())
		Expect(err).NotTo(HaveOccurred())

		return keycloakID
	}

	codeOf := func(err error) codes.Code {
		GinkgoHelper()
		Expect(err).To(HaveOccurred())

		return status.Convert(err).Code()
	}

	BeforeEach(func() {
		dbClient, conn, enf = testutils.CreateTestServer()
		admin = testutils.TestAdminKeycloakID
		client = storageSvc.NewStorageServiceClient(conn)
	})

	Describe("site media — the platform's own imagery", func() {
		req := &storageMsgs.ListObjectsRequest{
			Scope:     storageEnts.ObjectScope_OBJECT_SCOPE_SITE_MEDIA,
			OwnerId:   "",
			PageSize:  0,
			PageToken: "",
		}

		It("tells an anonymous caller to authenticate, never that it is denied", func() {
			// A status code is an answer. "Who are you" and "not you" are
			// different answers, and this is the pinned policy for every
			// endpoint on this branch.
			_, err := client.ListObjects(context.Background(), req)
			Expect(codeOf(err)).To(Equal(codes.Unauthenticated))
		})

		It("denies a signed-in user who is not a platform admin", func() {
			_, err := client.ListObjects(authed(newUser("nobody")), req)
			Expect(codeOf(err)).To(Equal(codes.PermissionDenied))
		})

		It("denies a hackathon ORGANIZER, who may create events but not edit the site", func() {
			// The same split site pages already have: an organizer is refused
			// every SitePageService mutation, so they are refused this too, by
			// the identical rule rather than by a second one agreeing.
			organizer := newUser("organizer")
			_, err := enf.AddGlobalRole(organizer, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())

			_, listErr := client.ListObjects(authed(organizer), req)
			Expect(codeOf(listErr)).To(Equal(codes.PermissionDenied))
		})

		It("lets a platform admin through to the store", func() {
			_, err := client.ListObjects(authed(admin), req)
			Expect(codeOf(err)).To(Equal(codes.Unavailable))
		})
	})

	Describe("the whole media library", func() {
		req := &storageMsgs.ListObjectsRequest{
			Scope:     storageEnts.ObjectScope_OBJECT_SCOPE_ALL_MEDIA,
			OwnerId:   "",
			PageSize:  0,
			PageToken: "",
		}

		It("tells an anonymous caller to authenticate", func() {
			_, err := client.ListObjects(context.Background(), req)
			Expect(codeOf(err)).To(Equal(codes.Unauthenticated))
		})

		It("denies an event OWNER — owning one event is not seeing every event's files", func() {
			// The interesting deny. This caller may list their own hackathon's
			// media (proven below), so a refusal here is the scope boundary
			// doing its job rather than the user having no permissions.
			owner := newUser("owner-of-one")
			_, err := enf.AddGlobalRole(owner, middleware.HackathonOrganizer)
			Expect(err).NotTo(HaveOccurred())
			hackathonID := createHackathon(conn, authed(owner), "Owner's event")

			_, listErr := client.ListObjects(authed(owner), req)
			Expect(codeOf(listErr)).To(Equal(codes.PermissionDenied))

			// The positive control, in the same test: this exact caller is NOT
			// simply powerless — they reach the store for their own event.
			_, ownErr := client.ListObjects(
				authed(owner),
				&storageMsgs.ListObjectsRequest{
					Scope:     storageEnts.ObjectScope_OBJECT_SCOPE_HACKATHON_MEDIA,
					OwnerId:   hackathonID,
					PageSize:  0,
					PageToken: "",
				},
			)
			Expect(codeOf(ownErr)).To(Equal(codes.Unavailable))
		})

		It("lets a platform admin through to the store", func() {
			_, err := client.ListObjects(authed(admin), req)
			Expect(codeOf(err)).To(Equal(codes.Unavailable))
		})
	})

	Describe("one event's media", func() {
		var hackathonID string

		BeforeEach(func() {
			hackathonID = createHackathon(conn, authed(admin), "Storage listing event")
		})

		listOf := func(id string) *storageMsgs.ListObjectsRequest {
			return &storageMsgs.ListObjectsRequest{
				Scope:     storageEnts.ObjectScope_OBJECT_SCOPE_HACKATHON_MEDIA,
				OwnerId:   id,
				PageSize:  0,
				PageToken: "",
			}
		}

		It("tells an anonymous caller to authenticate", func() {
			_, err := client.ListObjects(context.Background(), listOf(hackathonID))
			Expect(codeOf(err)).To(Equal(codes.Unauthenticated))
		})

		It("denies a signed-in user with no standing in the event", func() {
			_, err := client.ListObjects(authed(newUser("outsider")), listOf(hackathonID))
			Expect(codeOf(err)).To(Equal(codes.PermissionDenied))
		})

		It("denies a plain MEMBER of the event", func() {
			// Listing an event's media is authorized as `hackathon:write` —
			// the permission that put the files there. A member can read the
			// event; they cannot see the drawer it keeps its pictures in.
			member := newUser("member")
			_, err := enf.AddRole(member, middleware.Member, hackathonID)
			Expect(err).NotTo(HaveOccurred())

			_, listErr := client.ListObjects(authed(member), listOf(hackathonID))
			Expect(codeOf(listErr)).To(Equal(codes.PermissionDenied))
		})

		It("lets the event's owner through to the store", func() {
			owner := newUser("event-owner")
			_, err := enf.AddRole(owner, middleware.Owner, hackathonID)
			Expect(err).NotTo(HaveOccurred())

			_, listErr := client.ListObjects(authed(owner), listOf(hackathonID))
			Expect(codeOf(listErr)).To(Equal(codes.Unavailable))
		})

		It("lets a platform admin through to the store without joining", func() {
			_, err := client.ListObjects(authed(admin), listOf(hackathonID))
			Expect(codeOf(err)).To(Equal(codes.Unavailable))
		})

		It("answers NotFound for an event that does not exist", func() {
			// Only reachable BY an admin, since the permission check runs
			// first — which is the right order: a stranger must not learn
			// which hackathon ids are real.
			_, err := client.ListObjects(authed(admin), listOf(uuid.NewString()))
			Expect(codeOf(err)).To(Equal(codes.NotFound))

			_, strangerErr := client.ListObjects(
				authed(newUser("prober")), listOf(uuid.NewString()),
			)
			Expect(codeOf(strangerErr)).To(Equal(codes.PermissionDenied))
		})

		It("refuses an owner_id that is not a uuid", func() {
			_, err := client.ListObjects(authed(admin), listOf("not-a-uuid"))
			// protovalidate rejects it before the handler sees it; either way
			// the caller is told the argument is wrong, not that it is denied.
			Expect(codeOf(err)).To(Equal(codes.InvalidArgument))
		})

		It("refuses an event scope with no owner named", func() {
			_, err := client.ListObjects(authed(admin), listOf(""))
			Expect(codeOf(err)).To(Equal(codes.InvalidArgument))
		})
	})

	Describe("the scopes that do not exist", func() {
		It("refuses an unspecified scope", func() {
			_, err := client.ListObjects(authed(admin), &storageMsgs.ListObjectsRequest{
				Scope:     storageEnts.ObjectScope_OBJECT_SCOPE_UNSPECIFIED,
				OwnerId:   "",
				PageSize:  0,
				PageToken: "",
			})
			Expect(codeOf(err)).To(Equal(codes.InvalidArgument))
		})

		It("has no scope for avatars or for submissions, for anyone", func() {
			// The absence is the feature: `users/<id>/avatar/` is other
			// people's faces and `teams/…/submissions/` is private by bucket
			// policy. Neither is reachable by naming a number, which is what
			// this asserts — every value outside the enum is refused even for
			// the caller with every role there is.
			for _, scope := range []storageEnts.ObjectScope{4, 5, 99, -1} {
				_, err := client.ListObjects(authed(admin), &storageMsgs.ListObjectsRequest{
					Scope:     scope,
					OwnerId:   "",
					PageSize:  0,
					PageToken: "",
				})
				Expect(codeOf(err)).To(
					Equal(codes.InvalidArgument),
					"scope %d should not resolve to a prefix", scope,
				)
			}
		})
	})
})

// createHackathon makes one event and returns its id. Local to this file rather
// than shared: it exists so the specs above read as authorization statements.
func createHackathon(conn *grpc.ClientConn, ctx context.Context, name string) string {
	GinkgoHelper()

	resp, err := hackathonSvc.NewHackathonServiceClient(conn).
		Create(ctx, &hackathonMsgs.CreateRequest{ //exhaustruct:ignore
			Name:       name,
			Visibility: hackathonEnts.Visibility_VISIBILITY_PUBLIC,
		})
	Expect(err).NotTo(HaveOccurred())
	Expect(resp.GetHackathonId()).NotTo(BeEmpty())

	return resp.GetHackathonId()
}
