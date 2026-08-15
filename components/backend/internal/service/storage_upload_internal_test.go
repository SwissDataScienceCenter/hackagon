//go:build test && unittest

package service

import (
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	storageEnts "github.com/swissdatasciencecenter/hackagon/components/backend/internal/proto/storage/entities"
)

// checkContentType is the whole of the upload allowlist, and it is a pure
// function, so it is tested as one — CreateUploadUrl's own specs cover
// authorization and would need an object store configured to get this far.
//
// The refusals assert the MESSAGE, not merely InvalidArgument. There are two
// different refusals in this function — "that type is not accepted" and "that
// filename does not match the type you declared" — and a rejected type whose
// filename carries the matching extension falls into the second one the moment
// the allowlist stops refusing. Two InvalidArguments for opposite reasons look
// identical from a status code alone, so a code-only assertion here would stay
// green with the allowlist gone.
var _ = Describe("checkContentType", func() {
	imageRule := uploadRules[storageEnts.UploadKind_UPLOAD_KIND_HACKATHON_LOGO]
	attachmentRule := uploadRules[storageEnts.UploadKind_UPLOAD_KIND_SUBMISSION_ATTACHMENT]

	refused := func(rule uploadRule, contentType, filename string) string {
		GinkgoHelper()
		ext, err := checkContentType(rule, contentType, filename)
		Expect(err).To(HaveOccurred())
		Expect(ext).To(BeEmpty())
		Expect(status.Convert(err).Code()).To(Equal(codes.InvalidArgument))

		return status.Convert(err).Message()
	}

	// The one the allowlist exists for. Objects are served from the app's own
	// origin at /objects, so a stored SVG is script running as the application:
	// an XSS with a stable URL, uploadable by anyone who may upload a picture.
	It("refuses image/svg+xml wherever an image is accepted", func() {
		Expect(refused(imageRule, "image/svg+xml", "logo.svg")).
			To(ContainSubstring("is not accepted for this kind of upload"))
		Expect(refused(attachmentRule, "image/svg+xml", "diagram.svg")).
			To(ContainSubstring("is not accepted for this kind of upload"))
	})

	It("refuses a document where only images are accepted", func() {
		Expect(refused(imageRule, "application/pdf", "poster.pdf")).
			To(ContainSubstring("is not accepted for this kind of upload"))
	})

	It("refuses a type nobody declared at all", func() {
		Expect(refused(attachmentRule, "application/x-msdownload", "setup.exe")).
			To(ContainSubstring("is not accepted for this kind of upload"))
		Expect(refused(imageRule, "", "mystery")).
			To(ContainSubstring("is not accepted for this kind of upload"))
	})

	// The control. Without it every refusal above would pass just as loudly
	// against a function that accepted nothing.
	It("accepts the image types the product does, and names the canonical extension", func() {
		Expect(checkContentType(imageRule, "image/png", "cover.png")).To(Equal("png"))
		Expect(checkContentType(imageRule, "image/webp", "cover.webp")).To(Equal("webp"))
		Expect(checkContentType(imageRule, "image/gif", "cover.gif")).To(Equal("gif"))
		// jpg is canonical; jpeg is merely accepted from the filename.
		Expect(checkContentType(imageRule, "image/jpeg", "cover.jpeg")).To(Equal("jpg"))
		Expect(checkContentType(attachmentRule, "application/pdf", "slides.pdf")).To(Equal("pdf"))
	})

	It("compares the media type, not the whole header", func() {
		Expect(checkContentType(imageRule, "image/png; charset=binary", "cover.png")).
			To(Equal("png"))
		Expect(checkContentType(imageRule, "  IMAGE/PNG  ", "cover.PNG")).To(Equal("png"))
	})

	It("refuses a filename whose extension contradicts the declared type", func() {
		Expect(refused(imageRule, "image/png", "clip.mov")).
			To(ContainSubstring("does not look like"))
	})

	It("refuses a filename carrying a path", func() {
		Expect(refused(imageRule, "image/png", "../../etc/cover.png")).
			To(ContainSubstring("must not contain a path"))
	})
})
