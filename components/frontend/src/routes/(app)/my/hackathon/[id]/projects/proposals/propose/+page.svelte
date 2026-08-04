<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const FIELD_CLASS =
        'h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950 px-3 text-xs ' +
        'text-surface-950-50 placeholder:text-surface-700-300 focus:border-primary-500 ' +
        'focus:outline-none';
    const LABEL_CLASS = 'flex flex-col gap-1 text-xs font-semibold text-surface-500';
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/projects/proposals`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to my projects
        </a>
        <h1 class="m-0 text-lg font-bold text-surface-950-50">Propose a Project</h1>
        <p class="m-0 text-xs text-surface-500">
            An organizer reviews it before it appears on the Projects page. You can keep editing
            it in the meantime.
        </p>
    </div>

    <!-- Server-side validation only: every rule here is one the action repeats,
         and the action is what the backend actually sees. -->
    <form method="POST" action="?/propose" class="flex w-full flex-col gap-6">
        {#if form?.message}
            <p class="m-0 text-xs text-error-500" role="alert">{form.message}</p>
        {/if}

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label class="{LABEL_CLASS} sm:col-span-2">
                Title
                <input
                    type="text"
                    name="title"
                    required
                    minlength="3"
                    maxlength="255"
                    placeholder="Realtime dashboard for sensor data"
                    class={FIELD_CLASS}
                />
            </label>

            <!-- Omitted entirely when the hackathon defines no tracks: an empty
                 picker asks a question with no answers. -->
            {#if data.tracks.length > 0}
                <label class={LABEL_CLASS}>
                    Track (optional)
                    <select name="trackId" class={FIELD_CLASS}>
                        <option value="">No track</option>
                        {#each data.tracks as track (track.id)}
                            <option value={track.id}>{track.name}</option>
                        {/each}
                    </select>
                </label>
            {/if}

            <label class="{LABEL_CLASS} {data.tracks.length > 0 ? '' : 'sm:col-span-2'}">
                Image URL (optional)
                <input type="url" name="image" placeholder="https://…" class={FIELD_CLASS} />
            </label>
        </div>

        <!-- Last and full width: the only field with no natural size, and the one
             where the room is worth having for the source and its preview both. -->
        <div class="{LABEL_CLASS} w-full">
            <label for="project-description">Description</label>
            <MarkdownEditor
                id="project-description"
                name="description"
                rows={16}
                maxlength={10000}
                placeholder="What is the idea, and what would a team build?"
            />
        </div>

        <button type="submit" class="btn btn-sm preset-filled-primary-500 self-start">
            Propose project
        </button>
    </form>
</div>
