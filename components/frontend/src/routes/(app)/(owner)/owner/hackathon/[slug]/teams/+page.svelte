<script lang="ts">
    import { resolve } from '$app/paths';
    import { enhance } from '$app/forms';
    import Select from '$lib/components/forms/Select.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const slug = $derived(data.hackathonId);
    const teams = $derived(data.teams);

    let rowErrors: Record<string, string> = $state({});
    let expanded: Record<string, boolean> = $state({});

    function toggle(teamId: string) {
        expanded[teamId] = !expanded[teamId];
    }
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
                            <td class="px-3 py-2 text-surface-500">
                                {#if t.members.length === 0}
                                    <span class="text-surface-400">None</span>
                                {:else}
                                    {t.members.map((m) => m.name).join(', ')}
                                {/if}
                            </td>
                            <td class="px-3 py-2">
                                <div class="flex items-center gap-2">
                                    <button
                                        type="button"
                                        class="btn btn-sm preset-tonal-surface"
                                        onclick={() => toggle(t.id)}
                                    >
                                        {expanded[t.id] ? 'Hide members' : 'Manage members'}
                                    </button>
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
                        {#if expanded[t.id]}
                            <tr class="border-b border-surface-200-800 bg-surface-100-900 last:border-0">
                                <td colspan="4" class="px-3 py-3">
                                    <div class="flex flex-col gap-3">
                                        {#if t.members.length === 0}
                                            <p class="m-0 text-xs text-surface-500">No members assigned yet.</p>
                                        {:else}
                                            <ul class="m-0 flex flex-col gap-1 p-0">
                                                {#each t.members as member (member.id)}
                                                    <li class="flex items-center justify-between gap-2">
                                                        <span class="text-xs text-surface-950-50">{member.name}</span>
                                                        <form
                                                            method="POST"
                                                            action="?/removeMember"
                                                            use:enhance={() => {
                                                                return async ({ result, update }) => {
                                                                    if (result.type === 'failure') {
                                                                        rowErrors[t.id] =
                                                                            (result.data as { message?: string } | undefined)
                                                                                ?.message ?? 'Could not remove member.';
                                                                    } else {
                                                                        delete rowErrors[t.id];
                                                                    }
                                                                    await update();
                                                                };
                                                            }}
                                                        >
                                                            <input type="hidden" name="teamId" value={t.id} />
                                                            <input type="hidden" name="userId" value={member.id} />
                                                            <button type="submit" class="btn btn-sm preset-tonal-surface">
                                                                Remove
                                                            </button>
                                                        </form>
                                                    </li>
                                                {/each}
                                            </ul>
                                        {/if}

                                        {#if t.available.length > 0}
                                            <form
                                                method="POST"
                                                action="?/assign"
                                                class="flex items-center gap-2"
                                                use:enhance={() => {
                                                    return async ({ result, update }) => {
                                                        if (result.type === 'failure') {
                                                            rowErrors[t.id] =
                                                                (result.data as { message?: string } | undefined)
                                                                    ?.message ?? 'Could not add member.';
                                                        } else {
                                                            delete rowErrors[t.id];
                                                        }
                                                        await update();
                                                    };
                                                }}
                                            >
                                                <input type="hidden" name="teamId" value={t.id} />
                                                <div class="w-56">
                                                    <Select
                                                        name="userId"
                                                        placeholder="Choose a participant…"
                                                        options={t.available.map((p) => ({
                                                            label: p.name,
                                                            value: p.id
                                                        }))}
                                                    />
                                                </div>
                                                <button type="submit" class="btn btn-sm preset-filled-primary">
                                                    Add
                                                </button>
                                            </form>
                                        {:else}
                                            <p class="m-0 text-xs text-surface-500">
                                                No other confirmed participants available to add.
                                            </p>
                                        {/if}
                                    </div>
                                </td>
                            </tr>
                        {/if}
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
