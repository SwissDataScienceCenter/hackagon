//go:build test && unittest

package service

import (
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	objstore "github.com/swissdatasciencecenter/hackagon/components/backend/internal/storage"
)

// The three pure decisions ListObjects makes, as the functions they are. Each
// one fails SILENTLY when it is wrong — a gallery still renders, it just shows
// the wrong things in the wrong order, or repeats a row on page two — so they
// are pinned here rather than left to be noticed.

var _ = Describe("isListableImage", func() {
	It("keeps every extension the uploader accepts", func() {
		// Derived from imageTypes, so this is a check that the derivation is
		// wired up, not a restatement of the list: an image type the uploader
		// accepts and the picker cannot show is a picture that vanishes.
		for contentType, exts := range imageTypes {
			for _, ext := range exts {
				Expect(isListableImage("site/media/a."+ext)).
					To(BeTrue(), "%s (%s) should be listable", ext, contentType)
			}
		}
	})

	It("is case-insensitive about the extension", func() {
		Expect(isListableImage("site/media/HOLIDAY.PNG")).To(BeTrue())
	})

	It("drops what is not a picture", func() {
		// The one that actually exists: rustfs-init.sh writes a probe under
		// every public prefix to prove the bucket policy, and a gallery is a
		// grid of <img> tags.
		Expect(isListableImage("site/_selftest/probe.txt")).To(BeFalse())
		Expect(isListableImage("hackathons/x/media/notes.pdf")).To(BeFalse())
		Expect(isListableImage("hackathons/x/media/noextension")).To(BeFalse())
	})

	It("drops svg, which is excluded from uploads for the same reason", func() {
		// /objects is the app's own origin, so a stored SVG is script running
		// as the application. It cannot be uploaded through this app — but the
		// bucket is not ours alone, and a listing must not offer one back.
		Expect(isListableImage("site/media/payload.svg")).To(BeFalse())
	})
})

var _ = Describe("sortNewestFirst", func() {
	at := func(key string, minute int) objstore.ObjectInfo {
		return objstore.ObjectInfo{
			Key:          key,
			SizeBytes:    1,
			LastModified: time.Date(2026, 8, 11, 12, minute, 0, 0, time.UTC),
		}
	}

	It("puts the most recent upload first", func() {
		objects := []objstore.ObjectInfo{at("old", 1), at("new", 9), at("mid", 5)}
		sortNewestFirst(objects)

		Expect([]string{objects[0].Key, objects[1].Key, objects[2].Key}).
			To(Equal([]string{"new", "mid", "old"}))
	})

	It("breaks a tie on the key, so the offset cursor cannot skip a row", func() {
		// Same second, deliberately fed in the wrong order twice: an unstable
		// comparison would let these swap between two requests, and page two
		// starts at an OFFSET into this ordering.
		first := []objstore.ObjectInfo{at("b", 3), at("a", 3), at("c", 3)}
		second := []objstore.ObjectInfo{at("c", 3), at("b", 3), at("a", 3)}
		sortNewestFirst(first)
		sortNewestFirst(second)

		keys := func(objects []objstore.ObjectInfo) []string {
			out := make([]string, 0, len(objects))
			for _, o := range objects {
				out = append(out, o.Key)
			}

			return out
		}
		Expect(keys(first)).To(Equal([]string{"a", "b", "c"}))
		Expect(keys(second)).To(Equal(keys(first)))
	})

	It("sorts an object with no timestamp last, not first", func() {
		//exhaustruct:ignore
		undated := objstore.ObjectInfo{Key: "undated"}
		objects := []objstore.ObjectInfo{undated, at("dated", 1)}
		sortNewestFirst(objects)

		Expect(objects[0].Key).To(Equal("dated"))
		Expect(objects[1].Key).To(Equal("undated"))
	})
})

var _ = Describe("parsePageToken", func() {
	It("starts at the newest object when there is no cursor", func() {
		offset, err := parsePageToken("")
		Expect(err).NotTo(HaveOccurred())
		Expect(offset).To(Equal(0))
	})

	It("reads an offset back", func() {
		offset, err := parsePageToken("60")
		Expect(err).NotTo(HaveOccurred())
		Expect(offset).To(Equal(60))
	})

	It("refuses anything that is not a non-negative number", func() {
		for _, bad := range []string{"-1", "abc", "1.5", " 3", "0x10"} {
			_, err := parsePageToken(bad)
			Expect(err).To(HaveOccurred(), "page_token %q should be refused", bad)
		}
	})
})
