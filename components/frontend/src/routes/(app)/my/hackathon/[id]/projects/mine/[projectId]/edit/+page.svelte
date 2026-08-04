<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import { projectStatusLabel, projectStatusBadgePreset } from '$lib/utils/projectStatus';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const FIELD_CLASS =
        'h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950 px-3 text-xs ' +
        'text-surface-950-50 placeholder:text-surface-700-300 focus:border-primary-500 ' +
        'focus:outline-none';
    const LABEL_CLASS = 'flex flex-col gap-1 text-xs font-semibold text-surface-500';

    const statusText = $derived(projectStatusLabel(data.project.status));
    const statusPreset = $derived(
        projectStatusBadgePreset(data.project.status) ?? 'preset-tonal-surface'
    );

    // See the TODO in +page.server.ts: `Edit` cannot unset a track, so the
    // "No track" option is offered only while there is nothing to lose by it.
    const hasTrack = $derived(data.project.trackId !== '');
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/projects/mine`)}
            class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
        >
            &larr; Back to my projects
        </a>
        <div class="flex flex-wrap items-center gap-2">
            <h1 class="m-0 text-lg font-bold text-surface-950-50">Edit Project</h1>
            {#if statusText}
                <span class="badge {statusPreset} rounded-none text-[0.625rem] font-semibold uppercase">
                    {statusText}
                </span>
            {/if}
        </div>
        <p class="m-0 text-xs text-surface-500">
            Changes apply immediately, whether or not the project has been approved.
        </p>
    </div>

    <!-- Server-side validation only: every rule here is one the action repeats,
         and the action is what the backend actually sees. -->
    <form method="POST" action="?/save" class="flex w-full flex-col gap-6">
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
                    value={data.project.title}
                    class={FIELD_CLASS}
                />
            </label>

            {#if data.tracks.length > 0}
                <label class={LABEL_CLASS}>
                    Track {hasTrack ? '' : '(optional)'}
                    <select name="trackId" class={FIELD_CLASS}>
                        {#if !hasTrack}
                            <option value="">No track</option>
                        {/if}
                        {#each data.tracks as track (track.id)}
                            <option value={track.id} selected={track.id === data.project.trackId}>
                                {track.name}
                            </option>
                        {/each}
                    </select>
                    {#if hasTrack}
                        <span class="font-normal text-surface-500">
                            A track can be changed but not removed.
                        </span>
                    {/if}
                </label>
            {/if}

            <label class="{LABEL_CLASS} {data.tracks.length > 0 ? '' : 'sm:col-span-2'}">
                Image URL (optional)
                <input
                    type="url"
                    name="image"
                    placeholder="https://…"
                    value={data.project.image ?? ''}
                    class={FIELD_CLASS}
                />
            </label>
        </div>

        <!-- Last and full width: the only field with no natural size, and the one
             where the room is worth having for the source and its preview both. -->
        <div class="{LABEL_CLASS} w-full">
            <label for="project-description">Description</label>
            <MarkdownEditor
                id="project-description"
                name="description"
                value={data.project.description}
                rows={16}
                required
                maxlength={10000}
                placeholder="What is the idea, and what would a team build?"
            />
        </div>

        <div class="flex gap-2">
            <button type="submit" class="btn btn-sm preset-filled-primary-500">
                Save changes
            </button>
            <a href={resolve(`/my/hackathon/${data.hackathonId}/projects/mine`)} class="btn btn-sm preset-tonal-surface no-underline">
                Cancel
            </a>
        </div>
    </form>
</div>
