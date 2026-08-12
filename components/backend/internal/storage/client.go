// Package storage talks to the S3-compatible object store that holds uploaded
// files (docs/storage.md). It does three things and no more:
//
//   - mint presigned URLs, so the browser uploads and downloads directly and
//     the file never passes through the app server;
//   - delete every object under a prefix, which is how a deleted hackathon or
//     a deleted account takes its images with it;
//   - list what is under a prefix, which is what lets a picker offer an image
//     that is already there instead of a second copy of it.
//
// Bytes never flow through this package either — the listing and the delete are
// the only things here that open a socket at all.
package storage

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/swissdatasciencecenter/hackagon/components/backend/internal/config"
)

var (
	// ErrUnsafePrefix guards DeletePrefix against the one mistake that cannot
	// be undone: an empty or unterminated prefix matches the whole bucket.
	ErrUnsafePrefix = errors.New("refusing to delete an unbounded prefix")
	// ErrIncompleteConfig is returned by New when the endpoint, bucket or
	// credentials are missing.
	ErrIncompleteConfig = errors.New("incomplete storage configuration")
)

const (
	// backendTTL is how long the signatures this process issues to ITSELF stay
	// valid. They are used within milliseconds; the window only has to survive
	// clock skew between the backend and the store.
	backendTTL = 1 * time.Minute
	// listPageSize is the ListObjectsV2 page size, capped by S3 at 1000.
	listPageSize = 1000
	// listPageLimit bounds the pagination loop. A store that kept returning a
	// continuation token with no keys would otherwise spin forever, and this
	// runs inside a delete handler.
	listPageLimit       = 1000
	httpTimeout         = 30 * time.Second
	defaultPublicPrefix = "/objects"
)

// Client is safe for concurrent use.
type Client struct {
	// signHost is the Host value baked into every signature. It is the object
	// store's own hostname, NOT the hostname the browser used: uploads and
	// downloads go through the app's /objects proxy, and both proxies in this
	// repo rewrite Host to the upstream (vite's `changeOrigin`, and caddy's
	// `header_up Host` in .devcontainer/Caddyfile.tunnel). Getting that wrong
	// shows up as SignatureDoesNotMatch and nothing else.
	signHost     string
	directBase   string
	publicPrefix string
	region       string
	bucket       string
	accessKey    string
	secretKey    string
	pathStyle    bool
	http         *http.Client
}

// New builds a client from configuration. It performs no I/O, so a store that
// is down does not stop the backend from starting — the failure surfaces on the
// first upload instead, which is where someone can act on it.
func New(cfg config.StorageConfig) (*Client, error) {
	if cfg.Endpoint == "" || cfg.Bucket == "" || cfg.AccessKey == "" || cfg.SecretKey == "" {
		return nil, fmt.Errorf(
			"%w: endpoint, bucket, accesskey and secretkey are all required",
			ErrIncompleteConfig,
		)
	}

	endpoint, err := url.Parse(strings.TrimSuffix(cfg.Endpoint, "/"))
	if err != nil {
		return nil, fmt.Errorf("parse storage endpoint %q: %w", cfg.Endpoint, err)
	}
	if endpoint.Scheme == "" || endpoint.Host == "" {
		return nil, fmt.Errorf("%w: endpoint %q needs a scheme and a host",
			ErrIncompleteConfig, cfg.Endpoint)
	}

	signHost := endpoint.Host
	if !cfg.UsePathStyle {
		signHost = cfg.Bucket + "." + endpoint.Host
	}

	region := cfg.Region
	if region == "" {
		region = "us-east-1"
	}

	prefix := strings.TrimSuffix(cfg.PublicPrefix, "/")
	if prefix == "" {
		prefix = defaultPublicPrefix
	}

	return &Client{
		signHost:     signHost,
		directBase:   endpoint.Scheme + "://" + signHost,
		publicPrefix: prefix,
		region:       region,
		bucket:       cfg.Bucket,
		accessKey:    cfg.AccessKey,
		secretKey:    cfg.SecretKey,
		pathStyle:    cfg.UsePathStyle,
		http:         &http.Client{Timeout: httpTimeout}, //exhaustruct:ignore
	}, nil
}

// canonicalURI is the path SigV4 signs and the store sees. Path-style keeps the
// bucket in the path; virtual-hosted style moved it into the hostname already.
func (c *Client) canonicalURI(key string) string {
	if !c.pathStyle {
		if key == "" {
			return "/"
		}

		return "/" + uriEncode(key, false)
	}
	if key == "" {
		return "/" + uriEncode(c.bucket, false)
	}

	return "/" + uriEncode(c.bucket, false) + "/" + uriEncode(key, false)
}

// PublicURL is the stable, never-expiring path a public object is readable at.
// This is the value that belongs in the database.
func (c *Client) PublicURL(key string) string {
	return c.publicPrefix + c.canonicalURI(key)
}

// browserURL is same-origin and root-relative on purpose: one stored or handed
// out value resolves from localhost, from the Cloudflare tunnel and from a
// deployment. An absolute http://localhost:9000/... would work only on the
// machine that minted it.
func (c *Client) browserURL(uri, rawQuery string) string {
	return c.publicPrefix + uri + "?" + rawQuery
}

func (c *Client) directURL(uri, rawQuery string) string {
	return c.directBase + uri + "?" + rawQuery
}

// PresignPut returns a URL the browser may PUT exactly `sizeBytes` bytes of
// exactly `contentType` to, and the moment it stops working.
//
// Both of those are signed headers, which is what makes them CONDITIONS rather
// than hopes: the store recomputes the signature over the headers it actually
// received, so a body of a different length or a different declared type is
// refused at the authentication stage — before the bytes are stored, and for an
// oversized file, before most of them are even sent.
//
// Content-Type also has to be signed for a duller reason: whatever the client
// sends is what the object is stored as, and a browser that sends none stores
// images as application/x-www-form-urlencoded and then refuses to render them.
//
// Signing these makes every proxy between the browser and the store part of the
// contract, and that is where uploads actually break. A 403
// SignatureDoesNotMatch means some hop changed a signed value — in practice the
// HOST header, which a reverse proxy passes through by default while the
// signature names the store's own hostname. See the Host rewrite in
// .devcontainer/Caddyfile.tunnel and `changeOrigin` in vite.config.ts; both
// exist for this and their absence is invisible on public reads, which are
// unsigned and keep working.
//
// (Content-Length has been verified to survive both of those proxies and
// Cloudflare's edge, so it stays signed. It was once suspected of being
// re-chunked away and is not.)
func (c *Client) PresignPut(
	key, contentType string,
	sizeBytes int64,
	ttl time.Duration,
) (string, time.Time) {
	now := time.Now()
	headers := http.Header{}
	headers.Set("Content-Type", contentType)
	headers.Set("Content-Length", strconv.FormatInt(sizeBytes, 10))

	uri, rawQuery := c.presign(http.MethodPut, key, nil, headers, ttl, now)

	return c.browserURL(uri, rawQuery), now.Add(ttl)
}

// PresignGet returns a short-lived read URL for a private object.
func (c *Client) PresignGet(key string, ttl time.Duration) (string, time.Time) {
	now := time.Now()
	uri, rawQuery := c.presign(http.MethodGet, key, nil, nil, ttl, now)

	return c.browserURL(uri, rawQuery), now.Add(ttl)
}

// DeletePrefix removes every object whose key starts with prefix and returns
// how many went. Callers are the two delete handlers; per docs/storage.md they
// run it AFTER the database commit and log rather than fail when it errors.
//
// ListObjectsV2 then one DELETE per key, rather than the batch DeleteObjects
// call: the batch form posts an XML body that S3 requires a Content-MD5 (or a
// checksum header) for, and the exact requirement varies between
// implementations. Individual deletes are the same request the rest of this
// file already makes and cannot be got subtly wrong. The counts here are tens
// of objects per event, not millions.
func (c *Client) DeletePrefix(ctx context.Context, prefix string) (int, error) {
	if prefix == "" || !strings.HasSuffix(prefix, "/") {
		return 0, fmt.Errorf("%w: %q", ErrUnsafePrefix, prefix)
	}

	deleted := 0
	token := ""
	for page := 0; page < listPageLimit; page++ {
		objects, next, err := c.ListPrefix(ctx, prefix, token, listPageSize)
		if err != nil {
			return deleted, err
		}
		for _, obj := range objects {
			// Belt and braces: the store answered the prefix we asked for, but
			// this is a delete loop and the cost of checking is nothing.
			if !strings.HasPrefix(obj.Key, prefix) {
				continue
			}
			if err := c.deleteObject(ctx, obj.Key); err != nil {
				return deleted, err
			}
			deleted++
		}
		if next == "" {
			return deleted, nil
		}
		token = next
	}

	return deleted, fmt.Errorf("%w: more than %d pages under %q",
		ErrUnsafePrefix, listPageLimit, prefix)
}

// ObjectInfo is one row of a listing: what the store knows about an object
// without fetching it. There is no content type here, and that is the store's
// limitation rather than a choice — ListObjectsV2 does not report one, and a
// HEAD per object to find out would turn one request into hundreds.
type ObjectInfo struct {
	Key       string
	SizeBytes int64
	// LastModified is the zero time when the store reported a timestamp this
	// package could not parse. Callers sort by it, so a zero sorts oldest
	// rather than crashing a comparison.
	LastModified time.Time
}

// ListPrefix returns up to maxKeys objects under prefix, plus the continuation
// token for the next page ("" when there is none).
//
// Unlike DeletePrefix this does NOT insist on a trailing slash: an empty prefix
// is a legitimate whole-bucket listing, and the destructive-mistake this guards
// against there simply does not exist for a read. The BOUND is the caller's
// business — nothing here loops.
func (c *Client) ListPrefix(
	ctx context.Context,
	prefix, token string,
	maxKeys int,
) ([]ObjectInfo, string, error) {
	if maxKeys <= 0 || maxKeys > listPageSize {
		maxKeys = listPageSize
	}

	query := url.Values{}
	query.Set("list-type", "2")
	query.Set("prefix", prefix)
	query.Set("max-keys", strconv.Itoa(maxKeys))
	if token != "" {
		query.Set("continuation-token", token)
	}

	body, err := c.do(ctx, http.MethodGet, "", query)
	if err != nil {
		return nil, "", err
	}

	var result listBucketResult
	if err := xml.Unmarshal(body, &result); err != nil {
		return nil, "", fmt.Errorf("parse ListObjectsV2 response: %w", err)
	}

	objects := make([]ObjectInfo, 0, len(result.Contents))
	for _, item := range result.Contents {
		objects = append(objects, ObjectInfo{
			Key:          item.Key,
			SizeBytes:    item.Size,
			LastModified: parseListTime(item.LastModified),
		})
	}

	next := ""
	if result.IsTruncated {
		next = result.NextContinuationToken
	}

	return objects, next, nil
}

// listBucketResult is the subset of the ListObjectsV2 response we read. The
// XML carries etags and owners too; neither matters to a purge or a gallery.
type listBucketResult struct {
	XMLName               xml.Name `xml:"ListBucketResult"`
	IsTruncated           bool     `xml:"IsTruncated"`
	NextContinuationToken string   `xml:"NextContinuationToken"`
	Contents              []struct {
		Key string `xml:"Key"`
		// Kept as a string and parsed by hand rather than as a time.Time:
		// encoding/xml accepts ONLY RFC 3339, and a store that answers in any
		// other shape would fail the whole unmarshal — losing the keys too,
		// over a field that is only used to sort. See parseListTime.
		LastModified string `xml:"LastModified"`
		Size         int64  `xml:"Size"`
	} `xml:"Contents"`
}

// listTimeFormats are the shapes an S3 listing has been seen to use. The first
// is what the specification says and what both S3 and rustfs emit; the rest are
// there so an unusual store degrades to "no timestamp" for one object instead
// of an error for the request.
var listTimeFormats = []string{
	time.RFC3339Nano,
	time.RFC3339,
	"2006-01-02T15:04:05.000Z",
	"2006-01-02T15:04:05Z",
}

func parseListTime(value string) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}
	}
	for _, layout := range listTimeFormats {
		if t, err := time.Parse(layout, value); err == nil {
			return t
		}
	}

	return time.Time{}
}

func (c *Client) deleteObject(ctx context.Context, key string) error {
	_, err := c.do(ctx, http.MethodDelete, key, nil)

	return err
}

// do issues one presigned request from this process. Only `host` is signed, and
// net/http sets it from the URL, so the request it sends is exactly the one the
// signature covers.
func (c *Client) do(
	ctx context.Context,
	method, key string,
	query url.Values,
) ([]byte, error) {
	uri, rawQuery := c.presign(method, key, query, nil, backendTTL, time.Now())

	req, err := http.NewRequestWithContext(ctx, method, c.directURL(uri, rawQuery), nil)
	if err != nil {
		return nil, fmt.Errorf("build %s request: %w", method, err)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%s %s: %w", method, key, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read %s response: %w", method, err)
	}

	// 404 on a DELETE is the state the caller wanted; S3 answers 204 either
	// way, but not every implementation does.
	if resp.StatusCode == http.StatusNotFound && method == http.MethodDelete {
		return body, nil
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("%s %s: %w", method, key, statusError(resp.StatusCode, body))
	}

	return body, nil
}

type storeError struct {
	status int
	body   string
}

func (e *storeError) Error() string {
	return fmt.Sprintf("object store returned %d: %s", e.status, e.body)
}

func statusError(status int, body []byte) error {
	const maxBody = 512
	text := strings.TrimSpace(string(body))
	if len(text) > maxBody {
		text = text[:maxBody]
	}

	return &storeError{status: status, body: text}
}
