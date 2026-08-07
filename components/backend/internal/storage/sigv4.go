package storage

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// AWS Signature Version 4, query-string ("presigned") flavour.
//
// Hand-rolled rather than pulled from aws-sdk-go-v2 on purpose. The whole of
// what this file needs is four HMACs and a string built in a fixed order, the
// algorithm is already proven against THIS server in
// .devcontainer/rustfs-init.sh, and adding the SDK would drag ~15 modules into
// go.mod — which in this repo also means recomputing the fixed-output
// `vendorHash` in components/backend/tools/nix/pkgs/service/default.nix on
// every dependency bump.
const (
	algorithm       = "AWS4-HMAC-SHA256"
	terminator      = "aws4_request"
	service         = "s3"
	unsignedPayload = "UNSIGNED-PAYLOAD"
	amzDateLayout   = "20060102T150405Z"
	dateLayout      = "20060102"

	// MaxPresignTTL is the ceiling SigV4 itself imposes on X-Amz-Expires.
	MaxPresignTTL = 7 * 24 * time.Hour
)

// uriEncode percent-encodes per RFC 3986, which is what SigV4 canonicalization
// wants and what neither url.QueryEscape (space becomes '+') nor url.PathEscape
// (leaves sub-delims alone) actually does.
//
// Byte-wise, not rune-wise: multi-byte UTF-8 is encoded one octet at a time,
// which is the required behaviour.
func uriEncode(s string, encodeSlash bool) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := range len(s) {
		c := s[i]
		switch {
		case (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
			(c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~':
			b.WriteByte(c)
		case c == '/' && !encodeSlash:
			b.WriteByte('/')
		default:
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}

	return b.String()
}

// canonicalQuery sorts parameters by name (then by value for repeats) and
// encodes both halves. '/' IS encoded here, unlike in the path.
func canonicalQuery(v url.Values) string {
	names := make([]string, 0, len(v))
	for name := range v {
		names = append(names, name)
	}
	sort.Strings(names)

	parts := make([]string, 0, len(v))
	for _, name := range names {
		values := append([]string(nil), v[name]...)
		sort.Strings(values)
		for _, value := range values {
			parts = append(parts, uriEncode(name, true)+"="+uriEncode(value, true))
		}
	}

	return strings.Join(parts, "&")
}

// canonicalHeaders returns the ';'-joined signed header names and the
// name:value block. The block ends in a newline, which the canonical request
// then follows with another one — that blank line is part of the format.
//
// Every header named here becomes a CONDITION on the signature: the store
// recomputes the signature over the values it actually received, so a request
// that changes one of them is rejected. That is the mechanism behind the
// content-type and size limits — see Client.PresignPut.
func canonicalHeaders(h http.Header) (string, string) {
	names := make([]string, 0, len(h))
	for name := range h {
		names = append(names, strings.ToLower(name))
	}
	sort.Strings(names)

	var block strings.Builder
	for _, name := range names {
		// http.Header canonicalizes keys on Set/Add, so read through Get
		// rather than indexing with the lowercased name.
		block.WriteString(name)
		block.WriteByte(':')
		block.WriteString(strings.TrimSpace(h.Get(name)))
		block.WriteByte('\n')
	}

	return strings.Join(names, ";"), block.String()
}

func hmacSHA256(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))

	return mac.Sum(nil)
}

func sha256Hex(data string) string {
	sum := sha256.Sum256([]byte(data))

	return hex.EncodeToString(sum[:])
}

// signingKey derives the date/region/service-scoped key. Each HMAC feeds the
// next, so the ladder is exactly four calls.
func (c *Client) signingKey(datestamp string) []byte {
	k := hmacSHA256([]byte("AWS4"+c.secretKey), datestamp)
	k = hmacSHA256(k, c.region)
	k = hmacSHA256(k, service)

	return hmacSHA256(k, terminator)
}

// presign computes the canonical URI and the fully signed query string for one
// request. It never touches the network — callers turn the pair into either a
// browser-facing URL (Client.browserURL) or a direct one (Client.directURL).
//
// `signed` names the headers the caller commits the request to; `host` is added
// here because SigV4 requires it and because it is the one header a proxy in
// front of the store will rewrite.
func (c *Client) presign(
	method, key string,
	extra url.Values,
	signed http.Header,
	ttl time.Duration,
	now time.Time,
) (string, string) {
	now = now.UTC()
	amzDate := now.Format(amzDateLayout)
	datestamp := now.Format(dateLayout)
	scope := strings.Join([]string{datestamp, c.region, service, terminator}, "/")

	headers := http.Header{}
	for name, values := range signed {
		for _, value := range values {
			headers.Add(name, value)
		}
	}
	// Not http.Header.Set("Host", …): net/http gives "Host" no special
	// treatment in a plain Header map, so this is an ordinary entry here and
	// only becomes the real Host header on the wire.
	headers.Set("Host", c.signHost)
	signedNames, headerBlock := canonicalHeaders(headers)

	query := url.Values{}
	for name, values := range extra {
		for _, value := range values {
			query.Add(name, value)
		}
	}
	query.Set("X-Amz-Algorithm", algorithm)
	query.Set("X-Amz-Credential", c.accessKey+"/"+scope)
	query.Set("X-Amz-Date", amzDate)
	query.Set("X-Amz-Expires", strconv.Itoa(int(ttl.Seconds())))
	query.Set("X-Amz-SignedHeaders", signedNames)

	uri := c.canonicalURI(key)
	rawQuery := canonicalQuery(query)

	canonicalRequest := strings.Join([]string{
		method, uri, rawQuery, headerBlock, signedNames, unsignedPayload,
	}, "\n")
	stringToSign := strings.Join([]string{
		algorithm, amzDate, scope, sha256Hex(canonicalRequest),
	}, "\n")
	signature := hex.EncodeToString(hmacSHA256(c.signingKey(datestamp), stringToSign))

	return uri, rawQuery + "&X-Amz-Signature=" + signature
}
