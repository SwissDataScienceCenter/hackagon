<script lang="ts">
    import { resolve } from '$app/paths';
    import ImageUrlField from '$lib/components/forms/ImageUrlField.svelte';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import PublicHackathonView from '$lib/components/hackathon/PublicHackathonView.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
    const hackathon = $derived(data.hackathon);

    // Visibility numeric values: PUBLIC=1, PRIVATE=2.
    const PRIVATE = 2;

    function toDateInputValue(d: Date | undefined): string {
        if (!d) return '';
        const date = new Date(d);
        const offset = date.getTimezoneOffset();
        return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
    }

    // Built as a local date rather than through `new Date('2026-10-24')`, which
    // parses as UTC midnight and can render as the day before in a western
    // timezone. The preview would then show a date the form does not.
    function fromDateInputValue(v: string): Date | undefined {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return undefined;
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }

    // TODO(backend: hackathon-edit-clear-dates): once a hackathon has dates,
    // emptying both fields is silently ignored rather than clearing them — see
    // the matching TODO in +page.server.ts. Naming the limitation here beats
    // letting someone clear the fields and believe it worked.
    const hasDates = $derived(Boolean(hackathon.startsAt || hackathon.endsAt));

    // Every field the public page reads, held here so the preview beside the
    // form can be driven by what is typed rather than by what was last saved.
    // The inputs keep their `name` attributes and the form still posts normally
    // — this is a second reader of the same controls, not a replacement for
    // them.
    let draft = $state({
        name: hackathon.name,
        visibility: hackathon.visibility === PRIVATE ? 'private' : 'public',
        startsAt: toDateInputValue(hackathon.startsAt),
        endsAt: toDateInputValue(hackathon.endsAt),
        logo: hackathon.logo ?? '',
        description: hackathon.description ?? '',
    });

    const isPublic = $derived(draft.visibility === 'public');
</script>

<!--
  The organiser's view of their own public page: the fields on the left, and on
  the right the page itself, rendered from what is currently typed.

  The preview is `PublicHackathonView` — the same component the public route
  renders, not a mock-up of it. That is the point of the screen. A picture whose
  shape nobody can predict from the URL they pasted is exactly the thing a
  hand-built preview gets wrong, and it would get it wrong quietly.

  Side by side from xl up, where there is room for both; stacked below it. The
  preview is `inert`, so nothing in it can be clicked from here — a working Join
  button would enrol the organiser in their own hackathon.
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <!-- Back where the form is reached from, which is Settings —
             /overview is the member's page and offers no way in here. -->
        <a
            href={resolve(`/my/hackathon/${hackathon.id}/manage`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to Settings
        </a>
        <h1 class="m-0 text-title text-ink">Public page</h1>
        <p class="m-0 text-xs text-ink-3">
            The name, dates, picture and description everyone sees — visitors on the
            hackathon's public page, and members on About.
        </p>
    </div>

    <div class="grid gap-8 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:items-start">
        <!-- Server-side validation only: every rule here is one the action repeats,
             and the action is what the backend actually sees. -->
        <form method="POST" action="?/edit" class="flex w-full flex-col gap-6">
            {#if form?.message}
                <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
            {/if}

            <div class="grid gap-4 sm:grid-cols-2">
                <label class="field-label sm:col-span-2">
                    Name
                    <input
                        type="text"
                        name="name"
                        required
                        minlength="3"
                        maxlength="255"
                        bind:value={draft.name}
                        class="field"
                    />
                </label>

                <fieldset class="m-0 flex flex-col gap-1 border-0 p-0 sm:col-span-2">
                    <legend class="mb-1 p-0 text-xs font-semibold text-ink-3">Visibility</legend>
                    <label class="flex items-center gap-2 text-xs text-ink">
                        <input
                            type="radio"
                            name="visibility"
                            value="public"
                            bind:group={draft.visibility}
                        />
                        Public — anyone can see it and ask to join
                    </label>
                    <label class="flex items-center gap-2 text-xs text-ink">
                        <input
                            type="radio"
                            name="visibility"
                            value="private"
                            bind:group={draft.visibility}
                        />
                        Private — only people you give access to
                    </label>
                </fieldset>

                <label class="field-label">
                    Starts at (optional)
                    <input type="date" name="startsAt" bind:value={draft.startsAt} class="field" />
                </label>

                <label class="field-label">
                    Ends at (optional)
                    <input type="date" name="endsAt" bind:value={draft.endsAt} class="field" />
                </label>

                {#if hasDates}
                    <p class="m-0 text-xs text-ink-3 sm:col-span-2">
                        Dates can be changed but not removed.
                    </p>
                {/if}

                <ImageUrlField
                    name="logo"
                    label="Logo URL (optional)"
                    bind:value={draft.logo}
                    class="sm:col-span-2"
                />
            </div>

            <!-- Last and full width: the only field with no natural size, and the one
                 where the room is worth having for the source and its preview both. -->
            <div class="field-label w-full">
                <label for="hackathon-description">Description (optional)</label>
                <MarkdownEditor
                    id="hackathon-description"
                    name="description"
                    bind:value={draft.description}
                    rows={12}
                    maxlength={10000}
                    placeholder="What is this hackathon about?"
                />
            </div>

            <button type="submit" class="btn btn-sm btn-solid self-start">Save changes</button>
        </form>

        <div class="flex min-w-0 flex-col gap-2 xl:sticky xl:top-6">
            <!-- No link out to the live page: this *is* the live page, drawn by
                 the component the public route renders. A link beside it would
                 offer a second look at what is already on the screen. -->
            <h2 class="m-0 text-section text-ink">What visitors see</h2>

            <!-- Said here rather than left to be discovered: everything below is
                 drawn exactly as a visitor would see it, and for a private
                 hackathon no visitor can reach it at all. -->
            <p class="m-0 text-xs text-ink-3">
                {#if isPublic}
                    Updates as you type. Nothing here is saved until you press Save
                    changes.
                {:else}
                    This hackathon is private, so nobody can reach this page yet — it
                    is how it would look once you make it public.
                {/if}
            </p>

            <div class="card overflow-hidden">
                <PublicHackathonView
                    id={hackathon.id}
                    name={draft.name}
                    description={draft.description}
                    logo={draft.logo}
                    startsAt={fromDateInputValue(draft.startsAt)}
                    endsAt={fromDateInputValue(draft.endsAt)}
                    status={hackathon.status}
                    preview
                />
            </div>
        </div>
    </div>
</div>
