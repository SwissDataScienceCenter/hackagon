<script lang="ts">
    import { resolve } from '$app/paths';
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const slug = $derived(data.hackathonId);
    const phases = $derived(data.phases);
    const currentPhaseId = $derived(data.currentPhaseId);

    // Absent until someone advances: until then members see a phase derived from
    // dates, which is right before an event and wrong during one.
    const currentName = $derived(phases.find((p) => p.id === currentPhaseId)?.name);

    let rowErrors: Record<string, string> = $state({});

    function formatDate(d?: Date): string {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
    }
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex items-center justify-between gap-4">
        <h1 class="m-0 text-lg font-bold text-surface-950-50">Timeline</h1>
        <a href={resolve(`/owner/hackathon/${slug}/timeline/new`)} class="btn btn-sm preset-filled-primary">
            New Phase
        </a>
    </div>

    <!-- Where the event is according to the organizer, which is what members
         see once it has been set. -->
    <div class="flex flex-wrap items-center gap-2 border border-surface-200-800 bg-surface-100-900 px-3 py-2 text-xs">
        <span class="text-surface-500">Current phase</span>
        {#if currentName}
            <span class="badge preset-filled-primary-500">{currentName}</span>
        {:else}
            <span class="text-surface-600-400">
                Not set — members see the phase derived from dates. Advance to a phase
                to take over.
            </span>
        {/if}
    </div>

    {#if phases.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">No phases yet.</p>
    {:else}
        <div class="w-full overflow-x-auto border border-surface-200-800">
            <table class="w-full min-w-[700px] border-collapse text-left text-xs">
                <thead>
                    <tr class="border-b border-surface-200-800 bg-surface-100-900 text-surface-500">
                        <th class="px-3 py-2 font-semibold">Name</th>
                        <th class="px-3 py-2 font-semibold">Starts</th>
                        <th class="px-3 py-2 font-semibold">Ends</th>
                        <th class="px-3 py-2 font-semibold">Page</th>
                        <th class="px-3 py-2 font-semibold">Advancing here</th>
                        <th class="px-3 py-2 font-semibold">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each phases as p (p.id)}
                        <tr class="border-b border-surface-200-800 last:border-0">
                            <td class="px-3 py-2 font-semibold text-surface-950-50">
                                <span class="flex flex-wrap items-center gap-1.5">
                                    {p.name}
                                    {#if p.id === currentPhaseId}
                                        <span class="badge preset-filled-primary-500 text-xs">Current</span>
                                    {/if}
                                </span>
                            </td>
                            <td class="px-3 py-2 text-surface-500">{formatDate(p.startsAt)}</td>
                            <td class="px-3 py-2 text-surface-500">{formatDate(p.endsAt)}</td>
                            <td class="px-3 py-2 text-surface-500">{p.pageTitle ?? '—'}</td>
                            <td class="px-3 py-2">
                                {#if p.opens.length === 0 && p.closes.length === 0}
                                    <span class="text-surface-500">No change</span>
                                {:else}
                                    <div class="flex flex-col gap-1">
                                        {#if p.opens.length > 0}
                                            <span class="text-surface-600-400">
                                                Opens {p.opens.join(', ')}
                                            </span>
                                        {/if}
                                        {#if p.closes.length > 0}
                                            <span class="text-surface-600-400">
                                                Closes {p.closes.join(', ')}
                                            </span>
                                        {/if}
                                    </div>
                                {/if}
                            </td>
                            <td class="px-3 py-2">
                                <div class="flex items-center gap-2">
                                    {#if p.id !== currentPhaseId}
                                        <form
                                            method="POST"
                                            action="?/advance"
                                            use:enhance={() => {
                                                return async ({ result, update }) => {
                                                    if (result.type === 'failure') {
                                                        rowErrors[p.id] =
                                                            (result.data as { message?: string } | undefined)
                                                                ?.message ?? 'Could not advance.';
                                                    } else {
                                                        delete rowErrors[p.id];
                                                    }
                                                    await update();
                                                };
                                            }}
                                        >
                                            <input type="hidden" name="phaseId" value={p.id} />
                                            <button type="submit" class="btn btn-sm preset-filled-primary">
                                                Advance here
                                            </button>
                                        </form>
                                    {/if}
                                    <a
                                        href={resolve(`/owner/hackathon/${slug}/timeline/${p.id}/edit`)}
                                        class="btn btn-sm preset-tonal-surface"
                                    >
                                        Edit
                                    </a>
                                    {#if p.pageId}
                                        <a
                                            href={resolve(`/owner/hackathon/${slug}/pages/${p.pageId}/edit`)}
                                            class="btn btn-sm preset-tonal-surface"
                                        >
                                            Edit page
                                        </a>
                                    {:else}
                                        <a
                                            href={resolve(`/owner/hackathon/${slug}/timeline/${p.id}/page/new`)}
                                            class="btn btn-sm preset-tonal-surface"
                                        >
                                            Add page
                                        </a>
                                    {/if}
                                    <form
                                        method="POST"
                                        action="?/delete"
                                        use:enhance={() => {
                                            return async ({ result, update }) => {
                                                if (result.type === 'failure') {
                                                    rowErrors[p.id] =
                                                        (result.data as { message?: string } | undefined)
                                                            ?.message ?? 'Could not delete.';
                                                } else {
                                                    delete rowErrors[p.id];
                                                }
                                                await update();
                                            };
                                        }}
                                    >
                                        <input type="hidden" name="phaseId" value={p.id} />
                                        <button type="submit" class="btn btn-sm preset-tonal-surface">
                                            Delete
                                        </button>
                                    </form>
                                    {#if rowErrors[p.id]}
                                        <span class="text-xs text-error-500">{rowErrors[p.id]}</span>
                                    {/if}
                                </div>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
