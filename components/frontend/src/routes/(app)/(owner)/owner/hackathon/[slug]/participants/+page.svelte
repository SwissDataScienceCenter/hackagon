<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const participants = $derived(data.participants);

    let rowErrors: Record<string, string> = $state({});

    function formatDate(d?: Date): string {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
    }
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <h1 class="m-0 text-lg font-bold text-surface-950-50">Participants</h1>

    {#if participants.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">No participants yet.</p>
    {:else}
        <div class="w-full overflow-x-auto border border-surface-200-800">
            <table class="w-full min-w-[700px] border-collapse text-left text-xs">
                <thead>
                    <tr class="border-b border-surface-200-800 bg-surface-100-900 text-surface-500">
                        <th class="px-3 py-2 font-semibold">Name</th>
                        <th class="px-3 py-2 font-semibold">Email</th>
                        <th class="px-3 py-2 font-semibold">Status</th>
                        <th class="px-3 py-2 font-semibold">Joined</th>
                        <th class="px-3 py-2 font-semibold">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each participants as p (p.id)}
                        <tr class="border-b border-surface-200-800 last:border-0">
                            <td class="px-3 py-2 font-semibold text-surface-950-50">{p.name}</td>
                            <td class="px-3 py-2 text-surface-500">{p.email}</td>
                            <td class="px-3 py-2 text-surface-500">{p.roleLabel}</td>
                            <td class="px-3 py-2 text-surface-500">{formatDate(p.joinedAt)}</td>
                            <td class="px-3 py-2">
                                <div class="flex items-center gap-2">
                                    {#if p.isWaiting}
                                        <form
                                            method="POST"
                                            action="?/approve"
                                            use:enhance={() => {
                                                return async ({ result, update }) => {
                                                    if (result.type === 'failure') {
                                                        rowErrors[p.id] =
                                                            (result.data as { message?: string } | undefined)
                                                                ?.message ?? 'Could not approve.';
                                                    } else {
                                                        delete rowErrors[p.id];
                                                    }
                                                    await update();
                                                };
                                            }}
                                        >
                                            <input type="hidden" name="userId" value={p.id} />
                                            <button type="submit" class="btn btn-sm preset-filled-primary-500">
                                                Approve
                                            </button>
                                        </form>
                                    {/if}
                                    <form
                                        method="POST"
                                        action="?/remove"
                                        use:enhance={() => {
                                            return async ({ result, update }) => {
                                                if (result.type === 'failure') {
                                                    rowErrors[p.id] =
                                                        (result.data as { message?: string } | undefined)
                                                            ?.message ?? 'Could not remove.';
                                                } else {
                                                    delete rowErrors[p.id];
                                                }
                                                await update();
                                            };
                                        }}
                                    >
                                        <input type="hidden" name="userId" value={p.id} />
                                        <button type="submit" class="btn btn-sm preset-tonal-surface">
                                            Remove
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
