<script lang="ts">
    import { resolve } from '$app/paths';
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const slug = $derived(data.hackathonId);
    const pages = $derived(data.pages);

    let rowErrors: Record<string, string> = $state({});
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex items-center justify-between gap-4">
        <h1 class="m-0 text-lg font-bold text-surface-950-50">Pages</h1>
        <a href={resolve(`/owner/hackathon/${slug}/pages/new`)} class="btn btn-sm preset-filled-primary">
            New Page
        </a>
    </div>

    {#if pages.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">No pages yet.</p>
    {:else}
        <div class="w-full overflow-x-auto border border-surface-200-800">
            <table class="w-full min-w-[700px] border-collapse text-left text-xs">
                <thead>
                    <tr class="border-b border-surface-200-800 bg-surface-100-900 text-surface-500">
                        <th class="px-3 py-2 font-semibold">Title</th>
                        <th class="px-3 py-2 font-semibold">Visibility</th>
                        <th class="px-3 py-2 font-semibold">Phase</th>
                        <th class="px-3 py-2 font-semibold">Order</th>
                        <th class="px-3 py-2 font-semibold">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each pages as p (p.id)}
                        <tr class="border-b border-surface-200-800 last:border-0">
                            <td class="px-3 py-2 font-semibold text-surface-950-50">{p.title}</td>
                            <td class="px-3 py-2">
                                <span class="badge {p.visible ? 'preset-tonal-primary' : 'preset-tonal-surface'}">
                                    {p.visible ? 'Visible' : 'Hidden'}
                                </span>
                            </td>
                            <td class="px-3 py-2 text-surface-500">
                                {#if p.phaseId}
                                    <a
                                        href="{resolve(`/hackathon/${slug}/timeline`)}?phase={p.phaseId}"
                                        class="text-primary-700-300 no-underline hover:underline"
                                    >
                                        {p.phaseName ?? 'Linked phase'}
                                    </a>
                                {:else}
                                    —
                                {/if}
                            </td>
                            <td class="px-3 py-2 text-surface-500">{p.order}</td>
                            <td class="px-3 py-2">
                                <div class="flex items-center gap-2">
                                    <a
                                        href={resolve(`/owner/hackathon/${slug}/pages/${p.id}/edit`)}
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
                                        <input type="hidden" name="pageId" value={p.id} />
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
