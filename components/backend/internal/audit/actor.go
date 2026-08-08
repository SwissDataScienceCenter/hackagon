package audit

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"sync"
)

// AnonActor is what an unauthenticated caller is journalled as. It matches the
// subject the auth interceptor injects AND the actor name recipe.jsonl already
// uses, so an anonymous line needs no translation at all.
const AnonActor = "anonymous"

// unknownPrefix labels a subject that authenticated but owns no platform User
// row — someone who has a Keycloak account and has not called Register yet.
//
// The raw subject is NOT written in that case. It is the Keycloak ID: stable,
// and the join key to every other system that knows the person. What goes to
// disk instead is `unknown:` plus the first 8 hex of its SHA-256, which keeps
// two different strangers distinguishable within a journal — without which a
// trace involving one is unreadable — and identifies neither.
const unknownPrefix = "unknown:"

const unknownHashLen = 8

// A MISS IS NEVER CACHED, and that is a decision the first real capture
// forced. Registration goes WhoAmI (NotFound) -> Register -> WhoAmI, all
// inside a few hundred milliseconds, so any negative cache at all — the
// original was 15s, then 2s — labelled the Register itself, and everything
// after it, `unknown:`. Every extra in the journey cast journalled as a
// stranger creating an account out of nowhere.
//
// The cost of not caching is one indexed SELECT per RPC for a subject that
// has no User row, on the writer goroutine, off every request's critical
// path. The cost of caching was a journal that misnames people.

// Lookup answers "which platform username owns this Keycloak subject?".
// Returning false means no User row has that keycloak_id.
type Lookup func(ctx context.Context, sub string) (string, bool)

// Resolver turns JWT subjects into platform usernames, memoized.
//
// It is used from the JOURNAL WRITER, never from the interceptor: resolution
// may touch the database, and requirement one of this package is that a
// request never waits on journalling. The interceptor hands the raw subject
// to the queue and the writer resolves it just before the line is written —
// which also means a Register has already committed by the time its own line
// is resolved, so the caller is named rather than `unknown:`.
type Resolver struct {
	lookup Lookup

	mu    sync.RWMutex
	known map[string]string
}

func NewResolver(lookup Lookup) *Resolver {
	return &Resolver{
		lookup: lookup,
		mu:     sync.RWMutex{},
		known:  make(map[string]string),
	}
}

// Resolve names the actor for a subject. It never returns the subject itself.
func (r *Resolver) Resolve(ctx context.Context, sub string) string {
	if sub == "" || sub == AnonActor {
		return AnonActor
	}
	if name, ok := r.cached(sub); ok {
		return name
	}
	if r.lookup != nil {
		if name, ok := r.lookup(ctx, sub); ok && name != "" {
			r.remember(sub, name)

			return name
		}
	}

	return pseudonym(sub)
}

func (r *Resolver) cached(sub string) (string, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	name, ok := r.known[sub]

	return name, ok
}

func (r *Resolver) remember(sub, name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.known[sub] = name
}

// pseudonym is the one-way stand-in for an unmapped subject.
func pseudonym(sub string) string {
	sum := sha256.Sum256([]byte(sub))

	return unknownPrefix + hex.EncodeToString(sum[:])[:unknownHashLen]
}

// IsPseudonym reports whether an actor name is a stand-in rather than a real
// platform username. Used by tests and by anyone reading a journal who needs
// to know that a line names nobody.
func IsPseudonym(actor string) bool {
	return strings.HasPrefix(actor, unknownPrefix)
}
