<script lang="ts">
    import { resolve } from '$app/paths';
    import { enhance, deserialize } from '$app/forms';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import EventBranding, { safeHex } from '$lib/components/hackathon/EventBranding.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    const hackathon = $derived(data.hackathon);

    // --- logo upload ----------------------------------------------------
    // Mirrored into a text field rather than posted as a file: the bytes go
    // straight from the browser to the object store, and what this form
    // submits is only the PATH the backend gave back. That is what keeps the
    // app server out of the transfer entirely.
    let logo = $state(hackathon.logo ?? '');
    let uploading = $state(false);
    let uploaded = $state(false);
    let uploadError = $state('');

    // Kept in step with imageTypes in components/backend/internal/service/
    // storage_service.go — the backend refuses anything else regardless, this
    // only spares the round trip. SVG is absent on both sides deliberately:
    // /objects is the app's OWN origin, so an SVG would be script running as
    // the application.
    const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
    const LOGO_MAX_MB = 5;

    async function uploadLogo(event: Event & { currentTarget: HTMLInputElement }) {
        const file = event.currentTarget.files?.[0];
        if (!file) return;

        uploading = true;
        uploaded = false;
        uploadError = '';
        try {
            // Step 1: ask the backend for permission. It decides the key,
            // checks casbin, and pins the type and the byte count into the
            // signature — so an oversized file is refused HERE, before a byte
            // is transferred, rather than after.
            const ask = new FormData();
            ask.set('filename', file.name);
            ask.set('contentType', file.type);
            ask.set('sizeBytes', String(file.size));

            // These two headers are what make SvelteKit answer with a
            // SERIALIZED ACTION RESULT rather than a rendered HTML page:
            // `is_action_json_request` keys off `accept: application/json`.
            // They are exactly what `use:enhance` sends — this call is a
            // hand-rolled enhance, so it has to speak the same protocol.
            const response = await fetch('?/presignLogo', {
                method: 'POST',
                body: ask,
                headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
            });
            const result = deserialize(await response.text());

            if (result.type === 'failure') {
                uploadError = String(result.data?.uploadMessage ?? 'Upload was refused');
                return;
            }
            if (result.type !== 'success' || !result.data?.uploadUrl) {
                uploadError = 'Could not start the upload';
                return;
            }
            const { uploadUrl, publicUrl } = result.data as {
                uploadUrl: string;
                publicUrl: string;
            };

            // Step 2: the file itself, direct to storage. Content-Type is set
            // explicitly and must match what was signed — both because the
            // signature covers it, and because whatever arrives is what the
            // object is STORED as: send none and the browser later refuses to
            // render its own image.
            const put = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file
            });
            if (!put.ok) {
                uploadError = `Storage rejected the upload (${put.status})`;
                return;
            }

            logo = publicUrl;
            uploaded = true;
        } catch {
            uploadError = 'Upload failed — check your connection and try again';
        } finally {
            uploading = false;
        }
    }

    // Branding is edited live so the preview below means something. Seeded from
    // the server once — `$state` from a prop is intentional here: this form owns
    // the values from first paint, and re-syncing on every navigation would
    // discard what the organiser is halfway through typing.
    let primaryColor = $state(hackathon.branding?.primaryColor ?? '');
    let accentColor = $state(hackathon.branding?.accentColor ?? '');
    let bannerText = $state(hackathon.branding?.bannerText ?? '');

    /** `<input type="color">` has no empty state; unset shows as black. */
    function swatch(value: string): string {
        return safeHex(value) ?? '#000000';
    }

    // Named rather than silently dropped: the backend rejects a bad hex and the
    // renderer ignores one, so without this the field just appears to do
    // nothing.
    const invalidHex = $derived(
        [
            primaryColor.trim() && !safeHex(primaryColor) ? 'Primary colour' : '',
            accentColor.trim() && !safeHex(accentColor) ? 'Accent colour' : '',
        ].filter(Boolean)
    );

    // Visibility numeric values: PUBLIC=1, PRIVATE=2.
    const PRIVATE = 2;

    function toDateInputValue(d: Date | undefined): string {
        if (!d) return '';
        const date = new Date(d);
        const offset = date.getTimezoneOffset();
        return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
    }

    // TODO(backend: hackathon-edit-clear-dates): once a hackathon has dates,
    // emptying both fields is silently ignored rather than clearing them — see
    // the matching TODO in +page.server.ts. Naming the limitation here beats
    // letting someone clear the fields and believe it worked.
    const hasDates = $derived(Boolean(hackathon.startsAt || hackathon.endsAt));

    // The theme owns the input chrome now — `field` is the same control the
    // rest of the app renders, rather than this page's own hand-rolled copy of
    // it, which is how it ended up still painting Skeleton colours after the
    // design swap.
    const FIELD_CLASS = 'field';
    const LABEL_CLASS = 'flex flex-col gap-1 field-label';
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${hackathon.id}/overview`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to {hackathon.name}
        </a>
        <h1 class="m-0 text-title text-ink">Edit Hackathon</h1>
    </div>

    <!-- Server-side validation only: every rule here is one the action repeats,
         and the action is what the backend actually sees. -->
    <form method="POST" action="?/edit" class="flex w-full flex-col gap-6">
        {#if form?.message}
            <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
        {/if}

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label class="{LABEL_CLASS} sm:col-span-2">
                Name
                <input
                    type="text"
                    name="name"
                    required
                    minlength="3"
                    maxlength="255"
                    value={hackathon.name}
                    class={FIELD_CLASS}
                />
            </label>

            <fieldset class="m-0 flex flex-col gap-1 border-0 p-0 sm:col-span-2">
                <legend class="mb-1 p-0 field-label">Visibility</legend>
                <label class="flex items-center gap-2 text-xs text-ink">
                    <input
                        type="radio"
                        name="visibility"
                        value="public"
                        checked={hackathon.visibility !== PRIVATE}
                    />
                    Public — anyone can see it and ask to join
                </label>
                <label class="flex items-center gap-2 text-xs text-ink">
                    <input
                        type="radio"
                        name="visibility"
                        value="private"
                        checked={hackathon.visibility === PRIVATE}
                    />
                    Private — only people you give access to
                </label>
            </fieldset>

            <label class={LABEL_CLASS}>
                Starts at (optional)
                <input
                    type="date"
                    name="startsAt"
                    value={toDateInputValue(hackathon.startsAt)}
                    class={FIELD_CLASS}
                />
            </label>

            <label class={LABEL_CLASS}>
                Ends at (optional)
                <input
                    type="date"
                    name="endsAt"
                    value={toDateInputValue(hackathon.endsAt)}
                    class={FIELD_CLASS}
                />
            </label>

            {#if hasDates}
                <p class="m-0 text-xs text-ink-3 sm:col-span-2">
                    Dates can be changed but not removed.
                </p>
            {/if}

            <div class="{LABEL_CLASS} sm:col-span-2">
                <span id="logo-label">Logo (optional)</span>

                <!-- `type="text"`, NOT `type="url"`. An uploaded logo is stored
                     as a root-relative path (/objects/<bucket>/<key>) so it
                     resolves from localhost, the tunnel and a deployment
                     alike — and `type="url"` rejects exactly that, which made
                     an already-seeded event impossible to re-save through this
                     form. External links still work. -->
                <input
                    type="text"
                    name="logo"
                    aria-labelledby="logo-label"
                    placeholder="/objects/… or https://…"
                    bind:value={logo}
                    class={FIELD_CLASS}
                />

                <div class="flex flex-wrap items-center gap-3">
                    <input
                        type="file"
                        accept={ACCEPT}
                        aria-label="Upload a logo image"
                        disabled={uploading}
                        onchange={uploadLogo}
                        class="text-xs text-ink"
                    />
                    {#if uploading}
                        <span class="text-xs text-ink-3">Uploading…</span>
                    {:else if uploadError}
                        <span class="text-xs text-danger-ink" role="alert">{uploadError}</span>
                    {:else if uploaded}
                        <span class="text-xs text-success-ink">
                            Uploaded — press Save changes to keep it.
                        </span>
                    {/if}
                </div>
                <p class="m-0 text-meta text-ink-3">
                    PNG, JPEG, WebP or GIF, up to {LOGO_MAX_MB}&nbsp;MB. The file goes
                    straight to storage; nothing is saved until you press Save changes.
                </p>

                {#if logo}
                    <img
                        src={logo}
                        alt="Current logo"
                        class="h-20 w-auto rounded-control border border-line object-contain"
                    />
                {/if}
            </div>
        </div>

        <!-- Last and full width: the only field with no natural size, and the one
             where the room is worth having for the source and its preview both. -->
        <div class="{LABEL_CLASS} w-full">
            <label for="hackathon-description">Description (optional)</label>
            <MarkdownEditor
                id="hackathon-description"
                name="description"
                value={hackathon.description ?? ''}
                rows={16}
                maxlength={10000}
                placeholder="What is this hackathon about?"
            />
        </div>

        <button type="submit" class="btn btn-accent self-start">
            Save changes
        </button>
    </form>

    <!-- Branding is its own form because it is its own RPC (SetBranding, on
         ConfigService) — posting it with the fields above would mean one submit
         that half-succeeds. Same page, though: it is the event's identity, and
         an organiser looking for "how this event looks" comes here. -->
    <form
        method="POST"
        action="?/branding"
        use:enhance
        class="card flex w-full flex-col gap-4 p-4"
    >
        <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="m-0 text-section text-ink">Branding</h2>
            {#if form?.branded}<span class="text-xs text-success-ink">Saved.</span>{/if}
        </div>
        <p class="m-0 text-meta text-ink-3">
            Applied to this event's pages only — never to the rest of the platform. Leave
            both colours empty and it renders in the platform theme.
        </p>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label class={LABEL_CLASS}>
                Primary colour
                <!-- Paired text + swatch: `type="color"` cannot express "unset",
                     and clearing the branding is a thing organisers do. -->
                <span class="flex items-center gap-2">
                    <input
                        name="primaryColor"
                        class="field"
                        bind:value={primaryColor}
                        placeholder="#1c4b8f"
                    />
                    <input
                        type="color"
                        aria-label="Pick primary colour"
                        class="h-9 w-9 shrink-0 rounded-control border border-line bg-transparent"
                        value={swatch(primaryColor)}
                        oninput={(e) => (primaryColor = e.currentTarget.value)}
                    />
                </span>
            </label>

            <label class={LABEL_CLASS}>
                Accent colour
                <span class="flex items-center gap-2">
                    <input
                        name="accentColor"
                        class="field"
                        bind:value={accentColor}
                        placeholder="#e8590c"
                    />
                    <input
                        type="color"
                        aria-label="Pick accent colour"
                        class="h-9 w-9 shrink-0 rounded-control border border-line bg-transparent"
                        value={swatch(accentColor)}
                        oninput={(e) => (accentColor = e.currentTarget.value)}
                    />
                </span>
            </label>

            <label class="{LABEL_CLASS} sm:col-span-2">
                Banner text (optional)
                <input
                    name="bannerText"
                    class="field"
                    bind:value={bannerText}
                    maxlength="200"
                    placeholder="Registration closes Friday"
                />
            </label>
        </div>

        <!-- The real component, not a mock-up of it: what this shows is what the
             event page renders, including the automatic text colour that keeps
             a pale brand colour from producing white-on-yellow. -->
        <div class="flex flex-col gap-1">
            <span class="field-label">Preview</span>
            <EventBranding
                primaryColor={primaryColor}
                accentColor={accentColor}
                bannerText={bannerText}
            >
                <div class="p-4">
                    <p class="m-0 text-sm text-ink">{hackathon.name}</p>
                    <p class="m-0 text-meta text-ink-3">
                        Body text renders in the platform theme; only the banner and
                        accents take your colours.
                    </p>
                </div>
            </EventBranding>
        </div>

        {#if invalidHex.length > 0}
            <p class="m-0 text-xs text-warning-ink" role="alert">
                {invalidHex.join(' and ')} must be a hex colour like #1c4b8f — anything else
                is ignored, and the event falls back to the platform theme.
            </p>
        {/if}

        <button type="submit" class="btn btn-accent self-start">Save branding</button>
    </form>
</div>
