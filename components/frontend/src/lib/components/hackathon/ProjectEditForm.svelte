<script lang="ts">
    import { resolve } from '$app/paths';
    import ImageUrlField from '$lib/components/forms/ImageUrlField.svelte';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';

    let {
        project,
        tracks,
        cancelHref,
        message,
        submitLabel = 'Save changes',
    }: {
        /** Empty strings throughout when this is a project being created. */
        project: {
            title: string;
            description: string;
            /** Empty string when the project has no track. */
            trackId: string;
            image?: string;
        };
        tracks: { id: string; name: string }[];
        /** Unresolved path — `resolve()` is called here, at the anchor. */
        cancelHref: string;
        /** Failure text from the action, if the last submit failed. */
        message?: string;
        /** The submit verb. Overridden by the create route, which is not saving
         *  changes to anything yet. */
        submitLabel?: string;
    } = $props();

    // See the TODO in the calling +page.server.ts: `Edit` cannot unset a track,
    // so the "No track" option is offered only while there is nothing to lose
    // by it.
    const hasTrack = $derived(project.trackId !== '');
</script>

<!-- Server-side validation only: every rule here is one the action repeats, and
     the action is what the backend actually sees.

     The `?/save` action name is part of this component's contract — any page
     using it must expose an action by that name. Two do: the project edit route,
     which calls `ProjectService.Edit`, and the organiser's create route
     (`projects/manage/new`), which calls `Propose`. The form is the same either
     way; only the verb on the button and what the action does with it differ. -->
<form method="POST" action="?/save" class="flex w-full flex-col gap-6">
    {#if message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{message}</p>
    {/if}

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label class="field-label sm:col-span-2">
            Title
            <input
                type="text"
                name="title"
                required
                minlength="3"
                maxlength="255"
                value={project.title}
                class="field"
            />
        </label>

        {#if tracks.length > 0}
            <label class="field-label">
                Track {hasTrack ? '' : '(optional)'}
                <select name="trackId" class="field">
                    {#if !hasTrack}
                        <option value="">No track</option>
                    {/if}
                    {#each tracks as track (track.id)}
                        <option value={track.id} selected={track.id === project.trackId}>
                            {track.name}
                        </option>
                    {/each}
                </select>
                {#if hasTrack}
                    <span class="font-normal text-ink-3">
                        A track can be changed but not removed.
                    </span>
                {/if}
            </label>
        {/if}

        <ImageUrlField
            name="image"
            label="Image URL (optional)"
            value={project.image ?? ''}
            class={tracks.length > 0 ? '' : 'sm:col-span-2'}
        />
    </div>

    <!-- Last and full width: the only field with no natural size, and the one
         where the room is worth having for the source and its preview both. -->
    <div class="field-label w-full">
        <label for="project-description">Description</label>
        <MarkdownEditor
            id="project-description"
            name="description"
            value={project.description}
            rows={16}
            required
            maxlength={10000}
            placeholder="What is the idea, and what would a team build?"
        />
    </div>

    <div class="flex gap-2">
        <button type="submit" class="btn btn-sm btn-solid">{submitLabel}</button>
        <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
        <a href={resolve(cancelHref as any)} class="btn btn-sm btn-ghost no-underline">
            Cancel
        </a>
    </div>
</form>
