<script lang="ts">
    import { resolve } from '$app/paths';
    import PhaseForm from '$lib/components/hackathon/PhaseForm.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `PhaseForm` calls `resolve()` at its own anchor, and the back
    // link below resolves a literal inline — extracting a resolved string would
    // widen it past the route-literal type `resolve()` expects.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/timeline/manage`);

    // Two-step rather than `confirm()`: a native dialog is unstyleable, invisible
    // to the tests, and blocks the thread. This is the app's first destructive
    // action, so it sets the pattern — the real button only exists once asked for.
    let confirming = $state(false);
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/timeline/manage`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to Manage Timeline
        </a>
        <h1 class="m-0 text-title text-ink">Edit Phase</h1>
        <!-- Says why they are here when they did not choose to be: Add Phase
             redirects onto this form because creating a phase cannot store its
             dates. Without the line, an organizer who clicked "Add phase" lands on
             a page titled "Edit Phase" and has to work out what happened. -->
        <p class="m-0 text-xs text-ink-3">
            {#if data.justAdded}
                <strong class="text-ink">{data.phase.name} was added.</strong>
                Give it a start and an end to place it on the timeline — or save it as
                it is and schedule it later.
            {:else}
                Changes are visible to participants immediately.
            {/if}
        </p>
    </div>

    <PhaseForm
        phase={data.phase}
        pages={data.pages}
        cancelHref={backHref}
        submitLabel="Save changes"
        message={form?.message}
    />

    <div class="flex flex-col gap-2 border-t border-line pt-6">
        <h2 class="m-0 meta">Delete this phase</h2>
        {#if confirming}
            <p class="m-0 text-xs text-ink-2">
                Deleting <strong class="text-ink">{data.phase.name}</strong> cannot
                be undone. Any page linked to it stays, only the phase goes.
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
                Removes the phase from the timeline for everyone.
            </p>
            <button
                type="button"
                onclick={() => (confirming = true)}
                class="btn btn-sm w-fit btn-danger"
            >
                Delete phase
            </button>
        {/if}
    </div>
</div>
