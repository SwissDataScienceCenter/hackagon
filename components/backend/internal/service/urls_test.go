//go:build test && unittest

package service

import (
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestRequireHTTPSURL(t *testing.T) {
	cases := []struct {
		in string
		ok bool
	}{
		{"", true},
		{"https://github.com/octo-cat/repo", true},
		{"HTTPS://drive.example.com/folder?id=1#x", true},
		{"http://github.com/octo-cat/repo", false},
		{"ftp://example.com/file", false},
		{"javascript:alert(1)", false},
		{"github.com/octo-cat/repo", false},
		{"/relative/path", false},
		{"https://", false},
		{"https:github.com", false},
		{" https://github.com/octo-cat/repo", false},
	}

	for _, c := range cases {
		err := requireHTTPSURL(c.in, "test")
		if c.ok && err != nil {
			t.Errorf("requireHTTPSURL(%q) = %v, want nil", c.in, err)
		}
		if !c.ok && status.Code(err) != codes.InvalidArgument {
			t.Errorf("requireHTTPSURL(%q) = %v, want InvalidArgument", c.in, err)
		}
	}
}
