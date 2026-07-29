<script lang="ts">
    import { resolve } from '$app/paths';
    import { Search } from 'lucide-svelte';
    import {
        statusLabel,
        statusBadgePreset,
        visibilityLabel,
        visibilityBadgePreset,
    } from '$lib/utils/hackathonStatus';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let search = $state('');

    const filtered = $derived(
        data.hackathons.filter((h) => {
            const q = search.trim().toLowerCase();
            if (q === '') return true;
            return h.name.toLowerCase().includes(q);
        })
    );
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 class="m-0 text-lg font-bold text-surface-950-50">Hackathons</h1>
        <div class="flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:items-center">
            <div class="relative w-full sm:w-72">
                <Search
                    class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5
                           -translate-y-1/2 text-surface-400"
                    aria-hidden="true"
                />
                <input
                    type="search"
                    bind:value={search}
                    placeholder="Search by name…"
                    class="h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950
                           pl-9 pr-3 text-xs text-surface-950-50 placeholder:text-surface-700-300
                           focus:border-primary-500 focus:outline-none"
                />
            </div>
            <a href={resolve('/(app)/(admin)/hackathons/new')} class="btn btn-sm preset-filled-primary">
                Create Hackathon
            </a>
        </div>
    </div>

    {#if filtered.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">No hackathons found.</p>
    {:else}
        <div class="w-full overflow-x-auto border border-surface-200-800">
            <table class="w-full min-w-[900px] border-collapse text-left text-xs">
                <thead>
                    <tr class="border-b border-surface-200-800 bg-surface-100-900 text-surface-500">
                        <th class="px-3 py-2 font-semibold">Name</th>
                        <th class="px-3 py-2 font-semibold">Status</th>
                        <th class="px-3 py-2 font-semibold">Visibility</th>
                        <th class="px-3 py-2 font-semibold">Starts</th>
                        <th class="px-3 py-2 font-semibold">Ends</th>
                        <th class="px-3 py-2 font-semibold">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each filtered as h (h.id)}
                        <tr class="border-b border-surface-200-800 last:border-0">
                            <td class="px-3 py-2 font-semibold">
                                <a
                                    href={resolve(`/hackathons/${h.id}`)}
                                    class="text-surface-950-50 no-underline hover:underline"
                                >
                                    {h.name}
                                </a>
                            </td>
                            <td class="px-3 py-2">
                                {#if statusLabel(h.status)}
                                    <span class="badge {statusBadgePreset(h.status)}">
                                        {statusLabel(h.status)}
                                    </span>
                                {/if}
                            </td>
                            <td class="px-3 py-2">
                                {#if visibilityLabel(h.visibility)}
                                    <span class="badge {visibilityBadgePreset(h.visibility)}">
                                        {visibilityLabel(h.visibility)}
                                    </span>
                                {/if}
                            </td>
                            <td class="px-3 py-2 text-surface-500">
                                {h.startsAt ? new Date(h.startsAt).toLocaleDateString() : '—'}
                            </td>
                            <td class="px-3 py-2 text-surface-500">
                                {h.endsAt ? new Date(h.endsAt).toLocaleDateString() : '—'}
                            </td>
                            <td class="px-3 py-2">
                                <div class="flex gap-2">
                                    <a
                                        href={resolve(`/hackathons/${h.id}`)}
                                        class="btn btn-sm preset-tonal-surface"
                                    >
                                        View
                                    </a>
                                    <a
                                        href={resolve(`/hackathons/${h.id}/edit`)}
                                        class="btn btn-sm preset-tonal-surface"
                                    >
                                        Edit
                                    </a>
                                    <button
                                        type="button"
                                        disabled
                                        class="btn btn-sm preset-tonal-surface cursor-not-allowed opacity-50"
                                        title="Not available yet"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
