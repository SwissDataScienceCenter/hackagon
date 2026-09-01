<script lang="ts">
    import { resolve } from '$app/paths';
    import ImageUrlField from '$lib/components/forms/ImageUrlField.svelte';
    import MarkdownEditor from '$lib/components/forms/MarkdownEditor.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/projects`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to projects
        </a>
        <h1 class="m-0 text-title text-ink">Propose a Project</h1>
        <p class="m-0 text-xs text-ink-3">
            {#if data.mayPropose}
                An organizer reviews it before it appears on the Projects page. You can keep
                editing it in the meantime.
            {:else}
                This hackathon does not take project proposals — its organizers put the projects
                up themselves.
            {/if}
        </p>
    </div>

    <!-- Server-side validation only: every rule here is one the action repeats,
         and the action is what the backend actually sees. -->
    {#if data.mayPropose}
        <form method="POST" action="?/propose" class="flex w-full flex-col gap-6">
            {#if form?.message}
                <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
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
                        placeholder="Realtime dashboard for sensor data"
                        class="field"
                    />
                </label>

                <!-- Omitted entirely when the hackathon defines no tracks: an empty
                     picker asks a question with no answers. -->
                {#if data.tracks.length > 0}
                    <label class="field-label">
                        Track (optional)
                        <select name="trackId" class="field">
                            <option value="">No track</option>
                            {#each data.tracks as track (track.id)}
                                <option value={track.id}>{track.name}</option>
                            {/each}
                        </select>
                    </label>
                {/if}

                <ImageUrlField
                    name="image"
                    label="Image URL (optional)"
                    class={data.tracks.length > 0 ? '' : 'sm:col-span-2'}
                />
            </div>

            <!-- Last and full width: the only field with no natural size, and the one
                 where the room is worth having for the source and its preview both. -->
            <div class="field-label w-full">
                <label for="project-description">Description</label>
                <MarkdownEditor
                    id="project-description"
                    name="description"
                    rows={16}
                    maxlength={10000}
                    placeholder="What is the idea, and what would a team build?"
                />
            </div>

            <button type="submit" class="btn btn-sm btn-solid self-start">
                Propose project
            </button>
        </form>
    {/if}
</div>
