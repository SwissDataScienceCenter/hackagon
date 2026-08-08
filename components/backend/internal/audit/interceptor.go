package audit

import (
	"context"
	"encoding/json"
	"log/slog"
	"regexp"
	"strings"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/middleware"
	"google.golang.org/grpc"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// UnaryServerInterceptor journals every unary call that reaches it.
//
// Chain it AFTER the auth interceptor — it reads the JWT subject that auth
// puts in the context — and BEFORE validation, so a request rejected by
// protovalidate is journalled as InvalidArgument rather than vanishing. The
// one thing it therefore cannot see is a call auth itself rejected (an
// invalid or expired token), which is a transport failure and not an action
// anybody took.
//
// Returns nil when j is nil, and grpc.ChainUnaryInterceptor tolerates being
// handed nothing — so a disabled journal costs exactly one nil check at
// startup and nothing per request.
func UnaryServerInterceptor(j *Journal) grpc.UnaryServerInterceptor {
	if j == nil {
		return nil
	}

	return func(
		ctx context.Context,
		req any,
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (any, error) {
		resp, err := handler(ctx, req)
		// Everything below is bookkeeping. It runs after the handler, it
		// cannot change what is returned, and a panic in it must not reach
		// the caller — journalling is never a reason for an RPC to fail.
		func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Warn("rpc journal entry panicked; call was unaffected",
						"method", info.FullMethod, "panic", r)
				}
			}()
			j.Record(entryFor(ctx, req, resp, err, info.FullMethod))
		}()

		return resp, err
	}
}

func entryFor(
	ctx context.Context,
	req any,
	resp any,
	err error,
	fullMethod string,
) Entry {
	// The subject only — no peer address is read, no metadata beyond what
	// auth already parsed, and the subject itself never reaches the file
	// (the writer resolves it to a username first).
	sub, _ := middleware.GetSubject(ctx)

	return Entry{
		Seq:      0, // assigned by Record
		Ts:       "",
		Actor:    "", // resolved by the writer
		Method:   RecipeMethod(fullMethod),
		Params:   paramsOf(req),
		Expect:   expectOf(err),
		Produced: producedIDs(resp),
		sub:      sub,
	}
}

// RecipeMethod turns grpc's "/pkg.Service/Method" into the recipe's
// "pkg.Service/Method".
func RecipeMethod(fullMethod string) string {
	return strings.TrimPrefix(fullMethod, "/")
}

func paramsOf(req any) map[string]any {
	msg, ok := req.(proto.Message)
	if !ok {
		return map[string]any{}
	}
	params, err := RedactMessage(msg)
	if err != nil {
		// Redaction failed, so nothing about this request is known to be
		// safe. Record the fact, not the request.
		return map[string]any{"_error": "could not redact request"}
	}

	return params
}

func expectOf(err error) map[string]any {
	if err == nil {
		return map[string]any{"ok": true}
	}

	// status.Code().String() is exactly the spelling recipe.jsonl uses in
	// expect.error ("PermissionDenied", "NotFound", ...), which is also what
	// grpcurl prints — so a journalled failure and a hand-written one compare
	// character for character.
	return map[string]any{"error": status.Code(err).String()}
}

// ─── Response ids ────────────────────────────────────────────────────────────

// idKey matches the JSON name of a field that holds an object identifier:
// exactly "id", or a lowerCamel name ending in "Id".
var idKey = regexp.MustCompile(`^(id|[a-z][A-Za-z0-9]*Id)$`)

// uuidValue matches a canonical UUID, which is the only value shape accepted
// as an id.
var uuidValue = regexp.MustCompile(
	`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`,
)

// foreignID: names that pass idKey but identify a PERSON in another system
// rather than an object in this one.
//
// `keycloakId` is on WhoAmI's and Register's responses. It is the JWT subject
// — precisely the value the actor field exists to keep off disk — and it is
// UUID-shaped, so the rule above would record it verbatim. This bit the first
// capture run: every persona's Keycloak ID was journalled next to their
// username, which is the one join nobody may make from this file.
//
//nolint:gochecknoglobals // policy set, same as `keep` in redact.go.
var foreignID = newSet("keycloakId")

const (
	maxIDDepth = 3
	maxIDs     = 24
)

// producedIDs is the ONLY thing this package ever reads out of a response: the
// UUIDs sitting under id-shaped keys, keyed by their dot-path so the path can
// be reused verbatim as a recipe `save` expression ("hackathonId",
// "voteCategory.id").
//
// Everything else in the response — names, prose, profile fields, tokens — is
// not inspected, not copied and not written. There is no allowlist to get
// wrong here because there is no path by which a non-UUID value can be
// recorded: the key must look like an id AND the value must be a UUID.
func producedIDs(resp any) map[string]string {
	msg, ok := resp.(proto.Message)
	if !ok || msg == nil {
		return nil
	}
	raw, err := protojson.Marshal(msg)
	if err != nil {
		return nil
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil
	}
	out := make(map[string]string)
	collectIDs("", decoded, 1, out)
	if len(out) == 0 {
		return nil
	}

	return out
}

func collectIDs(prefix string, node map[string]any, depth int, out map[string]string) {
	if depth > maxIDDepth || len(out) >= maxIDs {
		return
	}
	for k, v := range node {
		path := k
		if prefix != "" {
			path = prefix + "." + k
		}
		switch t := v.(type) {
		case string:
			if idKey.MatchString(k) && !foreignID.has(k) &&
				uuidValue.MatchString(t) && len(out) < maxIDs {
				out[path] = t
			}
		case map[string]any:
			collectIDs(path, t, depth+1, out)
		default:
			// Lists are skipped on purpose: an id inside a repeated field has
			// no stable path to save from, and listing responses are exactly
			// where a bulk of unrelated ids would come from.
		}
	}
}
