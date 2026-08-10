# File storage

Until now the platform accepted **links only**. Event logos, gallery photos,
submission attachments and profile pictures were all URLs typed by a human and
hosted somewhere else, which is why "Photos" is a page of links and a team
submitting a poster has to find its own hosting first.

This describes the object store that replaces that, and the two decisions that
shape it.

## The store

S3-compatible, so nothing written against it is specific to development. RustFS
runs as a sibling container in `.devcontainer/`; a deployment swaps the endpoint
and credentials for a real bucket and changes no application code.

## Keys, not URLs

**The database stores an object KEY, never a presigned URL.**

Presigned URLs expire — minutes to hours — and they are bearer credentials:
anything holding one has access until it lapses. A row written today would serve
broken images tomorrow, and a leaked row would be a leaked grant. The key is
stable and means nothing on its own.

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
  the existing `Hackathon.logo` and `User.avatar_url` columns — no schema
  change;
- the browser and Cloudflare can cache them, and no request pays a signing cost.

**Private files keep presigned GETs.** Submission attachments and the
preferences export are minted on demand, short TTL, only after casbin has said
the caller may read the submission. The presign carries that decision to the
object store rather than duplicating it there.

## Writes: presigned PUT

The backend authorises the upload, decides the key, and returns a URL the
browser uploads to directly — the file never passes through the app. Size and
content-type limits are conditions ON the presign, which is the only place a 4
GB upload can be refused _before_ it is transferred rather than after.

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

## What is built

`storage.StorageService` —
`CreateUploadUrl(kind, owner_id, filename, content_type, size_bytes)` and
`CreateDownloadUrl(key)`. The `UploadKind` is the only placement input a client
has; the backend derives the key, the content-type allowlist, the size ceiling
and the authorization rule from it. Presigning is hand-rolled SigV4 in
`components/backend/internal/storage` — no AWS SDK, because the algorithm is
four HMACs and a string in a fixed order and this repo's Nix build pins a
`vendorHash` that every new dependency invalidates.

Two things are worth knowing because they are not obvious from the RPC names:

- **The limits are signed headers, not checks.** `content-type` and
  `content-length` are in `X-Amz-SignedHeaders`, so the store recomputes the
  signature over what the browser actually sent. A body of the wrong length or a
  different declared type is refused with 403 at the authentication stage —
  which is what "refused before transfer" concretely means.
- **Presigned URLs are root-relative** (`/objects/<bucket>/<key>?X-Amz-…`), and
  the signature covers the OBJECT STORE's hostname, not the one the browser
  used. Both proxies in front of it rewrite Host to the upstream — vite's
  `changeOrigin`, and `header_up Host {upstream_hostport}` in
  `.devcontainer/Caddyfile.tunnel`. Remove either and uploads answer
  `SignatureDoesNotMatch` while public reads keep working, so the breakage is
  invisible to anyone not uploading.

`image/svg+xml` is deliberately NOT on any allowlist. `/objects` is the app's
own origin — that is what makes stored paths portable — so an SVG there is
script running as the application, with a stable URL.

Delete-by-prefix runs in `HackathonService.Delete` and
`UserService.DeleteAccount`, after the row is gone and unable to fail the
delete, exactly as above.

## One uploader, not five

`src/lib/upload.ts` (re-encode, presign, PUT) and
`components/forms/ImageUploadField.svelte` (the control) are the only copy of
the browser half. That matters more than it sounds: the flow was born inside
`MarkdownEditor.svelte`, and because using it elsewhere meant copying sixty
lines of canvas work and protocol detail, the event logo stayed the only other
uploader for weeks — and it was a bare `<input type="file">` under a full-width
URL box, which organisers read as "there is only a URL field".

Two shapes on the server side are worth keeping:

- `$lib/server/upload.ts` holds the RPC call and the four error translations
  once. What a ROUTE decides is only the two things that must never come from a
  client: the upload KIND and the OWNER id.
- presigning is an **endpoint** (`+server.ts`), not a form action. An action is
  reachable only from the route that declares it, so a shared component cannot
  call one — that is the mechanical reason the logo uploader could not be
  reused, and why `presignLogo` became `./logo`.

Anything that stores a picture must accept the root-relative path back.
`UserService.EditProfile` validated `avatar_url` as http/https only, so the
upload worked and *saving the result* answered `InvalidArgument`; `checkImageRef`
now takes an absolute link or a `/objects/…` path, and still refuses
`javascript:`, `data:`, `//host` and `/\host`.

**Where upload is offered:** the event logo and every markdown editor inside an
event (pages, phases, tracks, the event description), profile pictures, and each
row of the prize table.

**Still to come:**

- **Project images.** The propose and edit forms take a URL. They are reachable
  by the PROPOSER, who is a plain Member — and `HACKATHON_MEDIA` authorizes on
  hackathon `Write`, which Members do not have. Offering upload there means a
  project-scoped kind, not a new form.
- **Submission attachments.** `UPLOAD_KIND_SUBMISSION_ATTACHMENT` is
  authorized and keyed, but `owner_id` is the SUBMISSION, so a file can only be
  attached to a submission that already exists — today's form fixes the
  structured answers at create. It also needs somewhere to keep the key
  (`Submission.form` is `map[string]string`, so a `file` field could hold one)
  and a link that mints a `CreateDownloadUrl`, which is still the one RPC with
  no caller.
- **Platform pages.** `/manage/pages` is the only markdown editor with no
  uploader at all: a site page belongs to no event, so there is no owning
  entity to derive a prefix from and nothing whose deletion would purge it. That
  is a fourth prefix and a deletion story, i.e. a decision for this document
  rather than a missing form.
