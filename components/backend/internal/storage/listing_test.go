//go:build test && unittest

package storage

import (
	"encoding/xml"
	"testing"
	"time"
)

// Reading a ListObjectsV2 answer, pinned because both halves fail SILENTLY.
//
// A field name that does not match the XML unmarshals to a zero value rather
// than an error, so a listing keeps working while every object claims to be 0
// bytes and to have been written at the epoch — and the gallery this feeds
// orders BY that timestamp, so getting it wrong means the grid is in an
// arbitrary order and nothing reports anything.

// listingXML is a ListObjectsV2 response in the shape S3 documents and rustfs
// emits. Deliberately includes a truncated page, so the continuation token is
// covered by the same fixture.
const listingXML = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>hackagon-dev</Name>
  <Prefix>site/media/</Prefix>
  <KeyCount>2</KeyCount>
  <MaxKeys>1000</MaxKeys>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>1ueGcxLPRx1Tr</NextContinuationToken>
  <Contents>
    <Key>site/media/aaa.webp</Key>
    <LastModified>2026-08-11T09:15:42.000Z</LastModified>
    <ETag>&quot;d41d8cd98f00b204e9800998ecf8427e&quot;</ETag>
    <Size>20481</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
  <Contents>
    <Key>site/media/bbb.png</Key>
    <LastModified>2026-08-10T22:01:00Z</LastModified>
    <ETag>&quot;acbd18db4cc2f85cedef654fccc4a4d8&quot;</ETag>
    <Size>7</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
</ListBucketResult>`

func TestListBucketResultReadsKeySizeAndDate(t *testing.T) {
	var result listBucketResult
	if err := xml.Unmarshal([]byte(listingXML), &result); err != nil {
		t.Fatalf("unmarshal listing: %v", err)
	}

	if len(result.Contents) != 2 {
		t.Fatalf("want 2 objects, got %d", len(result.Contents))
	}
	if got := result.Contents[0].Key; got != "site/media/aaa.webp" {
		t.Errorf("key: want site/media/aaa.webp, got %q", got)
	}
	// The assertion that would otherwise be vacuous: a wrong field name gives
	// 0 here and nothing complains.
	if got := result.Contents[0].Size; got != 20481 {
		t.Errorf("size: want 20481, got %d", got)
	}
	if got := result.Contents[1].Size; got != 7 {
		t.Errorf("size: want 7, got %d", got)
	}

	want := time.Date(2026, 8, 11, 9, 15, 42, 0, time.UTC)
	if got := parseListTime(result.Contents[0].LastModified); !got.Equal(want) {
		t.Errorf("last modified: want %s, got %s", want, got)
	}
	// The sub-second-less form, which is what a store that trims zeroes sends.
	want = time.Date(2026, 8, 10, 22, 1, 0, 0, time.UTC)
	if got := parseListTime(result.Contents[1].LastModified); !got.Equal(want) {
		t.Errorf("last modified: want %s, got %s", want, got)
	}

	if !result.IsTruncated || result.NextContinuationToken != "1ueGcxLPRx1Tr" {
		t.Errorf("truncation: got truncated=%v token=%q",
			result.IsTruncated, result.NextContinuationToken)
	}
}

// LastModified is a string in the struct, not a time.Time, and that is load
// bearing: encoding/xml accepts ONLY RFC 3339 and fails the WHOLE unmarshal
// otherwise — losing every key over a field that is used to sort. This proves
// the degradation is per-object.
func TestUnparseableDateDoesNotLoseTheKeys(t *testing.T) {
	const odd = `<ListBucketResult>
  <Contents>
    <Key>site/media/ccc.webp</Key>
    <LastModified>Mon, 11 Aug 2026 09:15:42 GMT</LastModified>
    <Size>12</Size>
  </Contents>
</ListBucketResult>`

	var result listBucketResult
	if err := xml.Unmarshal([]byte(odd), &result); err != nil {
		t.Fatalf("an unusual date must not fail the listing: %v", err)
	}
	if len(result.Contents) != 1 || result.Contents[0].Key != "site/media/ccc.webp" {
		t.Fatalf("the key should survive an unparseable date, got %+v", result.Contents)
	}
	if got := parseListTime(result.Contents[0].LastModified); !got.IsZero() {
		t.Errorf("want the zero time for an unrecognized layout, got %s", got)
	}
}

func TestParseListTimeHandlesEmptyAndPadding(t *testing.T) {
	if got := parseListTime(""); !got.IsZero() {
		t.Errorf("empty: want zero time, got %s", got)
	}
	want := time.Date(2026, 8, 11, 9, 15, 42, 0, time.UTC)
	if got := parseListTime("  2026-08-11T09:15:42Z\n"); !got.Equal(want) {
		t.Errorf("padded: want %s, got %s", want, got)
	}
}
