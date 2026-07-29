<script lang="ts">
    import { resolve } from '$app/paths';
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const slug = $derived(data.hackathonId);
    const teams = $derived(data.teams);

    let rowErrors: Record<string, string> = $state({});
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex items-center justify-between gap-4">
        <h1 class="m-0 text-lg font-bold text-surface-950-50">Teams</h1>
        <a href={resolve(`/owner/hackathon/${slug}/teams/new`)} class="btn btn-sm preset-filled-primary">
            New Team
        </a>
    </div>

    {#if teams.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">No teams yet.</p>
    {:else}
        <div class="w-full overflow-x-auto border border-surface-200-800">
            <table class="w-full min-w-[700px] border-collapse text-left text-xs">
                <thead>
                    <tr class="border-b border-surface-200-800 bg-surface-100-900 text-surface-500">
                        <th class="px-3 py-2 font-semibold">Name</th>
                        <th class="px-3 py-2 font-semibold">Project</th>
                        <th class="px-3 py-2 font-semibold">Members</th>
                        <th class="px-3 py-2 font-semibold">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each teams as t (t.id)}
                        <tr class="border-b border-surface-200-800 last:border-0">
                            <td class="px-3 py-2 font-semibold text-surface-950-50">{t.name}</td>
                            <td class="px-3 py-2 text-surface-500">{t.projectTitle}</td>
                            <td class="px-3 py-2 text-surface-500">{t.memberCount}</td>
                            <td class="px-3 py-2">
                                <div class="flex items-center gap-2">
                                    <a
                                        href={resolve(`/owner/hackathon/${slug}/teams/${t.id}/edit`)}
                                        class="btn btn-sm preset-tonal-surface"
                                    >
                                        Edit
                                    </a>
                                    <form
                                        method="POST"
                                        action="?/delete"
                                        use:enhance={() => {
                                            return async ({ result, update }) => {
                                                if (result.type === 'failure') {
                                                    rowErrors[t.id] =
                                                        (result.data as { message?: string } | undefined)
                                                            ?.message ?? 'Could not delete.';
                                                } else {
                                                    delete rowErrors[t.id];
                                                }
                                                await update();
                                            };
                                        }}
                                    >
                                        <input type="hidden" name="teamId" value={t.id} />
                                        <button type="submit" class="btn btn-sm preset-tonal-surface">
                                            Delete
                                        </button>
                                    </form>
                                    {#if rowErrors[t.id]}
                                        <span class="text-xs text-error-500">{rowErrors[t.id]}</span>
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
