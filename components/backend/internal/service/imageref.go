package service

import (
	"net/url"
	"strings"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// imageRefMessage names both accepted shapes, because a person who pasted the
// wrong thing cannot tell which rule they broke from "invalid".
//
// It must keep the substring "http": the profile page shows the backend's own
// message, and tests/smoke/11-profile.spec.ts asserts on it.
const imageRefMessage = "must be an http or https link, or an uploaded image " +
	"path like /objects/…"

// checkImageRef validates a value that will be interpolated into an <img src>.
//
// Two shapes are legitimate and a third is not:
//
//   - empty, which is how a picture is REMOVED. This is why the check is here
//     rather than a proto `uri: true` constraint — that would refuse the empty
//     string and make removal impossible.
//   - an http/https absolute URL: imagery hosted somewhere else, which stays a
//     legitimate way to point at a picture.
//   - a root-relative path, which is what StorageService hands back for an
//     upload (`/objects/<bucket>/<key>`). It is deliberately relative so one
//     stored value resolves from localhost, from the tunnel and from a
//     deployment alike — an absolute http://localhost:9000/… would work only on
//     the machine that minted it. Rejecting it is what made "upload a profile
//     picture" impossible while the upload itself worked: the presign succeeded,
//     the bytes were stored, and saving the path came back INVALID_ARGUMENT.
//
// Refused: anything with another scheme, because `javascript:` executes and
// `data:` lets one user store an arbitrary payload that other people's browsers
// fetch. And two shapes that LOOK like paths and are not — `//host/x` is
// protocol-relative, and `/\host/x` is the same thing to a browser, which
// normalizes the backslash. Both point at another origin.
func checkImageRef(field, value string) error {
	if value == "" {
		return nil
	}

	if strings.HasPrefix(value, "/") {
		if strings.HasPrefix(value, "//") || strings.HasPrefix(value, `/\`) {
			return status.Errorf(codes.InvalidArgument, "%s %s", field, imageRefMessage)
		}
		for _, r := range value {
			if r < 0x20 || r == 0x7f {
				return status.Errorf(codes.InvalidArgument, "%s %s", field, imageRefMessage)
			}
		}

		return nil
	}

	parsed, err := url.Parse(value)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return status.Errorf(codes.InvalidArgument, "%s %s", field, imageRefMessage)
	}

	return nil
}
