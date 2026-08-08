//go:build test && unittest

package audit

import (
	"testing"

	hmsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	uents "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/entities"
	umsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/messages/user_svc"
)

const (
	dbUUID       = "019fe095-35d1-7885-a8a2-01d05d9730f5"
	keycloakUUID = "1183370a-46a2-4dad-b8fd-dd927d083e14"
)

// The response side records ids and only ids. This is what makes the converter
// able to turn "the id a Create returned" into {{hackathonId}} — and it is the
// one place a value from a response can reach disk at all.
func TestProducedIDsCollectsObjectIDs(t *testing.T) {
	got := producedIDs(&hmsgs.CreateResponse{HackathonId: dbUUID})
	if got["hackathonId"] != dbUUID {
		t.Errorf("producedIDs = %v, want hackathonId=%s", got, dbUUID)
	}
}

// Regression, and the reason foreignID exists: WhoAmI answers with the User
// entity, which carries keycloak_id. It ends in "Id" and it is a UUID, so the
// generic rule recorded the caller's Keycloak subject right next to their
// username — the one join this file must never allow. Caught by reading the
// first real capture, not by review.
func TestProducedIDsNeverRecordsTheKeycloakID(t *testing.T) {
	got := producedIDs(&umsgs.WhoAmIResponse{
		User: &uents.User{Id: dbUUID, KeycloakId: keycloakUUID, Username: "hackagon-admin"},
	})
	if got["user.id"] != dbUUID {
		t.Errorf("the platform user id must still be collected: %v", got)
	}
	for path, v := range got {
		if v == keycloakUUID {
			t.Fatalf("the Keycloak subject was journalled at %q", path)
		}
	}
}

// Non-id fields of a response are not read at all, whatever they contain.
func TestProducedIDsIgnoresEverythingThatIsNotAnID(t *testing.T) {
	got := producedIDs(&umsgs.WhoAmIResponse{
		User: &uents.User{
			Id:       dbUUID,
			Username: "dana.moser",
			Email:    "dana@example.org",
			Dietary:  "coeliac",
		},
	})
	if len(got) != 1 || got["user.id"] != dbUUID {
		t.Fatalf("producedIDs = %v, want exactly {user.id: %s}", got, dbUUID)
	}
}

func TestProducedIDsIgnoresNonUUIDValues(t *testing.T) {
	if got := producedIDs(&hmsgs.CreateResponse{HackathonId: "not-a-uuid"}); got != nil {
		t.Errorf("producedIDs = %v, want nil for a non-UUID id", got)
	}
}
