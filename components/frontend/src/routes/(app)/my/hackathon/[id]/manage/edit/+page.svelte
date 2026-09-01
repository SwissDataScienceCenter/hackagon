<script lang="ts">
    import { resolve } from '$app/paths';
    import ImageUrlField from '$lib/components/forms/ImageUrlField.svelte';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
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

    // TODO(backend: hackathon-edit-clear-dates): once a hackathon has dates,
    // emptying both fields is silently ignored rather than clearing them — see
    // the matching TODO in +page.server.ts. Naming the limitation here beats
    // letting someone clear the fields and believe it worked.
    const hasDates = $derived(Boolean(hackathon.startsAt || hackathon.endsAt));

    const FIELD_CLASS =
        'h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950 px-3 text-xs ' +
        'text-surface-950-50 placeholder:text-surface-700-300 focus:border-primary-500 ' +
        'focus:outline-none';
    const LABEL_CLASS = 'flex flex-col gap-1 text-xs font-semibold text-surface-500';
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <!-- Back where the form is reached from, which is Settings —
             /overview is the member's page and offers no way in here. -->
        <a
            href={resolve(`/my/hackathon/${hackathon.id}/manage`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to Settings
        </a>
        <h1 class="m-0 text-lg font-bold text-surface-950-50">Edit Hackathon</h1>
    </div>

    <!-- Server-side validation only: every rule here is one the action repeats,
         and the action is what the backend actually sees. -->
    <form method="POST" action="?/edit" class="flex w-full flex-col gap-6">
        {#if form?.message}
            <p class="m-0 text-xs text-error-500" role="alert">{form.message}</p>
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
                <legend class="mb-1 p-0 text-xs font-semibold text-surface-500">Visibility</legend>
                <label class="flex items-center gap-2 text-xs text-surface-950-50">
                    <input
                        type="radio"
                        name="visibility"
                        value="public"
                        checked={hackathon.visibility !== PRIVATE}
                    />
                    Public — anyone can see it and ask to join
                </label>
                <label class="flex items-center gap-2 text-xs text-surface-950-50">
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
                <p class="m-0 text-xs text-surface-500 sm:col-span-2">
                    Dates can be changed but not removed.
                </p>
            {/if}

            <ImageUrlField
                name="logo"
                label="Logo URL (optional)"
                value={hackathon.logo ?? ''}
                fieldClass={FIELD_CLASS}
                labelClass={LABEL_CLASS}
                class="sm:col-span-2"
            />
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

        <button type="submit" class="btn btn-sm preset-filled-primary-500 self-start">
            Save changes
        </button>
    </form>
</div>
