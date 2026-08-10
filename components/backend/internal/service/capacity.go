package service

// Capacity: how a hackathon's max_participants field governs Join.
//
// The rule, decided once (see joinLandsWaitlisted):
//
//   - Unset or zero capacity means UNLIMITED, and keeps the approval model
//     every existing event runs on: everyone who joins lands on the waiting
//     list and an organizer confirms them by hand. No existing row is
//     silently capped, and no existing flow changes.
//   - A positive capacity turns registration first-come-first-served: Join
//     takes a confirmed place outright while one is free AND nobody is
//     waiting; once the event is full, joining still SUCCEEDS and appends to
//     the waiting list — a person who joins a full event has done nothing
//     wrong.
//   - Capacity counts CONFIRMED participants only (is_waiting = false).
//     The waiting list does not consume places; that is the point of one.
//   - A freed place (RemoveParticipant) is NOT handed out automatically —
//     neither to the head of the queue nor to the next joiner. Nothing
//     notifies a promoted person yet, so an automatic promotion would
//     silently spend the place on someone who may be long gone, and the
//     queue-order-versus-organizer's-pick decision belongs to the person who
//     can see the room. The organizer approves from the waiting list; the
//     participants page makes the free place obvious.
//   - Organizers may approve PAST capacity. The number is their estimate of
//     the room, not a law — the UI surfaces the overshoot so it is a
//     decision rather than an accident.

// joinLandsWaitlisted decides where a new registrant lands.
//
// `maxParticipants` is the hackathon's capacity field (nil or <= 0 means
// unlimited), `confirmed` the number of participants with is_waiting=false,
// `waiting` the number with is_waiting=true — both counted at the moment of
// the decision, under HackathonService.capacityMu.
//
// The `waiting == 0` clause is what keeps the queue fair: once anyone is
// waiting, a newly freed place is the organizer's to hand out, and a new
// joiner queues BEHIND the people already there rather than sniping the seat
// from whoever has waited longest.
func joinLandsWaitlisted(maxParticipants *int32, confirmed, waiting int) bool {
	if maxParticipants == nil || *maxParticipants <= 0 {
		// Unlimited: the approval model — everyone starts on the waiting list.
		return true
	}

	return confirmed >= int(*maxParticipants) || waiting > 0
}
