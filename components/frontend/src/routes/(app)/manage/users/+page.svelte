<script lang="ts">
    import { Search } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import { profileDisplayName, profileInitials } from '$lib/utils/profile';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    let search = $state('');

    // Matches every column the table actually shows, so a row the user can read
    // on screen is never filtered out by a term visible in it.
    const filtered = $derived(
        data.users.filter((u) => {
            const q = search.trim().toLowerCase();
            if (q === '') return true;
            return `${u.displayName} ${u.username} ${u.email}`
                .toLowerCase()
                .includes(q);
        })
    );

    const countLabel = $derived(
        data.users.length === 1 ? '1 user' : `${data.users.length} users`
    );
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h1 class="m-0 text-lg font-bold text-surface-950-50">Users</h1>
            <p class="m-0 text-xs text-surface-500">{countLabel} registered on the platform</p>
        </div>
        <div class="relative w-full sm:w-72">
            <Search
                class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2
                       text-surface-400"
                aria-hidden="true"
            />
            <label class="sr-only" for="user-search">Search users</label>
            <input
                id="user-search"
                type="search"
                bind:value={search}
                placeholder="Name, username or email…"
                class="h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950
                       pl-9 pr-3 text-xs text-surface-950-50 placeholder:text-surface-700-300
                       focus:border-primary-500 focus:outline-none"
            />
        </div>
    </div>

    {#if data.users.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">No users found.</p>
    {:else if filtered.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">No users match “{search}”.</p>
    {:else}
        <div class="w-full overflow-x-auto border border-surface-200-800">
            <table class="w-full min-w-[720px] border-collapse text-left text-xs">
                <thead>
                    <tr class="border-b border-surface-200-800 bg-surface-100-900 text-surface-500">
                        <th class="px-3 py-2 font-semibold">
                            <span class="sr-only">Avatar</span>
                        </th>
                        <th class="px-3 py-2 font-semibold">Display Name</th>
                        <th class="px-3 py-2 font-semibold">Username</th>
                        <th class="px-3 py-2 font-semibold">Email</th>
                        <th class="px-3 py-2 font-semibold">Joined</th>
                        <th class="px-3 py-2 font-semibold">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each filtered as user (user.id)}
                        <tr class="border-b border-surface-200-800 last:border-0">
                            <td class="px-3 py-2">
                                <div
                                    class="flex size-8 shrink-0 items-center justify-center
                                           rounded-full border-2 border-surface-200-800
                                           bg-surface-200-800 text-[10px] font-bold
                                           text-surface-950-50"
                                    aria-hidden="true"
                                >
                                    {profileInitials(user.displayName, user.username)}
                                </div>
                            </td>
                            <td class="px-3 py-2 font-semibold text-surface-950-50">
                                <!-- Only an admin reaches this table, and Get requires
                                     the same user:read permission, so this link never
                                     lands on a 403 from here. -->
                                <a
                                    href={resolve(`/people/${user.id}`)}
                                    class="text-surface-950-50 no-underline hover:underline"
                                >
                                    {profileDisplayName(user.displayName, user.username)}
                                </a>
                            </td>
                            <td class="px-3 py-2 text-surface-500">{user.username}</td>
                            <td class="px-3 py-2 text-surface-500">{user.email || '—'}</td>
                            <td class="px-3 py-2 text-surface-500">
                                {user.createdAt
                                    ? new Date(user.createdAt).toLocaleDateString()
                                    : '—'}
                            </td>
                            <td class="px-3 py-2">
                                <!-- Disabled until the backend can grant a global role.
                                     UserService.AddRole/RemoveRole have proto contracts and a
                                     generated client, but no handler in
                                     internal/service/user_service.go — they return
                                     UNIMPLEMENTED — and the casbin enforcer has
                                     AddGlobalRole with no RemoveGlobalRole counterpart.
                                     Wire this up once both exist. -->
                                <button
                                    type="button"
                                    disabled
                                    class="btn btn-sm preset-tonal-surface cursor-not-allowed
                                           opacity-50"
                                    title="Role assignment is not available yet"
                                >
                                    Assign role
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
