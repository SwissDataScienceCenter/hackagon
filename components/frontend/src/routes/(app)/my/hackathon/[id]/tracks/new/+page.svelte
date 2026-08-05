<script lang="ts">
    import { resolve } from '$app/paths';
    import TrackForm from '$lib/components/hackathon/TrackForm.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `TrackForm` calls `resolve()` at its own anchor, and the back
    // link below resolves a literal inline — extracting a resolved string would
    // widen it past the route-literal type `resolve()` expects.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/tracks`);

    const blank = { name: '', description: '' };
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/tracks`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to tracks
        </a>
        <h1 class="m-0 text-title text-ink">New Track</h1>
        <p class="m-0 text-xs text-ink-3">
            Participants can pick it when proposing or editing a project.
        </p>
    </div>

    <TrackForm track={blank} cancelHref={backHref} submitLabel="Create track" message={form?.message} />
</div>
