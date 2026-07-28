<script lang="ts">
    import { Search } from 'lucide-svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let search = $state('');

    const filtered = $derived(
        data.users.filter((u) => {
            const q = search.trim().toLowerCase();
            if (q === '') return true;
            return `${u.displayName} ${u.username} ${u.email}`.toLowerCase().includes(q);
        })
    );

    function initials(displayName: string, username: string): string {
        const source = displayName.trim() || username;
        return source
            .split(' ')
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    }
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 class="m-0 text-lg font-bold text-surface-950-50">Users Administrator Panel</h1>
        <div class="relative w-full sm:w-72">
            <Search
                class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5
                       -translate-y-1/2 text-surface-400"
                aria-hidden="true"
            />
            <input
                type="search"
                bind:value={search}
                placeholder="Enter display name…"
                class="h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950
                       pl-9 pr-3 text-xs text-surface-950-50 placeholder:text-surface-700-300
                       focus:border-primary-500 focus:outline-none"
            />
        </div>
    </div>

    {#if filtered.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">No users found.</p>
    {:else}
        <div class="w-full overflow-x-auto border border-surface-200-800">
            <table class="w-full min-w-[900px] border-collapse text-left text-xs">
                <thead>
                    <tr class="border-b border-surface-200-800 bg-surface-100-900 text-surface-500">
                        <th class="px-3 py-2 font-semibold">Photo</th>
                        <th class="px-3 py-2 font-semibold">Display Name</th>
                        <th class="px-3 py-2 font-semibold">SurName</th>
                        <th class="px-3 py-2 font-semibold">Name</th>
                        <th class="px-3 py-2 font-semibold">Email</th>
                        <th class="px-3 py-2 font-semibold">Status</th>
                        <th class="px-3 py-2 font-semibold">Employer's Category</th>
                        <th class="px-3 py-2 font-semibold">Employer</th>
                        <th class="px-3 py-2 font-semibold">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each filtered as user (user.id)}
                        <tr class="border-b border-surface-200-800 last:border-0">
                            <td class="px-3 py-2">
                                <div
                                    class="flex size-8 shrink-0 items-center justify-center rounded-full
                                           border-2 border-surface-200-800 bg-surface-200-800 text-[10px]
                                           font-bold text-surface-950-50"
                                >
                                    {initials(user.displayName, user.username)}
                                </div>
                            </td>
                            <td class="px-3 py-2 font-semibold">{user.displayName || user.username}</td>
                            <td class="px-3 py-2 text-surface-500">—</td>
                            <td class="px-3 py-2 text-surface-500">—</td>
                            <td class="px-3 py-2">{user.email}</td>
                            <td class="px-3 py-2 text-surface-500">—</td>
                            <td class="px-3 py-2 text-surface-500">—</td>
                            <td class="px-3 py-2 text-surface-500">—</td>
                            <td class="px-3 py-2">
                                <button
                                    type="button"
                                    disabled
                                    class="btn btn-sm preset-tonal-surface cursor-not-allowed opacity-50"
                                    title="Not available yet"
                                >
                                    Edit
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
