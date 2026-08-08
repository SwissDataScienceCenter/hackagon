// Package audit records real gRPC traffic in the shape the e2e recipe uses,
// so lifecycle test actions can be derived from what people actually do
// instead of guessed.
//
// It is OFF unless config `audit.enabled` (env HACKAGON_AUDIT_ENABLED) says
// otherwise — see config.AuditConfig for the full statement of what enabling
// it collects. The short version: actor username, method, an allowlisted
// request, the outcome, and the ids the response reported. No IP address, no
// user agent, no session or trace id, no free text.
//
// Three properties this package must never lose, in order:
//
//  1. A request never fails because journalling failed. Every path here
//     either succeeds or gives up quietly, and the interceptor recovers from
//     panics in its own bookkeeping.
//  2. A request never waits on file IO. Entries go to a buffered channel and
//     a single writer goroutine owns the file; when the buffer is full,
//     entries are dropped and counted.
//  3. Nothing reaches disk that the allowlist in redact.go did not pass.
package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
)

// lookupTimeout bounds the actor lookup done by the writer goroutine.
const lookupTimeout = 3 * time.Second

// Entry is one journalled call: one line of JSONL.
//
// The field names are the recipe's own (`actor`, `method`, `params`,
// `expect`), so scripts/journal-to-recipe.mjs is a rewrite rather than a
// translation. `seq` and `ts` are journal bookkeeping and are dropped when a
// draft recipe action is produced.
type Entry struct {
	// Seq is assigned when the entry is queued, so the file's order is the
	// order calls COMPLETED even though writing is asynchronous.
	Seq uint64 `json:"seq"`
	// Ts is UTC, RFC3339 with nanoseconds.
	Ts string `json:"ts"`
	// Actor is a platform username, "anonymous", or an "unknown:xxxxxxxx"
	// pseudonym. Never a Keycloak ID.
	Actor string `json:"actor"`
	// Method is pkg.Service/Method with no leading slash — recipe form.
	Method string `json:"method"`
	// Params is the redacted request.
	Params map[string]any `json:"params"`
	// Expect is {"ok":true} or {"error":"<StatusCodeName>"}.
	Expect map[string]any `json:"expect"`
	// Produced maps a dot-path in the RESPONSE to the UUID found there, for
	// id-shaped fields only (see producedIDs). This is the only part of any
	// response that is ever read, and it is what lets the converter turn the
	// id a Create returned into {{hackathonId}} in every later action.
	// Omitted when the response reported no ids.
	Produced map[string]string `json:"produced,omitempty"`

	// sub is the raw JWT subject, resolved to Actor by the writer goroutine.
	// Unexported: it must not be marshalled, ever.
	sub string
}

// Journal owns the output file and the goroutine that writes it.
type Journal struct {
	queue    chan Entry
	done     chan struct{}
	resolver *Resolver

	seq       atomic.Uint64
	dropped   atomic.Uint64
	warnOnce  sync.Once
	closeOnce sync.Once
}

const defaultBuffer = 4096

// Open creates the journal file (and its parent directories) and starts the
// writer goroutine. Returns nil, nil when auditing is disabled, which callers
// must treat as "no journal" — every method here is safe on a nil receiver.
func Open(cfg config.AuditConfig, resolver *Resolver) (*Journal, error) {
	if !cfg.Enabled {
		return nil, nil //nolint:nilnil // disabled is not an error; see doc comment
	}
	path := cfg.Path
	if path == "" {
		path = ".output/audit/rpc-journal.jsonl"
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, fmt.Errorf("create journal directory: %w", err)
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open journal %s: %w", path, err)
	}
	size := cfg.Buffer
	if size <= 0 {
		size = defaultBuffer
	}
	if resolver == nil {
		// No lookup: every authenticated subject journals as a pseudonym.
		// Degraded, never a leak.
		resolver = NewResolver(nil)
	}
	j := &Journal{
		queue:     make(chan Entry, size),
		done:      make(chan struct{}),
		resolver:  resolver,
		seq:       atomic.Uint64{},
		dropped:   atomic.Uint64{},
		warnOnce:  sync.Once{},
		closeOnce: sync.Once{},
	}
	go j.run(file)

	abs, _ := filepath.Abs(path)
	slog.Warn("RPC JOURNAL ENABLED — appending one line per gRPC call",
		"path", abs,
		"collects", "actor username, method, allowlisted request fields, status, response ids",
		"never", "ip, user agent, session id, free text")

	return j, nil
}

// Record queues an entry. It never blocks and never returns an error: a full
// buffer drops the entry and bumps a counter, because an RPC waiting on the
// journal is a worse outcome than a gap in it.
func (j *Journal) Record(e Entry) {
	if j == nil {
		return
	}
	e.Seq = j.seq.Add(1)
	e.Ts = time.Now().UTC().Format(time.RFC3339Nano)
	select {
	case j.queue <- e:
	default:
		j.dropped.Add(1)
		j.warnOnce.Do(func() {
			slog.Warn("rpc journal buffer full — entries are being dropped",
				"first_dropped_seq", e.Seq, "hint", "raise audit.buffer")
		})
	}
}

// Dropped is how many entries never reached the file.
func (j *Journal) Dropped() uint64 {
	if j == nil {
		return 0
	}

	return j.dropped.Load()
}

// Close drains the queue and closes the file. Safe to call twice, and on nil.
func (j *Journal) Close() {
	if j == nil {
		return
	}
	j.closeOnce.Do(func() {
		close(j.queue)
		<-j.done
		if n := j.dropped.Load(); n > 0 {
			slog.Warn("rpc journal finished with dropped entries", "dropped", n)
		}
	})
}

// run is the single writer. It owns the file handle exclusively, so no lock is
// needed and the encoder's buffer is never shared.
func (j *Journal) run(file *os.File) {
	defer close(j.done)
	defer func() { _ = file.Close() }()

	enc := json.NewEncoder(file)
	// Without this, encoding/json rewrites the angle brackets of "<redacted>"
	// into their unicode escapes, so every redacted field lands on disk as an
	// unreadable blob. It is valid JSON that parses back to the same string —
	// and the journal exists to be read by a person. Safe to turn off here
	// because every value that could carry markup is redacted before it
	// reaches the encoder.
	enc.SetEscapeHTML(false)
	for e := range j.queue {
		// Resolution is here rather than in the interceptor precisely so a
		// database round-trip cannot land on a request's critical path. The
		// timeout keeps a wedged database from stalling the writer instead.
		ctx, cancel := context.WithTimeout(context.Background(), lookupTimeout)
		e.Actor = j.resolver.Resolve(ctx, e.sub)
		cancel()
		if err := enc.Encode(&e); err != nil {
			// One log, then keep going: a journal that kills the process it
			// is observing is worse than an incomplete journal.
			slog.Warn("rpc journal write failed", "seq", e.Seq, "err", err)
		}
	}
}
