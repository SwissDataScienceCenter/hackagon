//go:build test && unittest

package service_test

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/google/uuid"

	hackathonSvc "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon"
	msgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/team_svc"
	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/testutils"
)

// The anonymous subject at the handler boundary.
//
// The auth interceptor injects `sub: "anonymous"` when there is no bearer
// token, so a call with no credentials reaches the handler like any other.
// TeamService's mutation handlers moved onto middleware.RequireUser for one
// reason: without it they parsed the request and looked the row up first, and
// answered NotFound — which tells an unauthenticated caller which submission
// and team ids exist.
//
// The ids below are therefore RANDOM AND ABSENT ON PURPOSE. "Unauthenticated
// rather than NotFound" is the whole claim, and it can only be made about a
// request whose id would genuinely miss.
var _ = Describe("TeamService with no credentials", func() {
	var (
		conn   *grpc.ClientConn
		client hackathonSvc.TeamServiceClient
	)

	BeforeEach(func() {
		_, conn, _ = testutils.CreateTestServer()
		client = hackathonSvc.NewTeamServiceClient(conn)
	})

	// No metadata at all: this is what a caller with no session sends.
	anon := func() context.Context { return context.Background() }

	It("tells an anonymous caller to sign in rather than whether a submission exists", func() {
		_, err := client.EditSubmission(anon(), &msgs.EditSubmissionRequest{
			SubmissionId: uuid.NewString(),
		})
		Expect(err).To(HaveOccurred())
		Expect(status.Convert(err).Code()).To(
			Equal(codes.Unauthenticated),
			"NotFound here is an oracle for which submission ids exist",
		)
	})

	It("tells an anonymous caller to sign in rather than whether a team exists", func() {
		_, err := client.CreateSubmission(anon(), &msgs.CreateSubmissionRequest{
			TeamId:    uuid.NewString(),
			ProjectId: uuid.NewString(),
		})
		Expect(err).To(HaveOccurred())
		Expect(status.Convert(err).Code()).To(Equal(codes.Unauthenticated))
	})
})
