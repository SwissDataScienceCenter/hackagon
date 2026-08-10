//go:build test && unittest

package service

import (
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

// The <img src> rule as the pure function it is. Worth its own spec because two
// of its cases are the ones that get written wrong: the root-relative path an
// upload produces (rejecting it made "change my profile picture" impossible
// while the upload itself worked), and the two shapes that look like paths and
// point at another origin.

var _ = Describe("checkImageRef", func() {
	It("accepts empty, which is how a picture is removed", func() {
		Expect(checkImageRef("avatar_url", "")).To(Succeed())
	})

	It("accepts an http or https link", func() {
		Expect(checkImageRef("avatar_url", "https://example.org/me.png")).To(Succeed())
		Expect(checkImageRef("avatar_url", "http://example.org/me.png")).To(Succeed())
	})

	It("accepts the root-relative path StorageService mints", func() {
		Expect(checkImageRef("avatar_url",
			"/objects/hackagon/users/1/avatar/2.webp")).To(Succeed())
	})

	It("refuses a scheme that executes or embeds a payload", func() {
		Expect(checkImageRef("avatar_url", "javascript:alert(1)")).NotTo(Succeed())
		Expect(checkImageRef("avatar_url", "data:image/svg+xml;base64,AAA")).NotTo(Succeed())
		Expect(checkImageRef("avatar_url", "ftp://example.org/me.png")).NotTo(Succeed())
	})

	It("refuses the two shapes that look like paths and are not", func() {
		// Protocol-relative, and the same thing again once a browser
		// normalizes the backslash. Both fetch from another origin.
		Expect(checkImageRef("avatar_url", "//evil.example/me.png")).NotTo(Succeed())
		Expect(checkImageRef("avatar_url", `/\evil.example/me.png`)).NotTo(Succeed())
	})

	It("refuses a control character smuggled into a path", func() {
		Expect(checkImageRef("avatar_url", "/objects/a\nb.webp")).NotTo(Succeed())
	})

	It("says which shapes are allowed, and keeps saying http", func() {
		// The profile page surfaces this message verbatim.
		err := checkImageRef("avatar_url", "javascript:alert(1)")
		Expect(err).To(MatchError(ContainSubstring("http")))
		Expect(err).To(MatchError(ContainSubstring("/objects/")))
	})
})
