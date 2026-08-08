//go:build test && unittest

package audit

import (
	"context"
	"strings"
	"testing"
)

// countingLookup is a Lookup plus a call counter, so "the cache works" is an
// assertion rather than a hope — an uncached resolver adds a database
// round-trip per RPC, which is the thing this design promises not to do.
type countingLookup struct {
	users map[string]string
	calls int
}

func (c *countingLookup) fn(_ context.Context, sub string) (string, bool) {
	c.calls++
	name, ok := c.users[sub]

	return name, ok
}

const (
	aliceSub = "5f0f4b60-2c0f-4a3e-9c1d-8b7a6e5d4c3b"
	ghostSub = "9e8d7c6b-5a49-4382-91f0-0e1d2c3b4a59"
)

func TestResolveAnonymous(t *testing.T) {
	r := NewResolver(nil)
	for _, sub := range []string{"", AnonActor} {
		if got := r.Resolve(context.Background(), sub); got != AnonActor {
			t.Errorf("Resolve(%q) = %q, want %q", sub, got, AnonActor)
		}
	}
}

func TestResolveMapsSubjectToUsername(t *testing.T) {
	lookup := &countingLookup{users: map[string]string{aliceSub: "alice"}, calls: 0}
	r := NewResolver(lookup.fn)
	if got := r.Resolve(context.Background(), aliceSub); got != "alice" {
		t.Fatalf("Resolve = %q, want alice", got)
	}
}

func TestResolveCachesPositiveLookups(t *testing.T) {
	lookup := &countingLookup{users: map[string]string{aliceSub: "alice"}, calls: 0}
	r := NewResolver(lookup.fn)
	for range 50 {
		if got := r.Resolve(context.Background(), aliceSub); got != "alice" {
			t.Fatalf("Resolve = %q, want alice", got)
		}
	}
	if lookup.calls != 1 {
		t.Errorf("lookup called %d times for one subject — it must be memoized", lookup.calls)
	}
}

// An authenticated stranger must be distinguishable from other strangers and
// from nobody at all, while the Keycloak ID itself stays off disk.
func TestResolveUnknownSubjectIsPseudonymous(t *testing.T) {
	lookup := &countingLookup{users: map[string]string{}, calls: 0}
	r := NewResolver(lookup.fn)
	got := r.Resolve(context.Background(), ghostSub)

	if !IsPseudonym(got) {
		t.Fatalf("Resolve = %q, want an unknown: pseudonym", got)
	}
	if strings.Contains(got, ghostSub) || strings.Contains(ghostSub, strings.TrimPrefix(got, "unknown:")) {
		t.Errorf("pseudonym %q leaks the subject %q", got, ghostSub)
	}
	if again := NewResolver(nil).Resolve(context.Background(), ghostSub); again != got {
		t.Errorf("pseudonym is not stable across resolvers: %q vs %q", got, again)
	}
	other := NewResolver(nil).Resolve(context.Background(), aliceSub)
	if other == got {
		t.Errorf("two different subjects share the pseudonym %q", got)
	}
}

// A MISS MUST NOT BE CACHED. Registration is WhoAmI (NotFound) -> Register ->
// WhoAmI within a few hundred milliseconds; a negative cache of any duration
// labels the Register itself, and everything after it, `unknown:`. The first
// real capture had every extra in the cast journalled as a stranger creating
// an account out of nowhere.
func TestResolveNeverCachesAMiss(t *testing.T) {
	lookup := &countingLookup{users: map[string]string{}, calls: 0}
	r := NewResolver(lookup.fn)

	if got := r.Resolve(context.Background(), ghostSub); !IsPseudonym(got) {
		t.Fatalf("first Resolve = %q, want a pseudonym", got)
	}
	// They register — the very next call, no clock advanced at all.
	lookup.users[ghostSub] = "dana.moser"
	if got := r.Resolve(context.Background(), ghostSub); got != "dana.moser" {
		t.Fatalf("Resolve = %q, want dana.moser — a miss was cached", got)
	}
	// And once they ARE known, the lookup stops.
	before := lookup.calls
	for range 10 {
		r.Resolve(context.Background(), ghostSub)
	}
	if lookup.calls != before {
		t.Errorf("lookup called %d more times after a hit — hits must be memoized", lookup.calls-before)
	}
}

func TestResolveWithoutLookupNeverReturnsTheSubject(t *testing.T) {
	got := NewResolver(nil).Resolve(context.Background(), aliceSub)
	if got == aliceSub {
		t.Fatal("the raw Keycloak subject was returned as the actor name")
	}
	if !IsPseudonym(got) {
		t.Errorf("Resolve = %q, want a pseudonym when no lookup is configured", got)
	}
}

func TestRecipeMethodStripsLeadingSlash(t *testing.T) {
	got := RecipeMethod("/hackathon.HackathonService/Edit")
	if got != "hackathon.HackathonService/Edit" {
		t.Errorf("RecipeMethod = %q", got)
	}
}
