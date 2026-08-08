package audit

import (
	"encoding/json"
	"fmt"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// Redacted is what a field that is not on the allowlist becomes. It is a
// string in every case, whatever the original type was, so a reader can never
// mistake a redacted value for a real one.
const Redacted = "<redacted>"

// ─── The policy ──────────────────────────────────────────────────────────────
//
// ALLOWLIST-AND-REDACT. A request field is recorded verbatim only if its JSON
// name appears in `keep` below. Everything else — including every field added
// to a proto after this table was last read — becomes "<redacted>".
//
// The default is deliberately the safe one. A journal is written to answer
// "what did people do", which needs the SHAPE of a call (which object, which
// enum, which flag) and never its prose. Free text is where the personal data
// is: SubmitRegistrationForm carries dietary requirements and accessibility
// notes in `responses`, EditProfile carries a person's name, CreateInvite
// carries a note about an invitee. None of those are on this list, so none of
// them are ever written to disk.
//
// The consequence, and it is intended: a new proto field is redacted until
// somebody adds it here on purpose. A journal that quietly starts recording a
// field nobody classified is the failure this table exists to prevent.
//
// To record a new field: add its JSON (lowerCamel) name to the right group.
// Groups are documentation only — the lookup is a single flat set.
//
// A kept field that holds an object or a list is RECURSED into rather than
// copied, so its children face the same table. That is why the container
// names (`fields`, `prizes`, `submissions`, ...) appear here: listing a
// container grants nothing by itself.
//
//nolint:gochecknoglobals // policy table: read per RPC, written once, never mutated.
var keep = newSet(
	// ── Identifiers. UUIDs of platform objects. Not personal data, and the
	// whole point of the journal: they are what lets one line be recognised
	// as acting on the object an earlier line created.
	"id", "hackathonId", "userId", "projectId", "teamId", "trackId",
	"phaseId", "pageId", "pageIds", "categoryId", "submissionId", "voteId",
	"ownerId", "participantId", "voterId", "creatorId", "modifierId",
	"currentPhaseId", "openInPhaseId", "closedInPhaseId", "inviteId",
	"juryMemberIds", "onBehalfOf",

	// ── Slugs. Short, human-chosen, but they ARE the address of a site page
	// (`about`, `privacy`) and a journal that redacted them could not say
	// which page was edited.
	"slug", "newSlug",

	// ── Enumerations and other closed vocabularies. protojson renders these
	// as their enum name; every possible value is in the .proto file, so
	// recording one reveals nothing that reading the schema does not.
	"visibility", "visibilityFilter", "statusFilter",
	"capability", "capabilities", "votingMethod", "voterType", "role",
	"kind", "format", "type", "mechanism", "oneBallotPer", "tieBreak",
	"latePolicy", "window",

	// ── Flags. A boolean cannot carry free text.
	"visible", "enabled", "required", "force", "includeRevoked",
	"includeHidden", "registrationsEnabled", "votingEnabled",
	"ownTeamVoting", "organizerVoting", "isWaiting", "submitted",

	// ── Numbers. Positions, counts and limits; likewise nothing to hide in
	// an int32 the schema already bounds.
	"order", "rank", "position", "increment", "points", "maxPoints",
	"maxMb", "extendMinutes", "min", "max", "scale",

	// ── Timestamps. Scheduling is structure: the recipe expresses these as
	// {{now+Nd}} and a journal without them cannot show an event being
	// rescheduled.
	"startsAt", "endsAt", "createdAt", "modifiedAt", "submittedAt",
	"expiresAt", "opensAt", "closesAt", "registrationOpens",
	"registrationCloses", "proposalsClose", "preferencesClose",
	"submissionsClose",

	// ── Branding colours. Hex triples chosen by an organizer for an event,
	// not by or about a person.
	"primaryColor", "accentColor",

	// ── Containers that requests actually carry. Recursed into; listing one
	// grants its children nothing. (`points` and `scale` are up in the
	// numbers group and are containers in SubmitVote / SetVotingPolicy —
	// same rule applies, the name is what is listed, not the shape.)
	"fields", "prizes", "awards", "submissions", "singleChoice", "ranked",
)

// The notable fields the default REDACTS, and why. This list is not consulted
// at runtime — the default already covers it, and covers anything added to a
// proto tomorrow — but a reviewer asking "is X recorded?" should find X in
// this file either way, and a future editor should meet the reasoning before
// moving something up into `keep`:
//
//	name, title, description, content, label, note, reason, special,
//	bannerText          organizer- or member-authored prose
//	responses, consents registration answers: dietary needs, accessibility,
//	                    affiliation — and which consents a person gave
//	templates, data     free-form maps with caller-chosen keys AND values
//	displayName, username, email, affiliation, skills, dietary, avatarUrl
//	                    personal data, straight out of the profile
//	key, filename       caller-chosen strings; an object-store key embeds a
//	                    file name, which is routinely a person's name
//	token, inviteToken  secrets — recording one would let a reader use it
//	logo, image, result may be a multi-megabyte data: URI

// ─── Application ─────────────────────────────────────────────────────────────

// RedactMessage marshals a request message the way the frontend and grpcurl
// send it (protojson, lowerCamel names, zero values omitted) and then applies
// the table above. The returned map is safe to write to disk.
//
// Marshalling happens before redaction because protojson is the only thing
// that knows a proto's JSON shape; the full message therefore exists in memory
// for the duration of this call and is then discarded. It is never written.
func RedactMessage(msg proto.Message) (map[string]any, error) {
	if msg == nil {
		return map[string]any{}, nil
	}
	raw, err := protojson.Marshal(msg)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, fmt.Errorf("decode request json: %w", err)
	}

	return RedactMap(decoded), nil
}

// RedactMap applies the policy to an already-decoded message.
func RedactMap(in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		if !keep.has(k) {
			out[k] = Redacted

			continue
		}
		out[k] = redactValue(v)
	}

	return out
}

// redactValue handles the value under a KEPT name: scalars are copied,
// containers are walked so their children face the table too.
func redactValue(v any) any {
	switch t := v.(type) {
	case map[string]any:
		return RedactMap(t)
	case []any:
		out := make([]any, len(t))
		for i, item := range t {
			out[i] = redactValue(item)
		}

		return out
	default:
		return v
	}
}

// ─── set ─────────────────────────────────────────────────────────────────────

type set map[string]struct{}

func newSet(names ...string) set {
	s := make(set, len(names))
	for _, n := range names {
		s[n] = struct{}{}
	}

	return s
}

func (s set) has(name string) bool {
	_, ok := s[name]

	return ok
}
