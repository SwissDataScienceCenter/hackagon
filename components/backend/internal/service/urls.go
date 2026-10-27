package service

import (
	"net/url"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// requireHTTPSURL refuses a non-empty value that is not an absolute https URL.
// Empty is allowed: the field is optional.
func requireHTTPSURL(value, label string) error {
	if value == "" {
		return nil
	}

	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return status.Errorf(
			codes.InvalidArgument,
			"invalid %s URL '%s': must be an absolute https URL",
			label,
			value,
		)
	}

	return nil
}
