package service

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	LinkedInPrefix = "https://linkedin.com/in/"
	GithubPrefix   = "https://github.com/"
	RenkuPrefix    = "https://renkulab.io/u/"
)

var (
	linkedInRe = regexp.MustCompile(
		`(?i)^https?://(?:[a-z]{2,3}\.)?linkedin\.com/in/([\p{L}\p{N}-]{3,100})/?(?:[?#].*)?$`,
	)
	githubRe = regexp.MustCompile(
		`(?i)^https?://(?:www\.)?github\.com/([A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?)/?(?:[?#].*)?$`,
	)
	renkuRe = regexp.MustCompile(
		`(?i)^https?://(?:www\.)?renkulab\.io/u/([A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?)/?(?:[?#].*)?$`,
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

func updateLinkedin(updateQuery *ent.UserUpdateOne, req *string) (*ent.UserUpdateOne, error) {
	if req == nil {
		return updateQuery, nil
	}

	var username string
	if *req == "" {
		username = *req
	} else if u, err := linkedInUsername(*req); err == nil {
		username = u
	} else {
		return nil, status.Errorf(
			codes.InvalidArgument,
			"invalid LinkedIn URL '%s'",
			*req,
		)
	}

	return updateQuery.SetLinkedin(username), nil
}

func updateGithub(updateQuery *ent.UserUpdateOne, req *string) (*ent.UserUpdateOne, error) {
	if req == nil {
		return updateQuery, nil
	}

	var username string
	if *req == "" {
		username = *req
	} else if u, err := githubUsername(*req); err == nil {
		username = u
	} else {
		return nil, status.Errorf(
			codes.InvalidArgument,
			"invalid GitHub URL '%s'",
			*req,
		)
	}

	return updateQuery.SetGithub(username), nil
}

func updateRenku(updateQuery *ent.UserUpdateOne, req *string) (*ent.UserUpdateOne, error) {
	if req == nil {
		return updateQuery, nil
	}

	var username string
	if *req == "" {
		username = *req
	} else if u, err := renkuUsername(*req); err == nil {
		username = u
	} else {
		return nil, status.Errorf(
			codes.InvalidArgument,
			"invalid Renku URL '%s'",
			*req,
		)
	}

	return updateQuery.SetRenku(username), nil
}

func renderLinkedinURL(username string) string {
	return renderLink(LinkedInPrefix, username)
}

func renderGithubURL(username string) string {
	return renderLink(GithubPrefix, username)
}

func renderRenkuURL(username string) string {
	return renderLink(RenkuPrefix, username)
}

func renderLink(prefix, username string) string {
	if username == "" {
		return ""
	}

	return prefix + url.PathEscape(username)
}
