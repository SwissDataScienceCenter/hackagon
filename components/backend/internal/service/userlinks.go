package service

import (
	"fmt"
	"log/slog"
	"regexp"

	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var (
	linkedInRe = regexp.MustCompile(`^https://linkedin\.com/in/([A-Za-z0-9-]{3,100})/?$`)
	githubRe   = regexp.MustCompile(`^https://github\.com/([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/?$`)
	renkuRe    = regexp.MustCompile(
		`^https://renkulab\.io/u/([A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*)/?$`,
	)
)

func linkedInUsername(url string) (string, error) {
	m := linkedInRe.FindStringSubmatch(url)
	if m == nil {
		return "", fmt.Errorf("url '%s' does not match regexp", url)
	}

	return m[1], nil
}

func githubUsername(url string) (string, error) {
	m := githubRe.FindStringSubmatch(url)
	if m == nil || len(m[1]) > 39 {
		return "", fmt.Errorf("url '%s' does not match regexp", url)
	}
	return m[1], nil
}

func renkuUsername(url string) (string, error) {
	m := renkuRe.FindStringSubmatch(url)
	if m == nil {
		return "", fmt.Errorf("url '%s' does not match regexp", url)
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
