//go:build test && unittest

package service_test

import (
	"context"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/google/uuid"

	ent "github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	enttrack "github.com/swissdatasciencecenter/hackagon/components/backend/ent/track"
	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	ents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	hackathonMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/track_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

var _ = Describe("TrackService", func() {

	var (
		dbClient        *ent.Client
		conn            *grpc.ClientConn
		trackClient     hackathonSvc.TrackServiceClient
		hackathonClient hackathonSvc.HackathonServiceClient
		testAdmin       string
	)

	BeforeEach(func() {
		dbClient, conn = testutils.CreateTestServer()
		testAdmin = testutils.TestAdminKeycloakID

		trackClient = hackathonSvc.NewTrackServiceClient(conn)
		hackathonClient = hackathonSvc.NewHackathonServiceClient(conn)
	})

	Describe("Create", func() {
		It("creates track successfully with admin token", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// First create a hackathon to associate the track with
			now := time.Now()
			hackathonResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:        "Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(hackathonResp.GetHackathonId()).NotTo(BeEmpty())

			name := "Test Track"
			description := "Test track description"
			req := &msgs.CreateRequest{
				HackathonId: hackathonResp.GetHackathonId(),
				Name:        name,
				Description: description,
			}

			resp, err := trackClient.Create(ctx, req)
			Expect(err).NotTo(HaveOccurred())
			Expect(resp.GetTrackId()).NotTo(BeEmpty())

			// Verify in database
			t, err := dbClient.Track.Query().
				Where(enttrack.IDEQ(uuid.MustParse(resp.GetTrackId()))).
				WithCreator().
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(t.Name).To(Equal(name))
			Expect(t.Description).To(Equal(description))
			Expect(t.Edges.Creator).NotTo(BeNil())
			Expect(t.Edges.Creator.KeycloakID).To(Equal(testAdmin))
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			req := &msgs.CreateRequest{
				HackathonId: uuid.NewString(),
				Name:        "Test Track",
				Description: "Test description",
			}

			_, err := trackClient.Create(ctx, req)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Write permission to create", func() {
			// Create a non-admin test user
			nonAdminKeycloakID := "non-admin-track"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonAdminKeycloakID).
				SetUsername("test-track-user").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonAdminKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create hackathon as admin first
			adminToken := testutils.CreateTestJWTToken(testAdmin)
			adminCtx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+adminToken),
			)

			now := time.Now()
			hackathonResp, err := hackathonClient.Create(adminCtx, &hackathonMsgs.CreateRequest{
				Name:        "Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())

			req := &msgs.CreateRequest{
				HackathonId: hackathonResp.GetHackathonId(),
				Name:        "Unauthorized Track",
				Description: "Unauthorized description",
			}

			_, err = trackClient.Create(ctx, req)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("List", func() {
		var createdTrackID string
		var hackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:        "List Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()

			// Create a track
			name := "Test Track"
			description := "Test track description"
			trackResp, err := trackClient.Create(ctx, &msgs.CreateRequest{
				HackathonId: hackathonID,
				Name:        name,
				Description: description,
			})
			Expect(err).NotTo(HaveOccurred())
			createdTrackID = trackResp.GetTrackId()
		})

		It("lists all tracks for a hackathon", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			listResp, err := trackClient.List(ctx, &msgs.ListRequest{HackathonId: hackathonID})
			Expect(err).NotTo(HaveOccurred())
			Expect(listResp.GetTracks()).To(HaveLen(1))
			Expect(listResp.GetTracks()[0].GetId()).To(Equal(createdTrackID))
			Expect(listResp.GetTracks()[0].GetName()).To(Equal("Test Track"))
		})

		It("returns tracks ordered by name", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Create another track with name that would sort after "Test Track"
			_, err := trackClient.Create(ctx, &msgs.CreateRequest{
				HackathonId: hackathonID,
				Name:        "Zebra Track",
				Description: "Another track",
			})
			Expect(err).NotTo(HaveOccurred())

			listResp, err := trackClient.List(ctx, &msgs.ListRequest{HackathonId: hackathonID})
			Expect(err).NotTo(HaveOccurred())
			Expect(len(listResp.GetTracks())).To(Equal(2))
			// Should be ordered alphabetically
			Expect(listResp.GetTracks()[0].GetName()).To(Equal("Test Track"))
			Expect(listResp.GetTracks()[1].GetName()).To(Equal("Zebra Track"))
		})

		It("returns NOT_FOUND for invalid hackathon ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			_, err := trackClient.List(ctx, &msgs.ListRequest{HackathonId: uuid.NewString()})
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})
	})

	Describe("Get", func() {
		var createdTrackID string
		var hackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:        "Get Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()

			// Create a track
			name := "Get Test Track"
			description := "Test track description"
			trackResp, err := trackClient.Create(ctx, &msgs.CreateRequest{
				HackathonId: hackathonID,
				Name:        name,
				Description: description,
			})
			Expect(err).NotTo(HaveOccurred())
			createdTrackID = trackResp.GetTrackId()
		})

		It("retrieves track with full details", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getReq := &msgs.GetRequest{TrackId: createdTrackID}
			getResp, err := trackClient.Get(ctx, getReq)
			Expect(err).NotTo(HaveOccurred())

			t := getResp.GetTrack()
			Expect(t.GetId()).To(Equal(createdTrackID))
			Expect(t.GetName()).To(Equal("Get Test Track"))
			Expect(t.GetDescription()).To(Equal("Test track description"))
			Expect(t.GetHackathonId()).To(Equal(hackathonID))
		})

		It("returns NOT_FOUND for invalid track ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getReq := &msgs.GetRequest{TrackId: uuid.NewString()}
			_, err := trackClient.Get(ctx, getReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Read permission to get", func() {
			// Use a user who is not an owner/organizer
			nonOwnerKeycloakID := "non-owner-track"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-track-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			getReq := &msgs.GetRequest{TrackId: createdTrackID}
			_, err = trackClient.Get(ctx, getReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Edit", func() {
		var createdTrackID string
		var hackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:        "Edit Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()

			// Create a track
			name := "Edit Test Track"
			description := "Original description"
			trackResp, err := trackClient.Create(ctx, &msgs.CreateRequest{
				HackathonId: hackathonID,
				Name:        name,
				Description: description,
			})
			Expect(err).NotTo(HaveOccurred())
			createdTrackID = trackResp.GetTrackId()
		})

		It("allows admin to edit track fields", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			newName := "Updated Track Name"
			newDesc := testutils.StringPtr("Updated description")

			editReq := &msgs.EditRequest{
				TrackId:     createdTrackID,
				Name:        &newName,
				Description: newDesc,
			}

			editResp, err := trackClient.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())
			Expect(editResp.Track.Id).To(Equal(createdTrackID))

			// Verify in database
			t, err := dbClient.Track.Query().
				Where(enttrack.IDEQ(uuid.MustParse(createdTrackID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(t.Name).To(Equal(newName))
			Expect(t.Description).To(Equal(*newDesc))
		})

		It("allows partial updates (only provided fields)", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			// Only update name, keep description as-is
			newName := "Partially Updated"
			editReq := &msgs.EditRequest{
				TrackId: createdTrackID,
				Name:    &newName,
			}

			_, err := trackClient.Edit(ctx, editReq)
			Expect(err).NotTo(HaveOccurred())

			t, err := dbClient.Track.Query().
				Where(enttrack.IDEQ(uuid.MustParse(createdTrackID))).
				Only(context.Background())
			Expect(err).NotTo(HaveOccurred())
			Expect(t.Name).To(Equal(newName))
			Expect(t.Description).To(Equal("Original description"))
		})

		It("returns NOT_FOUND for invalid track ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			editReq := &msgs.EditRequest{
				TrackId: uuid.NewString(),
				Name:    testutils.StringPtr("Should fail"),
			}

			_, err := trackClient.Edit(ctx, editReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Write permission to edit", func() {
			// Use a user who is not an owner/organizer
			nonOwnerKeycloakID := "non-owner-track-edit"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-track-edit-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			editReq := &msgs.EditRequest{
				TrackId: createdTrackID,
				Name:    testutils.StringPtr("Unauthorized edit"),
			}

			_, err = trackClient.Edit(ctx, editReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

	Describe("Delete", func() {
		var createdTrackID string
		var hackathonID string

		BeforeEach(func() {
			// Create hackathon using admin
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			now := time.Now()
			createResp, err := hackathonClient.Create(ctx, &hackathonMsgs.CreateRequest{
				Name:        "Delete Test Hackathon",
				Description: testutils.StringPtr("A test hackathon"),
				Visibility:  ents.Visibility_VISIBILITY_PUBLIC,
				StartsAt:    timestamppb.New(now.Add(24 * time.Hour)),
				EndsAt:      timestamppb.New(now.Add(48 * time.Hour)),
			})
			Expect(err).NotTo(HaveOccurred())
			hackathonID = createResp.GetHackathonId()

			// Create a track
			name := "Delete Test Track"
			description := "Track to be deleted"
			trackResp, err := trackClient.Create(ctx, &msgs.CreateRequest{
				HackathonId: hackathonID,
				Name:        name,
				Description: description,
			})
			Expect(err).NotTo(HaveOccurred())
			createdTrackID = trackResp.GetTrackId()
		})

		It("allows owner to delete a track", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			deleteReq := &msgs.DeleteRequest{
				TrackId: createdTrackID,
			}

			_, err := trackClient.Delete(ctx, deleteReq)
			Expect(err).NotTo(HaveOccurred())

			// Verify track was deleted
			_, err = dbClient.Track.Query().
				Where(enttrack.IDEQ(uuid.MustParse(createdTrackID))).
				Only(context.Background())
			Expect(err).To(HaveOccurred())
			Expect(ent.IsNotFound(err)).To(BeTrue())
		})

		It("returns NOT_FOUND for invalid track ID", func() {
			token := testutils.CreateTestJWTToken(testAdmin)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			deleteReq := &msgs.DeleteRequest{
				TrackId: uuid.NewString(),
			}

			_, err := trackClient.Delete(ctx, deleteReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.NotFound))
		})

		It("requires Write permission to delete", func() {
			// Use a user who is not an owner/organizer
			nonOwnerKeycloakID := "non-owner-track-delete"
			_, err := dbClient.User.Create().
				SetKeycloakID(nonOwnerKeycloakID).
				SetUsername("non-owner-track-delete-username").
				Save(context.Background())
			Expect(err).NotTo(HaveOccurred())

			token := testutils.CreateTestJWTToken(nonOwnerKeycloakID)
			ctx := metadata.NewOutgoingContext(
				context.Background(),
				metadata.Pairs("authorization", "Bearer "+token),
			)

			deleteReq := &msgs.DeleteRequest{
				TrackId: createdTrackID,
			}

			_, err = trackClient.Delete(ctx, deleteReq)
			Expect(err).To(HaveOccurred())

			st := status.Convert(err)
			Expect(st.Code()).To(Equal(codes.PermissionDenied))
		})
	})

})
