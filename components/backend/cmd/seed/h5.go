package main

// H5 — Partner Data Sprint 2026. Upcoming, private, alice's.
//
// The fixture for invitation links, and the only hackathon in which the invite
// flow can be exercised at all. H3 is private too, but it is over and its
// `register` capability is off, so `Join` refuses before it ever looks at a
// token — which made every attempt to test an invitation come back
// `PermissionDenied` for a reason that had nothing to do with the invitation.
//
// This one is private, upcoming, and taking sign-ups, so a link is the only way
// in and following one actually gets you somewhere. It carries three invites,
// one in each of the three states the API can produce — live, revoked, expired —
// because two of those cannot reasonably be made by hand: an organizer has no
// way to backdate an expiry, and revoking is a one-way door.
//
// alice owns it rather than admin, deliberately. A global admin passes casbin's
// `g2(r.sub, "admin")` escape hatch, so testing the organizer surfaces as admin
// proves nothing about the `hackathon:write` gate every invite RPC sits behind.
// alice holds `Owner` and nothing else, which is the permission a real organizer
// has.

import (
	"fmt"
	"log/slog"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	hackEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/entities"
	hackMsgs "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/hackathon/messages/hackathon_svc"
)

// devFrontendOrigin is where a seeded invite link is worth opening.
//
// Hardcoded because the frontend's dev port is not a variable either: 8081 is
// fixed in `svelte.config.js`, held by `strictPort` in `vite.config.ts`, and
// listed in the Keycloak realm's allowed redirect URIs, so a seed that guessed
// differently would be guessing wrong. The seed has no way to learn a deployed
// origin — it talks to an in-process server and never sees an HTTP request — and
// printing the bare token instead would just move the concatenation onto
// whoever is testing.
const devFrontendOrigin = "http://localhost:8081"

// seedH5 builds the upcoming private Partner Data Sprint.
//
// dana is the one seeded participant, and she gets in the way anybody gets into
// a private hackathon: by following the live invitation. That is not decoration
// — it means every seed run exercises Join's invite gate for real, so a
// regression there fails the seed rather than waiting to be noticed in the UI.
//
// She is also the only fixture identity used here on purpose. bob and charles
// are left out so both remain available to redeem a link by hand, which needs an
// account that can actually sign in to Keycloak; dana cannot, so she can never
// be mistaken for the one you are supposed to test as.
func (h *harness) seedH5(now time.Time, alice, dana *actor) error {
	startsAt := now.AddDate(0, 0, 12)
	endsAt := now.AddDate(0, 0, 14)

	created, err := h.hackathon.Create(alice.ctx, &hackMsgs.CreateRequest{
		Name:       partnerSprint,
		Visibility: hackEnts.Visibility_VISIBILITY_PRIVATE,
		Description: ptr(
			"## An invitation-only sprint\n\n" +
				"Two days with the SDSC data partners, working on the datasets " +
				"nobody can publish yet. Attendance is by invitation: there is no " +
				"public sign-up page and this event is not listed anywhere.\n\n" +
				"If you were sent a link, you are in the right place — request a " +
				"place below and one of the organizers will confirm it.",
		),
		StartsAt: timestamppb.New(startsAt),
		EndsAt:   timestamppb.New(endsAt),
		Logo:     nil,
	})
	if err != nil {
		return fmt.Errorf("create: %w", err)
	}
	id := created.GetHackathonId()

	// `register` and nothing else. This fixture is the door rather than the
	// room: the sprint has not started, so there is nothing inside for a
	// confirmed member to do yet, and a capability switched on here would only
	// blur what the fixture is for. A refused mutation in H5 means the
	// capability is off, exactly as it says.
	if err := h.setCaps(alice, id, hackEnts.Capability_CAPABILITY_REGISTER); err != nil {
		return err
	}

	// The three links. Only the first is usable; the other two exist so the
	// organizer's list has a revoked row and an expired row in it, and so both
	// refusals can be reproduced without waiting for a clock.
	live, err := h.mintInvite(alice, id, "Partner mailing list — the live link.", nil)
	if err != nil {
		return err
	}

	revoked, err := h.mintInvite(alice, id, "Forwarded outside the partners — revoked.", nil)
	if err != nil {
		return err
	}
	if err := h.revokeInvite(alice, revoked.GetId()); err != nil {
		return err
	}

	// Backdated past `ends_at` rather than merely near it, so this link stays
	// expired however long after seeding it is opened.
	expired, err := h.mintInvite(
		alice, id,
		"Last year's partner list — expired.",
		timestamppb.New(now.AddDate(0, 0, -1)),
	)
	if err != nil {
		return err
	}

	// dana joins on the live link and stays waitlisted: approval is a separate
	// act, and somebody sitting in the queue is what gives the organizer's
	// waitlist something to approve.
	//
	// Before the form below exists, which is the same order H1 uses and for the
	// same reason: `Join` refuses a signup that leaves a mandatory question
	// unanswered, and `joinWithInvite` sends no answers. So dana is the fixture
	// for somebody who got in before the form went up — waitlisted, with
	// nothing on file for an organizer to read.
	if err := h.joinWithInvite(dana, id, live.GetToken()); err != nil {
		return err
	}

	// A small form, with something mandatory in it on purpose. A private
	// hackathon that asks nothing could be joined by posting an empty form, so
	// the mandatory questions are what make the invitation page have to carry
	// the form rather than just a button.
	if _, err := h.createQuestions(alice, id, []questionSpec{
		{
			key:           "affiliation",
			label:         "Which partner organization are you with?",
			qType:         hackEnts.QuestionType_QUESTION_TYPE_TEXT,
			mandatory:     true,
			options:       nil,
			publicAnswers: true,
		},
		{
			key:           "data_agreement",
			label:         "I have signed the data-sharing agreement",
			qType:         hackEnts.QuestionType_QUESTION_TYPE_BOOL,
			mandatory:     true,
			options:       nil,
			publicAnswers: false,
		},
		{
			key:           "access_needs",
			label:         "Anything we should know to make the venue work for you?",
			qType:         hackEnts.QuestionType_QUESTION_TYPE_TEXT,
			mandatory:     false,
			options:       nil,
			publicAnswers: false,
		},
	}); err != nil {
		return fmt.Errorf("questions: %w", err)
	}

	// Printed because a token is unguessable by design: there is no way to get
	// at one from the UI until the organizer's invitations page exists, and
	// digging it out of Postgres or ListInvites to test the flow is a detour
	// every single time. One line per state, so the two that are supposed to
	// fail are as easy to try as the one that works.
	for _, l := range []struct{ state, note, token string }{
		{"live", live.GetNote(), live.GetToken()},
		{"revoked", revoked.GetNote(), revoked.GetToken()},
		{"expired", expired.GetNote(), expired.GetToken()},
	} {
		slog.Info(
			"H5 invitation link",
			"state", l.state,
			"url", devFrontendOrigin+"/invite/"+l.token,
			"note", l.note,
		)
	}

	return nil
}
