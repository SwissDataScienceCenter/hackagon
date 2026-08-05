<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import type { ActionData } from './$types';

    let { form }: { form: ActionData } = $props();

    const FIELD_CLASS =
        'field';
    const LABEL_CLASS = 'flex flex-col gap-1 text-xs font-semibold text-ink-3';
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve('/(app)/dashboard')}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to my hackathons
        </a>
        <h1 class="m-0 text-lg font-bold text-ink">Create Hackathon</h1>
        <p class="m-0 text-xs text-ink-3">
            You become its owner and can edit everything else afterwards.
        </p>
    </div>

    <!-- Server-side validation only: every rule here is one the action repeats,
         and the action is what the backend actually sees. -->
    <form method="POST" action="?/create" class="flex w-full flex-col gap-6">
        {#if form?.message}
            <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
        {/if}

        <!-- The short fields share the width in a 4-column grid, each spanning as
             many columns as its content needs, so a date input stays date-sized
             rather than stretching across the page. All collapse to one column
             below sm. -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label class="{LABEL_CLASS} sm:col-span-2">
                Name
                <input
                    type="text"
                    name="name"
                    required
                    minlength="3"
                    maxlength="255"
                    placeholder="Spring Data Hackathon"
                    class={FIELD_CLASS}
                />
            </label>

            <fieldset class="m-0 flex flex-col gap-1 border-0 p-0 sm:col-span-2">
                <legend class="mb-1 p-0 text-xs font-semibold text-ink-3">Visibility</legend>
                <label class="flex items-center gap-2 text-xs text-ink">
                    <input type="radio" name="visibility" value="public" checked />
                    Public — anyone can see it and ask to join
                </label>
                <label class="flex items-center gap-2 text-xs text-ink">
                    <input type="radio" name="visibility" value="private" />
                    Private — only people you give access to
                </label>
            </fieldset>

            <label class={LABEL_CLASS}>
                Starts at (optional)
                <input type="date" name="startsAt" class={FIELD_CLASS} />
            </label>

            <label class={LABEL_CLASS}>
                Ends at (optional)
                <input type="date" name="endsAt" class={FIELD_CLASS} />
            </label>

            <label class="{LABEL_CLASS} sm:col-span-2">
                Logo URL (optional)
                <input type="url" name="logo" placeholder="https://…" class={FIELD_CLASS} />
            </label>
        </div>

        <!-- Last and full width: the only field with no natural size, and the one
             where the room is worth having for the source and its preview both. -->
        <div class="{LABEL_CLASS} w-full">
            <label for="hackathon-description">Description (optional)</label>
            <MarkdownEditor
                id="hackathon-description"
                name="description"
                rows={16}
                maxlength={10000}
                placeholder="What is this hackathon about?"
            />
        </div>

        <button type="submit" class="btn btn-sm btn-solid self-start">
            Create hackathon
        </button>
    </form>
</div>
