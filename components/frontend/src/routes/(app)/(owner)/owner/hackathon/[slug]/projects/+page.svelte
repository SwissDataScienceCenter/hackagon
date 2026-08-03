<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // Pending is the queue an owner actually comes here to act on.
    let tab: 'pending' | 'approved' = $state('pending');
    const shown = $derived(tab === 'pending' ? data.pending : data.approved);

    let rowErrors: Record<string, string> = $state({});

    function formatDate(d: Date | undefined): string {
        if (!d) return '—';
        return d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    const TAB_BASE = 'btn btn-sm h-9 rounded-none px-3 text-xs font-semibold transition-colors';
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <h1 class="m-0 text-lg font-bold text-surface-950-50">Projects</h1>

    <div class="flex gap-1">
        <button
            type="button"
            onclick={() => (tab = 'pending')}
            aria-current={tab === 'pending' ? 'true' : undefined}
            class="{TAB_BASE} {tab === 'pending'
                ? 'preset-filled-primary-500'
                : 'preset-tonal-surface'}"
        >
            Proposed ({data.pending.length})
        </button>
        <button
            type="button"
            onclick={() => (tab = 'approved')}
            aria-current={tab === 'approved' ? 'true' : undefined}
            class="{TAB_BASE} {tab === 'approved'
                ? 'preset-filled-primary-500'
                : 'preset-tonal-surface'}"
        >
            Approved ({data.approved.length})
        </button>
    </div>

    {#if shown.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">
            {tab === 'pending'
                ? 'No proposals waiting for review.'
                : 'No projects approved yet.'}
        </p>
    {:else}
        <div class="w-full overflow-x-auto border border-surface-200-800">
            <table class="w-full min-w-[700px] border-collapse text-left text-xs">
                <thead>
                    <tr class="border-b border-surface-200-800 bg-surface-100-900 text-surface-500">
                        <th class="px-3 py-2 font-semibold">Title</th>
                        <th class="px-3 py-2 font-semibold">Proposed by</th>
                        <th class="px-3 py-2 font-semibold">Created</th>
                        <th class="px-3 py-2 font-semibold">Updated</th>
                        <th class="px-3 py-2 font-semibold">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each shown as p (p.id)}
                        <tr class="border-b border-surface-200-800 last:border-0">
                            <td class="px-3 py-2 font-semibold text-surface-950-50">{p.title}</td>
                            <td class="px-3 py-2 text-surface-500">{p.creatorName}</td>
                            <td class="px-3 py-2 text-surface-500">{formatDate(p.createdAt)}</td>
                            <td class="px-3 py-2 text-surface-500">{formatDate(p.modifiedAt)}</td>
                            <td class="px-3 py-2">
                                <div class="flex items-center gap-2">
                                    <form
                                        method="POST"
                                        action={tab === 'pending' ? '?/approve' : '?/disapprove'}
                                        use:enhance={() => {
                                            return async ({ result, update }) => {
                                                if (result.type === 'failure') {
                                                    rowErrors[p.id] =
                                                        (result.data as { message?: string } | undefined)
                                                            ?.message ?? 'Could not update.';
                                                } else {
                                                    delete rowErrors[p.id];
                                                }
                                                await update();
                                            };
                                        }}
                                    >
                                        <input type="hidden" name="projectId" value={p.id} />
                                        <button
                                            type="submit"
                                            class="btn btn-sm {tab === 'pending'
                                                ? 'preset-filled-primary'
                                                : 'preset-tonal-surface'}"
                                        >
                                            {tab === 'pending' ? 'Approve' : 'Disapprove'}
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
