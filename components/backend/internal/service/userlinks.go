package service

import (
	"fmt"
	"log/slog"
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

// Accept what users actually paste: http(s), any host case, an optional
// subdomain (www., LinkedIn country codes like ch.), a trailing slash and
// a query string or fragment.
var (
	linkedInRe = regexp.MustCompile(
		`(?i)^https?://(?:[a-z]{2,3}\.)?linkedin\.com/in/([\p{L}\p{N}-]{3,100})/?(?:[?#].*)?$`,
	)
	githubRe = regexp.MustCompile(
		`(?i)^https?://(?:www\.)?github\.com/([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/?(?:[?#].*)?$`,
	)
	renkuRe = regexp.MustCompile(
		`(?i)^https?://(?:www\.)?renkulab\.io/u/([A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*)/?(?:[?#].*)?$`,
	)
)

func linkedInUsername(link string) (string, error) {
	link = strings.TrimSpace(link)

	if s, err := url.PathUnescape(link); err == nil {
		link = s
	}

	m := linkedInRe.FindStringSubmatch(link)
	if m == nil {
		return "", fmt.Errorf("url '%s' does not match regexp", link)
	}

	return m[1], nil
}

func githubUsername(link string) (string, error) {
	link = strings.TrimSpace(link)
	m := githubRe.FindStringSubmatch(link)
	if m == nil || len(m[1]) > 39 {
		return "", fmt.Errorf("url '%s' does not match regexp", link)
	}
	return m[1], nil
}

func renkuUsername(link string) (string, error) {
	link = strings.TrimSpace(link)
	m := renkuRe.FindStringSubmatch(link)
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
		slog.Error("Couldn't get LinkedIn username.", "error", err.Error())

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
		slog.Error("Couldn't get GitHub username.", "error", err.Error())

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
		slog.Error("Couldn't get Renku username.", "error", err.Error())

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

	u, err := url.JoinPath(prefix, username)
	if err != nil {
		slog.Error(
			"Could not create link URL.",
			"error",
			err.Error(),
			"prefix",
			prefix,
			"username",
			username,
		)

		return ""
	}

	return u
}
