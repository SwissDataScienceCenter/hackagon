# File storage

Until now the platform accepted **links only**. Event logos, gallery photos,
submission attachments and profile pictures were all URLs typed by a human and
hosted somewhere else, which is why "Photos" is a page of links and a team
submitting a poster has to find its own hosting first.

This describes the object store that replaces that, and the two decisions that
shape it.

## The store

S3-compatible, so nothing written against it is specific to development.
RustFS runs as a sibling container in `.devcontainer/`; a deployment swaps the
endpoint and credentials for a real bucket and changes no application code.

## Keys, not URLs

**The database stores an object KEY, never a presigned URL.**

Presigned URLs expire — minutes to hours — and they are bearer credentials:
anything holding one has access until it lapses. A row written today would
serve broken images tomorrow, and a leaked row would be a leaked grant. The key
is stable and means nothing on its own.

```
hackathons/<hackathon-id>/logo/<uuid>.<ext>       public
hackathons/<hackathon-id>/media/<uuid>.<ext>      public   gallery photos
users/<user-id>/avatar/<uuid>.<ext>               public
teams/<team-id>/submissions/<submission-id>/…     private
```

The prefix is derived from the owning entity's id, which is what makes deletion
possible (below) without a separate index of what belongs to whom.

## Reads: public-read for imagery, presigned for the rest

**Decided: event imagery is public-read.** Logos, gallery photos and profile
pictures are already world-readable — they render on public event pages, before
login. Giving those prefixes a public-read policy means:

- the stored value is a stable URL that never expires, so it drops straight into
  the existing `Hackathon.logo` and `User.avatar_url` columns — no schema change;
- the browser and Cloudflare can cache them, and no request pays a signing cost.

**Private files keep presigned GETs.** Submission attachments and the
preferences export are minted on demand, short TTL, only after casbin has said
the caller may read the submission. The presign carries that decision to the
object store rather than duplicating it there.

## Writes: presigned PUT

The backend authorises the upload, decides the key, and returns a URL the
browser uploads to directly — the file never passes through the app. Size and
content-type limits are conditions ON the presign, which is the only place a
4 GB upload can be refused *before* it is transferred rather than after.

## Deletion

**Decided: deleting a hackathon deletes its photos and media.** An event that is
gone should not leave its gallery reachable at a guessable URL, and orphaned
objects in a bucket nobody audits are how storage bills and privacy incidents
both start.

Because every key is prefixed by its owner's id, this is a delete-by-prefix on
`hackathons/<id>/` inside `HackathonService.Delete` — no manifest to keep in
sync. The same applies to `UserService.DeleteAccount` and `users/<id>/`, which
matters more: that one is a person exercising erasure, and a profile picture
left behind would make the deletion a lie.

Two properties worth stating, because they are easy to get wrong:

- **Purge after the database commits, not before.** A failed delete must not
  leave rows pointing at objects that are already gone; the reverse (objects
  outliving their rows for a moment) is recoverable and invisible.
- **A purge failure must not fail the delete.** The event is gone as far as the
  user is concerned; log the orphaned prefix loudly so it can be swept, and do
  not resurrect a hackathon because a bucket call timed out.

## Not yet built

The store itself and this design. Still to come: the `StorageService` RPCs
(`CreateUploadUrl` / finalise), the limits, the delete-by-prefix calls in the
two delete handlers, and one uploader in the UI — first for the event logo,
because it is the smallest surface that proves the whole path, then reused for
avatars, gallery photos and submissions.
