<script lang="ts">
    import PhaseForm from '$lib/components/hackathon/PhaseForm.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Unresolved: `PhaseForm` and `PageHeader` call `resolve()` at their own
    // anchors.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/timeline/manage`);

    // Two-step rather than `confirm()`: a native dialog is unstyleable, invisible
    // to the tests, and blocks the thread. This is the app's first destructive
    // action, so it sets the pattern — the real button only exists once asked for.
    let confirming = $state(false);
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <PageHeader title="Edit Phase" back={{ href: backHref, label: 'Manage Timeline' }}>
        {#snippet meta()}
            <!-- Says why they are here when they did not choose to be: New Phase
                 redirects onto this form because creating a phase cannot store its
                 dates. Without the line, an organizer who clicked "Add phase" lands on
                 a page titled "Edit Phase" and has to work out what happened. -->
            <p class="m-0">
                {#if data.justAdded}
                    <strong class="text-ink">{data.phase.name} was added.</strong>
                    Give it a start and an end to place it on the timeline — or save it as
                    it is and schedule it later.
                {:else}
                    Changes are visible to participants immediately.
                {/if}
            </p>
        {/snippet}
    </PageHeader>

    <PhaseForm
        phase={data.phase}
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
