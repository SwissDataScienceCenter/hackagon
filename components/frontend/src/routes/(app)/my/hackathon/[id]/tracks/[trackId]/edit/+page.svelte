<script lang="ts">
    import { resolve } from '$app/paths';
    import TrackForm from '$lib/components/hackathon/TrackForm.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `TrackForm` calls `resolve()` at its own anchor, and the back
    // link below resolves a literal inline — extracting a resolved string would
    // widen it past the route-literal type `resolve()` expects.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/tracks`);

    // Two-step rather than `confirm()`: a native dialog is unstyleable, invisible
    // to the tests, and blocks the thread. Matches the timeline phase's delete.
    let confirming = $state(false);
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/tracks`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to tracks
        </a>
        <h1 class="m-0 text-title text-ink">Edit Track</h1>
        <p class="m-0 text-xs text-ink-3">
            Changes are visible to participants immediately.
        </p>
    </div>

    <TrackForm
        track={data.track}
        cancelHref={backHref}
        submitLabel="Save changes"
        message={form?.message}
        uploadEndpoint={`/my/hackathon/${data.hackathonId}/media`}
    />

    <div class="flex flex-col gap-2 border-t border-line pt-6">
        <h2 class="m-0 meta">Delete this track</h2>
        {#if confirming}
            <p class="m-0 text-xs text-ink-2">
                Deleting <strong class="text-ink">{data.track.name}</strong> cannot be
                undone. Projects already in it keep no track, they aren't deleted.
            </p>
            <form method="POST" action="?/delete" class="flex gap-2">
                <button type="submit" class="btn btn-sm btn-danger-solid">
                    Delete permanently
                </button>
                <button
                    type="button"
                    onclick={() => (confirming = false)}
                    class="btn btn-sm btn-ghost"
                >
                    Keep it
                </button>
            </form>
        {:else}
            <p class="m-0 text-xs text-ink-2">
                Removes the track for everyone. Projects already assigned to it fall
                back to no track.
            </p>
            <button
                type="button"
                onclick={() => (confirming = true)}
                class="btn btn-sm w-fit btn-danger"
            >
                Delete track
            </button>
        {/if}
    </div>
</div>
