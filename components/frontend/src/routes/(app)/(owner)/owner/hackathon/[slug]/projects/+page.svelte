<script lang="ts">
    import { enhance } from '$app/forms';
    import { projectStatusLabel, projectStatusBadgePreset } from '$lib/utils/projectStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
    const projects = $derived(data.projects);

    let rowErrors: Record<string, string> = $state({});
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex items-center justify-between gap-4">
        <h1 class="m-0 text-lg font-bold text-surface-950-50">Projects</h1>
    </div>

    {#if projects.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">No projects proposed yet.</p>
    {:else}
        <div class="w-full overflow-x-auto border border-surface-200-800">
            <table class="w-full min-w-[700px] border-collapse text-left text-xs">
                <thead>
                    <tr class="border-b border-surface-200-800 bg-surface-100-900 text-surface-500">
                        <th class="px-3 py-2 font-semibold">Title</th>
                        <th class="px-3 py-2 font-semibold">Track</th>
                        <th class="px-3 py-2 font-semibold">Status</th>
                        <th class="px-3 py-2 font-semibold">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each projects as p (p.id)}
                        <tr class="border-b border-surface-200-800 last:border-0">
                            <td class="px-3 py-2 font-semibold text-surface-950-50">{p.title}</td>
                            <td class="px-3 py-2 text-surface-500">{p.trackName ?? '—'}</td>
                            <td class="px-3 py-2">
                                <span
                                    class="badge {projectStatusBadgePreset(p.status) ?? 'preset-tonal-surface'}"
                                >
                                    {projectStatusLabel(p.status) ?? 'Unknown'}
                                </span>
                            </td>
                            <td class="px-3 py-2">
                                <div class="flex items-center gap-2">
                                    {#if p.status === 2}
                                        <form
                                            method="POST"
                                            action="?/disapprove"
                                            use:enhance={() => {
                                                return async ({ result, update }) => {
                                                    if (result.type === 'failure') {
                                                        rowErrors[p.id] =
                                                            (result.data as { message?: string } | undefined)
                                                                ?.message ?? 'Could not disapprove.';
                                                    } else {
                                                        delete rowErrors[p.id];
                                                    }
                                                    await update();
                                                };
                                            }}
                                        >
                                            <input type="hidden" name="projectId" value={p.id} />
                                            <button type="submit" class="btn btn-sm preset-tonal-surface">
                                                Disapprove
                                            </button>
                                        </form>
                                    {:else}
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
                                            <input type="hidden" name="projectId" value={p.id} />
                                            <button type="submit" class="btn btn-sm preset-filled-primary">
                                                Approve
                                            </button>
                                        </form>
                                    {/if}
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
