<!--
  Pick an image: upload a new one, or reuse one that is already stored.

  ## Why a dialog at all

  Every uploader in this app used to be a single `<input type=file>` behind a
  styled `<label>`, so "add an image" meant exactly one thing and the pictures
  already in the store were invisible — the same photograph got uploaded once
  per page that showed it. Two ways in need somewhere to put them, and a modal
  is the one place that does not steal room from the form underneath.

  ## Component API

  ```svelte
  <ImagePickerDialog
    bind:open={picking}
    uploadEndpoint="/manage/pages/media"
    browseEndpoint="/manage/pages/media"
    title="Insert an image"
    fileLabel="Choose an image file to insert"
    maxMb={15}
    multiple
    onpick={({ url, alt }) => insert(`![${alt}](${url})`)}
  />
  ```

  - `open` — bindable. Set it true to show the dialog; it sets itself false on
    Esc, on the backdrop, on Cancel and after a pick.
  - `uploadEndpoint` — POST target that presigns (`$lib/server/upload`). The
    ROUTE decides the upload kind and the owner; this component never names a
    path, a kind or a ceiling.
  - `browseEndpoint` — optional GET target that lists what is already stored
    (`$lib/gallery`). OMIT IT and the gallery half does not render at all: a tab
    that can only ever be empty is worse than one tab. Avatars have no browse
    endpoint on purpose — no listing scope covers `users/<id>/avatar/`, because
    that prefix is other people's faces.
  - `onpick` — called with `{ url, alt, key?, file? }` for each chosen image.
    `url` is the stable root-relative path (`/objects/…`), never a presigned URL.
    `file` is present only for a fresh upload. Called once per image when
    `multiple` is set.
  - `multiple` — allow several files in one go. Off by default, because most
    callers bind a single value and the last write would silently win.
  - `fileLabel` — accessible name of the file input. MUST share no words with
    the label of whatever field the caller renders, or a page-wide
    `getByLabel` matches both and the field stops being addressable.

  ## Accessibility, and the three things that had to be got right

  A native `<dialog>` opened with `showModal()`, not a div with a high z-index:
  the platform then owns the focus trap, the Esc key, the inertness of the page
  behind it and the `aria-modal` semantics. Every one of those is a thing a
  hand-rolled modal gets subtly wrong.

  - **The drop target is visible and it is a real region**, not the whole page.
    `dragover`/`drop` are bound to the bordered box and nowhere else, so nothing
    outside it changes behaviour.
  - **While the dialog is open, a drop that MISSES the box is swallowed** at the
    window. Not to claim the page, but because the browser's default for a
    dropped file is to NAVIGATE TO IT — which would discard the half-filled form
    this dialog was opened from. The listeners exist only while `open`.
  - **Focus returns to the button that opened it** — the platform does that for
    `showModal()`, and it is the reason the caller must not unmount this
    component to close it.
-->
<script lang="ts">
    import { IMAGE_ACCEPT, UploadError, altFromFilename, uploadImage } from '$lib/upload';
    import {
        GalleryError,
        altFromKey,
        fetchStoredImages,
        formatBytes,
        type StoredImage,
    } from '$lib/gallery';

    type Picked = { url: string; alt: string; key?: string; file?: File };

    let {
        open = $bindable(false),
        uploadEndpoint,
        browseEndpoint = undefined,
        title = 'Add an image',
        fileLabel = 'Choose an image file',
        maxMb = undefined,
        multiple = false,
        onpick,
    }: {
        open?: boolean;
        uploadEndpoint: string;
        /** GET target listing what is already stored. Omit for upload-only. */
        browseEndpoint?: string;
        title?: string;
        /** Accessible name of the file input. Must not echo the caller's label. */
        fileLabel?: string;
        /** Shown in the hint line. The presign is the real limit. */
        maxMb?: number;
        multiple?: boolean;
        onpick: (picked: Picked) => void;
    } = $props();

    const uid = $props.id();
    const titleId = `${uid}-title`;

    let dialog = $state<HTMLDialogElement | null>(null);
    let tab = $state<'upload' | 'browse'>('upload');

    let uploading = $state(false);
    let uploadedCount = $state(0);
    let totalToUpload = $state(0);
    let uploadError = $state('');
    let dropDepth = $state(0);

    let images = $state<StoredImage[]>([]);
    let browseError = $state('');
    let browsing = $state(false);
    let browseLoaded = $state(false);
    let nextPageToken = $state<string | undefined>(undefined);
    let browseTruncated = $state(false);

    // Open and close the real dialog from the bound flag. Two-way rather than
    // one: Esc and the backdrop close it natively, and `onclose` below is what
    // tells the caller. Guarded on `dialog.open` because showModal() on an
    // already-open dialog throws.
    $effect(() => {
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        else if (!open && dialog.open) dialog.close();
    });

    // A dropped file's browser default is to NAVIGATE TO IT, which would throw
    // away the form this dialog was opened from. So while the dialog is open, a
    // drop anywhere is swallowed — and only while it is open, which is why this
    // is an effect with a teardown rather than a listener added once.
    //
    // The drop zone's own handler still runs first (events bubble target →
    // window), so this never intercepts a real drop.
    $effect(() => {
        if (!open) return;
        const swallow = (event: DragEvent) => event.preventDefault();
        window.addEventListener('dragover', swallow);
        window.addEventListener('drop', swallow);
        return () => {
            window.removeEventListener('dragover', swallow);
            window.removeEventListener('drop', swallow);
        };
    });

    // Load the gallery the first time it is asked for, not when the dialog
    // opens: most opens end in an upload, and a listing costs the object store a
    // round trip per prefix.
    $effect(() => {
        if (open && tab === 'browse' && browseEndpoint && !browseLoaded) void load();
    });

    // Fresh state on every open. Without this, yesterday's error message is the
    // first thing the next person sees.
    $effect(() => {
        if (open) {
            uploadError = '';
            uploadedCount = 0;
            totalToUpload = 0;
            dropDepth = 0;
        }
    });

    async function load(pageToken?: string) {
        if (!browseEndpoint) return;
        browsing = true;
        browseError = '';
        try {
            const page = await fetchStoredImages(browseEndpoint, { pageToken });
            // Append on "load more", replace on a first load.
            images = pageToken ? [...images, ...page.images] : page.images;
            nextPageToken = page.nextPageToken;
            browseTruncated = page.truncated;
            browseLoaded = true;
        } catch (e) {
            browseError =
                e instanceof GalleryError
                    ? e.message
                    : 'Could not load what is already uploaded';
        } finally {
            browsing = false;
        }
    }

    function close() {
        open = false;
    }

    /** Hand one image back and shut. */
    function choose(picked: Picked) {
        onpick(picked);
        close();
    }

    /**
     * Upload every accepted file in turn, announcing each one.
     *
     * Sequential, not parallel: each upload is a presign plus a direct PUT, and
     * a person dropping twelve photos on a phone connection is better served by
     * one finishing at a time than by twelve competing.
     */
    async function uploadAll(files: File[]) {
        const accepted = multiple ? files : files.slice(0, 1);
        if (accepted.length === 0) return;

        uploading = true;
        uploadError = '';
        uploadedCount = 0;
        totalToUpload = accepted.length;
        try {
            for (const original of accepted) {
                // One call: re-encode to WebP, ask permission, PUT straight to
                // the store. What comes back is the stable path — never the
                // presigned URL, which expires and is a bearer credential.
                const { publicUrl, key, file } = await uploadImage(uploadEndpoint, original);
                uploadedCount += 1;
                // Alt from the name the PERSON chose, not the converted one.
                onpick({ url: publicUrl, alt: altFromFilename(original.name), key, file });
            }
            // A fresh upload belongs in the gallery too, so a second open shows
            // it rather than looking like it was lost.
            browseLoaded = false;
            close();
        } catch (e) {
            uploadError =
                e instanceof UploadError
                    ? e.message
                    : 'Upload failed — check your connection and try again';
        } finally {
            uploading = false;
        }
    }

    async function pickFiles(event: Event & { currentTarget: HTMLInputElement }) {
        // Held in a local: `currentTarget` is only set while the event is being
        // DISPATCHED, so it is null on every line after the first await. Reading
        // it in a `finally` threw out of the handler as an unhandled rejection
        // and left the input un-cleared, which made re-picking the same file
        // after a failure fire no change event at all.
        const input = event.currentTarget;
        const files = Array.from(input.files ?? []);
        try {
            await uploadAll(files);
        } finally {
            // Clear it, or picking the SAME file twice fires no change event.
            input.value = '';
        }
    }

    function onDrop(event: DragEvent) {
        event.preventDefault();
        dropDepth = 0;
        const dropped = Array.from(event.dataTransfer?.files ?? []);
        // A drag can carry directories and text; keep what an <img> can show and
        // let the presign refuse the rest by type, which is where the real
        // allowlist lives.
        const files = dropped.filter((f) => f.type.startsWith('image/'));
        if (files.length === 0) {
            uploadError = dropped.length
                ? 'That does not look like an image file.'
                : 'Nothing was dropped.';
            return;
        }
        void uploadAll(files);
    }
</script>

<dialog
    bind:this={dialog}
    aria-labelledby={titleId}
    class="w-[min(46rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-ink shadow-lg"
    onclose={close}
    onclick={(event) => {
        // The backdrop IS the dialog element; its content is a child. So a click
        // whose target is the dialog itself landed outside the panel.
        if (event.target === dialog) close();
    }}
>
    <div class="flex flex-col gap-4 p-4 sm:p-5">
        <div class="flex items-start justify-between gap-3">
            <h2 id={titleId} class="m-0 text-lg font-bold">{title}</h2>
            <button
                type="button"
                class="btn btn-sm btn-quiet"
                onclick={close}
                disabled={uploading}
            >
                Cancel
            </button>
        </div>

        {#if browseEndpoint}
            <!-- `aria-pressed` chips rather than a `role=tablist`: a real tab
                 widget owes the user arrow-key navigation and a roving
                 tabindex, and two toggle buttons that each say whether they are
                 on need neither. Same choice MarkdownEditor made. -->
            <div class="flex gap-1">
                <button
                    type="button"
                    class="chip {tab === 'upload' ? 'chip-active' : ''}"
                    aria-pressed={tab === 'upload'}
                    onclick={() => (tab = 'upload')}
                >
                    Upload
                </button>
                <button
                    type="button"
                    class="chip {tab === 'browse' ? 'chip-active' : ''}"
                    aria-pressed={tab === 'browse'}
                    onclick={() => (tab = 'browse')}
                >
                    Choose from gallery
                </button>
            </div>
        {/if}

        {#if tab === 'upload' || !browseEndpoint}
            <!-- The visible drop target. A region rather than a button: the
                 keyboard path in is the labelled control inside it, and making
                 the box itself focusable would announce a button that cannot be
                 activated without a pointer. -->
            <div
                role="region"
                aria-label="Drop an image here to upload it"
                class="flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed p-6 text-center transition-colors {dropDepth >
                0
                    ? 'border-accent bg-raised'
                    : 'border-line'}"
                ondragenter={(event) => {
                    event.preventDefault();
                    dropDepth += 1;
                }}
                ondragover={(event) => {
                    // Required: without preventDefault on dragover the browser
                    // refuses the drop and there is no event to handle.
                    event.preventDefault();
                }}
                ondragleave={() => {
                    // A counter, not a boolean: dragenter/dragleave fire for
                    // every child the pointer crosses, so a single flag flickers
                    // off the moment the cursor passes over the button inside.
                    dropDepth = Math.max(0, dropDepth - 1);
                }}
                ondrop={onDrop}
            >
                <p class="m-0 font-medium">
                    {multiple ? 'Drag images here' : 'Drag an image here'}
                </p>
                <p class="m-0 text-meta text-ink-3">or</p>

                <!-- A <label> wrapping a hidden input, because a styled button
                     cannot open a file picker on its own. -->
                <label class="btn btn-sm btn-accent cursor-pointer" class:opacity-60={uploading}>
                    {uploading
                        ? totalToUpload > 1
                            ? `Uploading ${uploadedCount + 1} of ${totalToUpload}…`
                            : 'Uploading…'
                        : multiple
                          ? 'Choose files'
                          : 'Choose a file'}
                    <input
                        type="file"
                        accept={IMAGE_ACCEPT}
                        aria-label={fileLabel}
                        class="hidden"
                        {multiple}
                        disabled={uploading}
                        onchange={pickFiles}
                    />
                </label>

                <p class="m-0 text-meta text-ink-3">
                    PNG, JPEG, WebP or GIF.{maxMb ? ` Up to ${maxMb} MB.` : ''} The file
                    goes straight to storage; nothing is saved on the form until you
                    submit it.
                </p>
            </div>

            {#if uploadError}
                <p class="m-0 text-xs text-danger-ink" role="alert">{uploadError}</p>
            {/if}
        {:else}
            {#if browseError}
                <p class="m-0 text-xs text-danger-ink" role="alert">{browseError}</p>
            {:else if browsing && images.length === 0}
                <p class="m-0 py-6 text-center text-sm text-ink-3">Loading…</p>
            {:else if images.length === 0}
                <p class="m-0 py-6 text-center text-sm text-ink-3">
                    Nothing has been uploaded here yet. Switch to Upload to add the first
                    picture.
                </p>
            {:else}
                <ul
                    class="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 md:grid-cols-4"
                >
                    {#each images as image (image.key || image.url)}
                        <li class="m-0">
                            <button
                                type="button"
                                class="group flex w-full flex-col gap-1 rounded-card border border-line p-1 text-left hover:border-accent focus-visible:outline-2"
                                onclick={() =>
                                    choose({
                                        url: image.url,
                                        alt: altFromKey(image.key),
                                        key: image.key,
                                    })}
                            >
                                <!-- alt="" on the thumbnail: the button's own
                                     accessible name describes the choice, and a
                                     duplicate would be read twice. -->
                                <img
                                    src={image.url}
                                    alt=""
                                    loading="lazy"
                                    class="h-24 w-full rounded-field bg-raised object-contain"
                                />
                                <span class="sr-only">
                                    Use this image — {altFromKey(image.key)}, {formatBytes(
                                        image.sizeBytes,
                                    )}
                                </span>
                                <span class="px-1 text-meta text-ink-3" aria-hidden="true">
                                    {formatBytes(image.sizeBytes)}
                                </span>
                            </button>
                        </li>
                    {/each}
                </ul>

                <div class="flex flex-wrap items-center gap-3">
                    {#if nextPageToken}
                        <button
                            type="button"
                            class="btn btn-sm"
                            disabled={browsing}
                            onclick={() => void load(nextPageToken)}
                        >
                            {browsing ? 'Loading…' : 'Load more'}
                        </button>
                    {/if}
                    {#if browseTruncated}
                        <!-- Stated, not hidden: a grid that stops without saying
                             so is how someone concludes their upload failed. -->
                        <p class="m-0 text-meta text-ink-3">
                            Showing the most recent uploads only.
                        </p>
                    {/if}
                </div>
            {/if}
        {/if}
    </div>
</dialog>

<style>
    /* The wash behind the panel. `--color-scrim` flips with the mode, which a
       literal rgba() at this call site could not. */
    dialog::backdrop {
        background: var(--color-scrim);
    }
</style>
