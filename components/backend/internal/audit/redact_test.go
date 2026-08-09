//go:build test && unittest

package audit

import (
	"encoding/json"
	"strings"
	"testing"

	hmsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
	umsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/user/messages/user_svc"
	"google.golang.org/protobuf/types/known/structpb"
)

// The privacy guarantee of this package lives in one table, and a table is
// exactly the kind of thing that rots quietly: a field moved into `keep`
// during a debugging session, a proto that grew a free-text field nobody
// classified. These tests fail on both.

func TestRedactKeepsStructuralFields(t *testing.T) {
	in := map[string]any{
		"hackathonId": "0f2f6b1e-6f1a-4d2e-9a3b-1c2d3e4f5a6b",
		"userId":      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		"slug":        "about",
		"visibility":  "VISIBILITY_PUBLIC",
		"visible":     true,
		"order":       float64(3),
		"startsAt":    "2027-06-01T09:00:00Z",
	}
	out := RedactMap(in)
	for k, want := range in {
		if out[k] != want {
			t.Errorf("field %q: got %v, want %v (structural fields must survive)", k, out[k], want)
		}
	}
}

func TestRedactRedactsFreeTextAndPersonalFields(t *testing.T) {
	// Every one of these is a field somebody could reasonably think is
	// harmless. None of them may reach disk.
	for _, name := range []string{
		"name", "title", "description", "content", "label", "note", "reason",
		"special", "bannerText", "responses", "consents", "templates", "data",
		"displayName", "username", "email", "affiliation", "skills", "dietary",
		"avatarUrl", "key", "filename", "token", "inviteToken", "logo",
		"image", "result",
	} {
		out := RedactMap(map[string]any{name: "sensitive value"})
		if out[name] != Redacted {
			t.Errorf("field %q was recorded as %v — it must be %q", name, out[name], Redacted)
		}
	}
}

// The default is the guarantee. A field nobody has classified — including one
// added to a proto after this table was last read — must be redacted, not
// recorded because it happened to look innocent.
func TestRedactDefaultsToRedactedForUnknownFields(t *testing.T) {
	out := RedactMap(map[string]any{
		"somethingInventedTomorrow": "a person's home address",
		"count":                     float64(7),
		"flag":                      true,
	})
	for k, v := range out {
		if v != Redacted {
			t.Errorf("unlisted field %q was recorded as %v — the default must redact", k, v)
		}
	}
}

// A redacted name loses its WHOLE value, not its leaf strings: `responses` is
// an arbitrary map, so walking into it would record caller-chosen keys even if
// every value were replaced.
func TestRedactReplacesRedactedContainersWholesale(t *testing.T) {
	out := RedactMap(map[string]any{
		"responses": map[string]any{
			"dietary":       "coeliac",
			"accessibility": "step-free access please",
		},
	})
	if out["responses"] != Redacted {
		t.Fatalf("responses recorded as %#v — must collapse to %q", out["responses"], Redacted)
	}
	blob, _ := json.Marshal(out)
	for _, leak := range []string{"coeliac", "step-free", "accessibility"} {
		if strings.Contains(string(blob), leak) {
			t.Errorf("%q survived redaction in %s", leak, blob)
		}
	}
}

// A kept container grants its children nothing: they face the same table.
func TestRedactRecursesIntoKeptContainers(t *testing.T) {
	out := RedactMap(map[string]any{
		"singleChoice": map[string]any{
			"categoryId":   "11111111-2222-3333-4444-555555555555",
			"submissionId": "66666666-7777-8888-9999-000000000000",
		},
		"prizes": []any{
			map[string]any{"rank": float64(1), "title": "Best use of open data"},
		},
	})
	ballot, ok := out["singleChoice"].(map[string]any)
	if !ok {
		t.Fatalf("singleChoice: got %T, want a recursed map", out["singleChoice"])
	}
	if ballot["categoryId"] != "11111111-2222-3333-4444-555555555555" {
		t.Errorf("nested id was not kept: %v", ballot["categoryId"])
	}
	prizes, ok := out["prizes"].([]any)
	if !ok || len(prizes) != 1 {
		t.Fatalf("prizes: got %#v, want a one-element list", out["prizes"])
	}
	prize, _ := prizes[0].(map[string]any)
	if prize["rank"] != float64(1) {
		t.Errorf("nested rank was not kept: %v", prize["rank"])
	}
	if prize["title"] != Redacted {
		t.Errorf(
			"nested title recorded as %v — a kept container must not shelter free text",
			prize["title"],
		)
	}
}

// The worked example from the brief, against the real generated message: a
// registration form carries dietary requirements, and none of it may be
// journalled.
func TestRedactMessageSubmitRegistrationForm(t *testing.T) {
	responses, err := structpb.NewStruct(map[string]any{
		"dietary":     "coeliac, no nuts",
		"affiliation": "ETH Zurich",
		"tshirt":      "M",
	})
	if err != nil {
		t.Fatalf("structpb: %v", err)
	}
	req := &hmsgs.SubmitRegistrationFormRequest{
		HackathonId: "0f2f6b1e-6f1a-4d2e-9a3b-1c2d3e4f5a6b",
		Responses:   responses,
		Consents:    map[string]bool{"photo": true, "coc": true},
	}
	out, err := RedactMessage(req)
	if err != nil {
		t.Fatalf("RedactMessage: %v", err)
	}
	if out["hackathonId"] != "0f2f6b1e-6f1a-4d2e-9a3b-1c2d3e4f5a6b" {
		t.Errorf("hackathonId must survive: %v", out["hackathonId"])
	}
	if out["responses"] != Redacted || out["consents"] != Redacted {
		t.Errorf(
			"responses=%v consents=%v — both must be %q",
			out["responses"],
			out["consents"],
			Redacted,
		)
	}
	blob, _ := json.Marshal(out)
	for _, leak := range []string{"coeliac", "nuts", "ETH Zurich", "tshirt", "photo"} {
		if strings.Contains(string(blob), leak) {
			t.Errorf("%q reached the journal line %s", leak, blob)
		}
	}
}

func TestRedactMessageEditProfile(t *testing.T) {
	name := "Dana Moser"
	out, err := RedactMessage(&umsgs.EditProfileRequest{DisplayName: &name})
	if err != nil {
		t.Fatalf("RedactMessage: %v", err)
	}
	if out["displayName"] != Redacted {
		t.Errorf("a person's name was journalled as %v", out["displayName"])
	}
}

func TestRedactMessageNilIsEmpty(t *testing.T) {
	out, err := RedactMessage(nil)
	if err != nil || len(out) != 0 {
		t.Fatalf("nil message: got %v, %v — want an empty map and no error", out, err)
	}
}
