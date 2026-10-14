package service

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	linkedInPrefix = "https://linkedin.com/in/"
	githubPrefix   = "https://github.com/"
	renkuPrefix    = "https://renkulab.io/u/"
)

var (
	linkedInRe = regexp.MustCompile(
		`(?i)^https?://(?:[a-z]{2,3}\.)?linkedin\.com/in/([\p{L}\p{N}-]{3,100})/?(?:[?#].*)?$`,
	)
	githubRe = regexp.MustCompile(
		`(?i)^https?://(?:www\.)?github\.com/([a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?)/?(?:[?#].*)?$`,
	)
	renkuRe = regexp.MustCompile(
		`(?i)^https?://(?:www\.)?renkulab\.io/u/([a-z0-9](?:[a-z0-9._-]{0,98}[a-z0-9])?)/?(?:[?#].*)?$`,
	)
)

func linkedInUsername(link string) (string, error) {
	// We need to PathUnescape because LinkedIn allows some non-ASCII characters for usernames.
	if s, err := url.PathUnescape(link); err == nil {
		link = s
	}

	return parseLink(linkedInRe, link)
}

func githubUsername(link string) (string, error) {
	return parseLink(githubRe, link)
}

func renkuUsername(link string) (string, error) {
	return parseLink(renkuRe, link)
}

func parseLink(re *regexp.Regexp, link string) (string, error) {
	link = strings.TrimSpace(link)

	m := re.FindStringSubmatch(link)
	if m == nil {
		return "", fmt.Errorf("url '%s' does not match regexp", link)
	}

	return m[1], nil
}

// linkUsername turns an optional link from a request into the username to
// store.
func linkUsername(
	parse func(string) (string, error),
	link *string,
	label string,
) (*string, error) {
	if link == nil {
		//nolint:nilnil // This is not an error. Returning nil,nil is the expected behavior.
		return nil, nil
	}
	trimmed := strings.TrimSpace(*link)
	if trimmed == "" {
		return &trimmed, nil
	}

	username, err := parse(*link)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid %s URL '%s'", label, *link)
	}

	return &username, nil
}

func renderLinkedinURL(username string) string {
	return renderLink(linkedInPrefix, username)
}

func renderGithubURL(username string) string {
	return renderLink(githubPrefix, username)
}

func renderRenkuURL(username string) string {
	return renderLink(renkuPrefix, username)
}

func renderLink(prefix, username string) string {
	if username == "" {
		return ""
	}

	return prefix + url.PathEscape(username)
}
