//go:build test && unittest

package service

import "testing"

func TestLinkUsernames(t *testing.T) {
	cases := []struct {
		parse func(string) (string, error)
		in    string
		want  string // "" means the URL must be rejected
	}{
		{linkedInUsername, "https://linkedin.com/in/jane-doe", "jane-doe"},
		{linkedInUsername, "https://www.linkedin.com/in/jane-doe/", "jane-doe"},
		{linkedInUsername, "https://ch.linkedin.com/in/jane-doe/?originalSubdomain=ch", "jane-doe"},
		{linkedInUsername, "  HTTP://WWW.LinkedIn.com/in/jane-doe#about ", "jane-doe"},
		{linkedInUsername, "https://www.linkedin.com/in/j%C3%B6rg-m%C3%BCller/", "jörg-müller"},
		{linkedInUsername, "https://www.linkedin.com/in/jörg-müller", "jörg-müller"},
		{linkedInUsername, "https://evil.com/linkedin.com/in/jane", ""},
		{linkedInUsername, "https://www.linkedin.com/company/sdsc", ""},
		{linkedInUsername, "https://www.linkedin.com/in/jane/details", ""},
		{githubUsername, "https://github.com/octo-cat", "octo-cat"},
		{githubUsername, "https://www.github.com/octo-cat/?tab=repositories", "octo-cat"},
		{githubUsername, "http://GitHub.com/octo-cat", "octo-cat"},
		{githubUsername, "https://github.com/octo-cat/repo", ""},
		{githubUsername, "https://github.com/-bad", ""},
		{githubUsername, "https://notgithub.com/octo-cat", ""},
		{renkuUsername, "https://renkulab.io/u/jane.doe", "jane.doe"},
		{renkuUsername, "https://renkulab.io/u/jane.doe/?x=1", "jane.doe"},
		{renkuUsername, "https://renkulab.io/u/jane/projects", ""},
	}
	for _, c := range cases {
		got, err := c.parse(c.in)
		if c.want == "" {
			if err == nil {
				t.Errorf("%q: want error, got %q", c.in, got)
			}
		} else if err != nil || got != c.want {
			t.Errorf("%q: want %q, got %q (err %v)", c.in, c.want, got, err)
		}
	}
}
