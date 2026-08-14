//go:build test && unittest

package storage

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
)

// Everything here pins a detail that fails SILENTLY when it is wrong: a bad
// signature comes back as 403 SignatureDoesNotMatch with no clue which of the
// dozen inputs was misencoded, and a mis-signed ListObjectsV2 just returns no
// keys — which in DeletePrefix reads as "nothing to delete" and leaves the
// objects behind while reporting success.

func testClient(t *testing.T) *Client {
	t.Helper()
	client, err := New(config.StorageConfig{
		Endpoint:     "http://rustfs:9000",
		Region:       "us-east-1",
		Bucket:       "hackagon-dev",
		AccessKey:    "hackagon-dev",
		SecretKey:    "hackagon-dev-secret",
		UsePathStyle: true,
		PublicPrefix: "/objects",
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	return client
}

func TestURIEncode(t *testing.T) {
	cases := []struct {
		in          string
		encodeSlash bool
		want        string
	}{
		// url.QueryEscape would give "a+b" here, which SigV4 rejects.
		{"a b", false, "a%20b"},
		// Unreserved set survives; everything else does not.
		{"a-_.~z", false, "a-_.~z"},
		{"a/b", false, "a/b"},
		// The one that matters for DeletePrefix: a prefix is a query VALUE,
		// and there its slashes must be encoded or the store computes a
		// different signature and answers with an empty listing.
		{"hackathons/abc/", true, "hackathons%2Fabc%2F"},
		{"+", false, "%2B"},
		{"é", false, "%C3%A9"}, // per UTF-8 byte, not per rune
	}
	for _, c := range cases {
		if got := uriEncode(c.in, c.encodeSlash); got != c.want {
			t.Errorf("uriEncode(%q, %v) = %q, want %q", c.in, c.encodeSlash, got, c.want)
		}
	}
}

func TestCanonicalQuerySortsAndEncodes(t *testing.T) {
	query := url.Values{}
	query.Set("prefix", "hackathons/abc/")
	query.Set("list-type", "2")
	query.Set("X-Amz-Date", "20260807T000000Z")
	query.Set("max-keys", "1000")

	// Byte order, so the uppercase X-Amz-* parameters sort BEFORE the
	// lowercase ones. Getting this backwards is what silently broke a
	// hand-written probe of this same endpoint.
	want := "X-Amz-Date=20260807T000000Z&list-type=2&max-keys=1000&prefix=hackathons%2Fabc%2F"
	if got := canonicalQuery(query); got != want {
		t.Errorf("canonicalQuery =\n  %q\nwant\n  %q", got, want)
	}
}

func TestCanonicalHeaders(t *testing.T) {
	headers := http.Header{}
	headers.Set("Content-Type", "image/webp")
	headers.Set("Host", "rustfs:9000")
	headers.Set("Content-Length", " 42 ") // values are trimmed

	names, block := canonicalHeaders(headers)
	if names != "content-length;content-type;host" {
		t.Errorf("signed names = %q", names)
	}
	want := "content-length:42\ncontent-type:image/webp\nhost:rustfs:9000\n"
	if block != want {
		t.Errorf("header block = %q, want %q", block, want)
	}
}

func TestCanonicalURIPathStyle(t *testing.T) {
	client := testClient(t)
	if got := client.canonicalURI(""); got != "/hackagon-dev" {
		t.Errorf("bucket URI = %q", got)
	}
	if got := client.canonicalURI("a/b.png"); got != "/hackagon-dev/a/b.png" {
		t.Errorf("object URI = %q", got)
	}
}

func TestPresignIsStableAndBindsItsSignedHeaders(t *testing.T) {
	client := testClient(t)
	key := "hackathons/abc/logo/x.webp"

	headers := http.Header{}
	headers.Set("Content-Type", "image/webp")
	at := time.Date(2026, 8, 7, 5, 14, 6, 0, time.UTC)

	uri, query := client.presign(http.MethodPut, key, nil, headers, 15*time.Minute, at)
	if uri != "/hackagon-dev/"+key {
		t.Fatalf("uri = %q", uri)
	}
	if !strings.Contains(query, "X-Amz-Expires=900") {
		t.Errorf("missing expiry; query = %q", query)
	}

	// Same inputs, same signature — a signer that drifted would break uploads
	// only intermittently, which is the hardest form to diagnose.
	_, again := client.presign(http.MethodPut, key, nil, headers, 15*time.Minute, at)
	if query != again {
		t.Error("presign is not deterministic for a fixed clock")
	}

	// A signed header must actually be BOUND to its value, or naming it in
	// SignedHeaders is decoration.
	other := headers.Clone()
	other.Set("Content-Type", "image/png")
	_, changed := client.presign(http.MethodPut, key, nil, other, 15*time.Minute, at)
	if query == changed {
		t.Error("signature did not change with a signed header's value")
	}
}

// The signed-header SET is what an upload is committed to, and every proxy in
// front of the store has to preserve all of it — so this asserts on PresignPut
// itself, not on the low-level signer it happens to call.
//
// Both members are load-bearing: content-type decides how the object is served
// back, and content-length is what refuses an oversized body before it moves.
// Both have been verified to survive the vite proxy, caddy and Cloudflare's
// edge, so dropping either to "make uploads work" is fixing the wrong end — a
// 403 here is a hop rewriting a signed value, and it has always been the HOST.
func TestPresignPutSignsSizeAndType(t *testing.T) {
	client := testClient(t)

	url, _ := client.PresignPut("hackathons/abc/logo/x.webp", "image/webp", 98028, 15*time.Minute)

	if !strings.Contains(url, "X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost") {
		t.Errorf("size and type must both be conditions on the URL; url = %q", url)
	}

	// And the size must be BOUND to its value, or naming it signs nothing.
	// Through presign with a fixed clock rather than two PresignPut calls:
	// X-Amz-Date has second granularity, so two live calls that straddle a
	// second boundary differ for a legitimate reason — that test would pass a
	// few thousand times and then fail once.
	at := time.Date(2026, 8, 7, 5, 14, 6, 0, time.UTC)
	headers := http.Header{}
	headers.Set("Content-Type", "image/webp")
	headers.Set("Content-Length", "98028")
	_, a := client.presign(
		http.MethodPut,
		"hackathons/abc/logo/x.webp",
		nil,
		headers,
		15*time.Minute,
		at,
	)

	bigger := headers.Clone()
	bigger.Set("Content-Length", "98029")
	_, b := client.presign(
		http.MethodPut,
		"hackathons/abc/logo/x.webp",
		nil,
		bigger,
		15*time.Minute,
		at,
	)

	if a == b {
		t.Error("signature did not change with the signed content-length")
	}
}

func TestPublicURLIsRootRelative(t *testing.T) {
	client := testClient(t)
	got := client.PublicURL("hackathons/abc/logo/x.webp")
	// Absolute URLs are the bug this shape exists to prevent: one written as
	// http://localhost:9000/... resolves only on the machine that minted it.
	if got != "/objects/hackagon-dev/hackathons/abc/logo/x.webp" {
		t.Errorf("PublicURL = %q", got)
	}
}

func TestDeletePrefixRefusesUnboundedPrefixes(t *testing.T) {
	client := testClient(t)
	// No network call may happen for either of these: an empty or unterminated
	// prefix matches far more than the caller meant, and this is a delete.
	for _, prefix := range []string{"", "hackathons", "users"} {
		if _, err := client.DeletePrefix(t.Context(), prefix); err == nil {
			t.Errorf("DeletePrefix(%q) was accepted", prefix)
		}
	}
}

func TestNewRejectsIncompleteConfig(t *testing.T) {
	//exhaustruct:ignore
	if _, err := New(config.StorageConfig{Endpoint: "http://rustfs:9000"}); err == nil {
		t.Error("New accepted a config with no bucket or credentials")
	}
	//exhaustruct:ignore
	if _, err := New(config.StorageConfig{
		Endpoint: "rustfs:9000", Bucket: "b", AccessKey: "a", SecretKey: "s",
	}); err == nil {
		t.Error("New accepted an endpoint with no scheme")
	}
}
