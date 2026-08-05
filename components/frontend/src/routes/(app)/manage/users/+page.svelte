<script lang="ts">
    import { Search } from 'lucide-svelte';
    import { ASSIGNABLE_GLOBAL_ROLES, globalRoleBadgePreset, globalRoleLabel } from '$lib/utils/globalRole';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let search = $state('');

    // Matches every column the table actually shows, so a row the user can read
    // on screen is never filtered out by a term visible in it.
    const filtered = $derived(
        data.users.filter((u) => {
            const q = search.trim().toLowerCase();
            if (q === '') return true;
            const roleNames = u.roles.map((r) => globalRoleLabel(r) ?? '').join(' ');
            return `${u.displayName} ${u.username} ${u.email} ${roleNames}`
                .toLowerCase()
                .includes(q);
        })
    );

    const countLabel = $derived(
        data.users.length === 1 ? '1 user' : `${data.users.length} users`
    );

    // Keycloak may leave display_name empty, hence the username fallback; '?'
    // covers both being blank, so the avatar is never an empty circle that
    // reads as a rendering fault.
    function initials(displayName: string, username: string): string {
        const source = displayName.trim() || username.trim();
        const letters = source
            .split(/\s+/)
            .map((w) => w[0] ?? '')
            .join('')
            .toUpperCase()
            .slice(0, 2);
        return letters || '?';
    }

    // Every assignable role the user doesn't already hold — what the picker in
    // Actions offers, since granting a role a user already has is a no-op the
    // UI shouldn't invite.
    function missingRoles(roles: number[]): number[] {
        return ASSIGNABLE_GLOBAL_ROLES.filter((r) => !roles.includes(r));
    }
</script>

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h1 class="m-0 text-title text-ink">Users</h1>
            <p class="m-0 text-xs text-ink-3">{countLabel} registered on the platform</p>
        </div>
        <div class="relative w-full sm:w-72">
            <Search
                class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2
                       text-ink-3"
                aria-hidden="true"
            />
            <label class="sr-only" for="user-search">Search users</label>
            <input
                id="user-search"
                type="search"
                bind:value={search}
                placeholder="Name, username or email…"
                class="field pl-9 pr-3"
            />
        </div>
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-error-500" role="alert">{form.message}</p>
    {/if}

    {#if data.users.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">No users found.</p>
    {:else if filtered.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">No users match “{search}”.</p>
    {:else}
        <div class="w-full overflow-x-auto rounded-card border border-line">
            <table class="w-full min-w-[720px] border-collapse text-left text-xs">
                <thead>
                    <tr class="border-b border-line bg-raised text-ink-3">
                        <th class="px-3 py-2 font-semibold">
                            <span class="sr-only">Avatar</span>
                        </th>
                        <th class="px-3 py-2 font-semibold">Display Name</th>
                        <th class="px-3 py-2 font-semibold">Username</th>
                        <th class="px-3 py-2 font-semibold">Email</th>
                        <th class="px-3 py-2 font-semibold">Roles</th>
                        <th class="px-3 py-2 font-semibold">Joined</th>
                        <th class="px-3 py-2 font-semibold">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each filtered as user (user.id)}
                        <tr class="border-b border-line last:border-0">
                            <td class="px-3 py-2">
                                <div
                                    class="flex size-8 shrink-0 items-center justify-center
                                           rounded-full border-2 border-line
                                           bg-overlay text-[10px] font-bold
                                           text-ink"
                                    aria-hidden="true"
                                >
                                    {initials(user.displayName, user.username)}
                                </div>
                            </td>
                            <td class="px-3 py-2 font-semibold text-ink">
                                {user.displayName || user.username}
                            </td>
                            <td class="px-3 py-2 text-surface-500">{user.username}</td>
                            <td class="px-3 py-2 text-surface-500">{user.email || '—'}</td>
                            <td class="px-3 py-2">
                                {#if user.roles.length === 0}
                                    <span class="text-surface-500">—</span>
                                {:else}
                                    <div class="flex flex-wrap gap-1">
                                        {#each user.roles as role (role)}
                                            <span
                                                class="badge {globalRoleBadgePreset(role) ??
                                                    'preset-tonal-surface'} flex items-center
                                                       gap-1 rounded-none text-[0.625rem]
                                                       font-semibold uppercase"
                                            >
                                                {globalRoleLabel(role) ?? 'Unknown'}
                                                {#if !(user.id === data.currentUserId && role === 1)}
                                                    <!-- Own-Admin revoke is hidden, not just
                                                         disabled: the backend blocks it
                                                         unconditionally (self-demotion guard
                                                         in UserService.RemoveRole), so
                                                         offering it would only ever error. -->
                                                    <form
                                                        method="POST"
                                                        action="?/removeRole"
                                                        class="contents"
                                                    >
                                                        <input
                                                            type="hidden"
                                                            name="userId"
                                                            value={user.id}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="role"
                                                            value={role}
                                                        />
                                                        <button
                                                            type="submit"
                                                            class="text-surface-950-50/70
                                                                   hover:text-error-500"
                                                            title="Revoke {globalRoleLabel(
                                                                role
                                                            )}"
                                                        >
                                                            &times;
                                                        </button>
                                                    </form>
                                                {/if}
                                            </span>
                                        {/each}
                                    </div>
                                {/if}
                            </td>
                            <td class="px-3 py-2 text-surface-500">
                                {user.createdAt
                                    ? new Date(user.createdAt).toLocaleDateString()
                                    : '—'}
                            </td>
                            <td class="px-3 py-2">
                                {#if missingRoles(user.roles).length === 0}
                                    <span class="text-surface-500">—</span>
                                {:else}
                                    <form
                                        method="POST"
                                        action="?/addRole"
                                        class="flex items-center gap-1"
                                    >
                                        <input type="hidden" name="userId" value={user.id} />
                                        {#if missingRoles(user.roles).length === 1}
                                            <input
                                                type="hidden"
                                                name="role"
                                                value={missingRoles(user.roles)[0]}
                                            />
                                            <button
                                                type="submit"
                                                class="btn btn-sm preset-tonal-surface"
                                            >
                                                Grant {globalRoleLabel(
                                                    missingRoles(user.roles)[0]
                                                )}
                                            </button>
                                        {:else}
                                            <select
                                                name="role"
                                                class="h-8 rounded-none border
                                                       border-surface-200-800 bg-surface-50-950
                                                       px-2 text-xs text-surface-950-50
                                                       focus:border-primary-500
                                                       focus:outline-none"
                                            >
                                                {#each missingRoles(user.roles) as role (role)}
                                                    <!-- Hackathon Organizer (2) is the
                                                         pre-selected default, not Admin (1):
                                                         a dropdown that silently grants the
                                                         most powerful role unless someone
                                                         changes it is the wrong default. -->
                                                    <option value={role} selected={role === 2}
                                                        >{globalRoleLabel(role)}</option
                                                    >
                                                {/each}
                                            </select>
                                            <button
                                                type="submit"
                                                class="btn btn-sm preset-tonal-surface"
                                            >
                                                Grant
                                            </button>
                                        {/if}
                                    </form>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
