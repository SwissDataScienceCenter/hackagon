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
site/media/<uuid>.<ext>                           public   platform pages
```

The prefix is derived from the owning entity's id, which is what makes deletion
possible (below) without a separate index of what belongs to whom — with one
deliberate exception, `site/`, which has no owning entity at all (see "Platform
pages" below).

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
upload worked and _saving the result_ answered `InvalidArgument`;
`checkImageRef` now takes an absolute link or a `/objects/…` path, and still
refuses `javascript:`, `data:`, `//host` and `/\host`.

**Where upload is offered:** the event logo and every markdown editor inside an
event (pages, phases, tracks, the event description), the platform pages CMS,
profile pictures, and each row of the prize table.

## Platform pages: the one prefix with no owner

`/manage/pages` edits the platform's own pages — about, privacy, terms. They
belong to no event and to no person, which is why they were the last markdown
editor in the app with no uploader: every other kind derives its prefix from an
owning id, and there is no id here to derive one from.

**Decided: a flat `site/media/<uuid>.<ext>`, public, authorized by the GLOBAL
Admin role.** Three consequences, stated rather than left to be discovered:

- **`owner_id` is not read.** `UPLOAD_KIND_SITE_MEDIA` is the only kind that
  names nothing. There is no hackathon domain to scope a casbin check to, so it
  uses `RequireGlobalAdmin` — the identical rule every `SitePageService`
  mutation already uses, which means the answer to "may I upload this?" is the
  same as the answer to "may I edit this page?" by construction rather than by
  two rules agreeing.
- **Nothing purges `site/`.** Deletion elsewhere works because a key is prefixed
  by its owner's id; here there is no owner whose deletion is the signal. Nor
  should there be a per-page prefix: an image is inserted while the page may not
  exist yet (the create form), and the same picture can be referenced from a
  second page. So deleting a page leaves its imagery, and the orphans are
  admin-created, few, and sweepable by hand at `site/media/`. A `site/` purge
  would need a reference scan across every page's markdown, which is a manifest
  by another name — exactly what "keys, not URLs" avoids.
- **Public from the moment it is uploaded, including for a draft page.** The
  object store's policy is per-prefix, not per-row, so an image pasted into an
  unpublished About page is readable at its `/objects/…` path before the page
  is. This is already true of a hackathon whose page is hidden; the protection
  is that the path contains a v4 UUID nobody can enumerate, so the exposure is
  "the link leaks if it is shared", not "the draft is browsable". Anything that
  must stay unreadable until publication needs a private kind and
  `CreateDownloadUrl`, not this one.

The ceiling is 15 MiB and the allowlist is `imageTypes` — deliberately identical
to `HACKATHON_MEDIA`, because it is the identical job: a picture dropped into
prose from the same markdown editor.

## Listing: you may read a prefix exactly when you may write to it

Until now nothing could ask the store what was in it, so every surface that
accepted a picture could only offer to store ANOTHER one. The same photograph
went in once per page that showed it, and an organiser who wanted their event's
logo to be a picture already on a page had to upload it a second time.

`StorageService.ListObjects(scope, owner_id, page_size, page_token)` answers
that question. Like `UploadKind` on the write side, the **scope** is the only
placement input a client has: the backend derives the prefixes and the
authorization rule from it, and a client-supplied prefix is never trusted.

**Decided: each scope's read permission IS the write permission for the same
prefix.** Not a parallel rule that has to be kept in agreement with the upload
table — the identical check `authorizeUpload` makes.

| scope             | prefixes                     | who               |
| ----------------- | ---------------------------- | ----------------- |
| `HACKATHON_MEDIA` | `hackathons/<owner_id>/`     | hackathon `write` |
| `SITE_MEDIA`      | `site/media/`                | global `Admin`    |
| `ALL_MEDIA`       | `hackathons/`, `site/media/` | global `Admin`    |

`HACKATHON_MEDIA` covers the event's `logo/` and `media/` folders together,
because someone picking a picture wants everything the event has and both take
the same permission to write.

**Two prefixes are listable by NOBODY, and that is the reason this is an enum
rather than a prefix string.**

- **`users/<id>/avatar/`** — other people's faces. Nothing in the product needs
  to enumerate them: an avatar is set from the profile that owns it, and a
  gallery exists to pick a picture to REUSE, which is exactly what must not be
  easy to do with someone's photograph. A global admin fixing one profile still
  reaches it from that profile. So the account page's picker has no browse half
  at all, and the absence is asserted (with a positive control on a surface that
  DOES have one, or "no gallery tab" would pass on a dialog that never
  rendered).
- **`teams/<id>/submissions/`** — private by bucket policy. Those objects have
  no stable readable path, so a picker row for one would be a broken image; and
  the KEYS alone would say which teams turned work in and how much, to anyone
  allowed to list any scope.

**The answer is bounded, and says when it is.** Keys end in a v4 uuid, so the
store's lexicographic order is noise — the listing is re-sorted newest-first,
which means holding the candidates, which means capping how many (`listScanCap`,
2000 keys across every prefix in the scope). Reaching the cap sets `truncated`,
and both the picker and the gallery page SAY SO: a grid that silently stops is
how someone concludes their upload failed. The cursor is therefore an offset
into the sorted order, not the store's continuation token — that token would
resume a different sequence than the caller was reading.

Only objects whose extension is on `imageTypes` come back (derived from that
map, not restated). Every listable prefix is an imagery prefix, so this only
filters strays — `rustfs-init.sh` leaves a `_selftest/probe.txt` under each
public prefix while it proves the bucket policy — but a gallery is a grid of
`<img>` and a row that can only render broken is worse than no row.

**Authorization is answered BEFORE "is storage configured".** Otherwise an
anonymous caller learns something about the deployment in place of the
`Unauthenticated` they are owed, and the deny side becomes untestable on a
server with no store (which is what the unit-test config is).

### One picker, two ways in

`components/forms/ImagePickerDialog.svelte` replaced the bare
`<input type="file">` behind every uploader. A native `<dialog>` opened with
`showModal()`, so the platform owns the focus trap, the Esc key and the
inertness of the page behind it. Two halves: **upload**, with a visible drop
target that is a region and not the whole page, and **choose from what is
already uploaded**, rendered only when the caller passes a `browseEndpoint` (a
tab that can only ever be empty is worse than one tab).

One trap it introduced, worth not re-learning: **the dialog's heading is its
accessible name, and a closed `<dialog>` is `display:none` but still in the
document.** `dialogTitle="Profile picture"` — identical to the field's own
caption — made a page-wide `getByLabel("Profile picture")` resolve to two
elements and broke every avatar test. Name the dialog after the JOB ("Event
logo"), never after the field. The same constraint `fileLabel` already had.

While the dialog is open a drop that MISSES the target is swallowed at the
window — not to claim the page, but because the browser's default for a dropped
file is to navigate to it, which would discard the half-filled form underneath.
The listeners exist only while it is open.

### The media library, and why there is no delete

`/manage/gallery` is the platform's own view of `ALL_MEDIA`, linked from the
dashboard's Manage platform tiles (`platformNav`) — `/manage/pages` shipped
reachable only by typing its URL and that is not happening twice. It says on
screen that avatars and submission files are deliberately absent, because a
gallery that quietly omitted them would read as a complete inventory.

**There is deliberately no single-object delete, and that follows from "keys,
not URLs".** An image can be referenced from any page's markdown, any event's
`logo` column and any prize row, and NOTHING records which. Deleting one would
break those references silently — the row keeps its path and the page renders a
hole. A safe delete needs a reference scan across every markdown field in the
database, which is a manifest by another name: exactly what this design avoids.
The deletion that exists is still the one whose scope is an entity nobody points
at any more — `HackathonService.Delete` and `UserService.DeleteAccount` purging
by prefix.

**Still to come:**

- **Project images.** The propose and edit forms take a URL. They are reachable
  by the PROPOSER, who is a plain Member — and `HACKATHON_MEDIA` authorizes on
  hackathon `Write`, which Members do not have. Offering upload there means a
  project-scoped kind, not a new form.
- **Submission attachments.** `UPLOAD_KIND_SUBMISSION_ATTACHMENT` is authorized
  and keyed, but `owner_id` is the SUBMISSION, so a file can only be attached to
  a submission that already exists — today's form fixes the structured answers
  at create. It also needs somewhere to keep the key (`Submission.form` is
  `map[string]string`, so a `file` field could hold one) and a link that mints a
  `CreateDownloadUrl`, which is still the one RPC with no caller.
