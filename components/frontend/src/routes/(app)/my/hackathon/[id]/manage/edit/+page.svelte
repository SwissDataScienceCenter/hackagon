<script lang="ts">
    import { resolve } from '$app/paths';
    import { enhance } from '$app/forms';
    import ImageUploadField from '$lib/components/forms/ImageUploadField.svelte';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import EventBranding, { safeHex } from '$lib/components/hackathon/EventBranding.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    const hackathon = $derived(data.hackathon);

    // --- logo upload ----------------------------------------------------
    // The whole flow is `ImageUploadField` + the `logo` presign endpoint now.
    // What this form submits is still only the PATH the backend gave back —
    // the bytes go from the browser straight to the object store, which is what
    // keeps the app server out of the transfer entirely.
    //
    // It used to be a bare `<input type="file">` under a full-width URL box,
    // wired to a page-local form action. Both were the problem: the control read
    // as page furniture next to the text field (organisers reported "there is
    // only a URL field"), and an action cannot be reached from a component, so
    // no other surface could reuse any of it.
    let logo = $state(hackathon.logo ?? '');
    const LOGO_MAX_MB = 5;

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
        <!-- Back to where this form is now reached FROM. Its only entry point is
             Manage Hackathon, and a back link to /overview would send an
             organiser to the participant view of an event they were configuring. -->
        <a
            href={resolve(`/my/hackathon/${hackathon.id}/manage`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to managing {hackathon.name}
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

            <!-- Capacity is enforced at Join: while a place is free (and nobody
                 is queued) joining confirms outright; a full event queues new
                 registrants. Approving from the waiting list may exceed this
                 number — it is the organiser's estimate, not a hard wall. -->
            <label class="{LABEL_CLASS} sm:col-span-2">
                Capacity (optional)
                <input
                    type="number"
                    name="maxParticipants"
                    min="0"
                    step="1"
                    inputmode="numeric"
                    placeholder="Unlimited"
                    value={hackathon.maxParticipants ?? ''}
                    class={FIELD_CLASS}
                />
                <span class="text-meta text-ink-3">
                    Confirmed participants only — the waiting list never counts
                    against it. Leave empty (or 0) for unlimited; uncapped events
                    keep the approve-by-hand flow.
                </span>
            </label>

            {#if hasDates}
                <p class="m-0 text-xs text-ink-3 sm:col-span-2">
                    Dates can be changed but not removed.
                </p>
            {/if}

            <div class="sm:col-span-2">
                <!-- Two endpoints, on purpose. The upload files a LOGO
                     (`hackathons/<id>/logo/`); the browse lists everything the
                     event has (`hackathons/<id>/`), so a picture already
                     uploaded into a page can become the logo without a second
                     copy of it. Both take the same permission — hackathon
                     `write` — which is why one control can offer both. -->
                <ImageUploadField
                    name="logo"
                    bind:value={logo}
                    endpoint={`/my/hackathon/${hackathon.id}/logo`}
                    browseEndpoint={`/my/hackathon/${hackathon.id}/media`}
                    label="Logo (optional)"
                    id="hackathon-logo"
                    buttonLabel="Choose a logo"
                    dialogTitle="Event logo"
                    fileLabel="Choose an image file for the event logo"
                    maxMb={LOGO_MAX_MB}
                    previewAlt="Current logo"
                    hint="PNG, JPEG, WebP or GIF."
                />
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
                uploadEndpoint={`/my/hackathon/${hackathon.id}/media`} browseEndpoint={`/my/hackathon/${hackathon.id}/media`}
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
