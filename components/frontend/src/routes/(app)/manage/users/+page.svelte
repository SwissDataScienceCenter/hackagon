<script lang="ts">
    import DataToolbar from '$lib/components/data/DataToolbar.svelte';
    import { ASSIGNABLE_GLOBAL_ROLES, globalRoleBadgeVariant, globalRoleLabel } from '$lib/utils/globalRole';
    import type { FilterDef, ViewMode } from '$lib/utils/dataView';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let search = $state('');
    // Table by default here, unlike the other lists: this one is read as a
    // register — who exists, which roles they hold — and a register is a table.
    let view = $state<ViewMode>('table');
    let filterValues = $state<Record<string, string>>({});

    // Values are the numeric GlobalRole, as strings: the filter is compared
    // against `roles`, which is what the backend sends.
    const FILTERS: FilterDef[] = [
        {
            id: 'role',
            label: 'Role',
            options: ASSIGNABLE_GLOBAL_ROLES.map((r) => ({
                value: String(r),
                label: globalRoleLabel(r) ?? String(r),
            })),
        },
    ];

    // Matches every column the table actually shows, so a row the user can read
    // on screen is never filtered out by a term visible in it.
    const filtered = $derived(
        data.users.filter((u) => {
            const role = filterValues.role;
            if (role && !u.roles.includes(Number(role))) return false;

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
    </div>

    <!-- The shared toolbar, as on /manage/pages and the browse page: one search
         box, dropdown filters, and a cards/table toggle remembered per list. The
         page shipped with a bare search input and no way to narrow by role or
         to read the register as anything but a table. -->
    <DataToolbar
        bind:search
        bind:view
        bind:filterValues
        viewKey="manage-users"
        filters={FILTERS}
        placeholder="Name, username or email…"
        summary={countLabel}
        shown={filtered.length}
        total={data.users.length}
    />

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    {#if data.users.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">No users found.</p>
    {:else if filtered.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">No users match “{search}”.</p>
    {:else if view === 'table'}
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
                        {@const missing = missingRoles(user.roles)}
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
                            <td class="px-3 py-2 text-ink-3">{user.username}</td>
                            <td class="px-3 py-2 text-ink-3">{user.email || '—'}</td>
                            <td class="px-3 py-2">
                                {#if user.roles.length === 0}
                                    <span class="text-ink-3">—</span>
                                {:else}
                                    <div class="flex flex-wrap gap-1">
                                        {#each user.roles as role (role)}
                                            <span
                                                class="badge {globalRoleBadgeVariant(role) ??
                                                    'badge-neutral'}"
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
                                                            class="text-ink/70
                                                                   hover:text-danger-ink"
                                                            title="Revoke {globalRoleLabel(
                                                                role
                                                            )}"
                                                            aria-label="Revoke {globalRoleLabel(
                                                                role
                                                            )}"
                                                        >
                                                            <!-- The glyph is the
                                                                 whole button, so
                                                                 without an
                                                                 aria-label its
                                                                 accessible name is
                                                                 "×" — a screen
                                                                 reader announces
                                                                 "multiplication
                                                                 sign". `title` is a
                                                                 tooltip, not a name.
                                                                 -->
                                                            <span aria-hidden="true">&times;</span>
                                                        </button>
                                                    </form>
                                                {/if}
                                            </span>
                                        {/each}
                                    </div>
                                {/if}
                            </td>
                            <td class="px-3 py-2 text-ink-3">
                                {user.createdAt
                                    ? new Date(user.createdAt).toLocaleDateString()
                                    : '—'}
                            </td>
                            <td class="px-3 py-2">
                                {#if missing.length === 0}
                                    <span class="text-ink-3">—</span>
                                {:else}
                                    <form
                                        method="POST"
                                        action="?/addRole"
                                        class="flex items-center gap-1"
                                    >
                                        <input type="hidden" name="userId" value={user.id} />
                                        {#if missing.length === 1 && missing[0] !== undefined}
                                            {@const only = missing[0]}
                                            <input type="hidden" name="role" value={only} />
                                            <button
                                                type="submit"
                                                class="btn btn-sm btn-ghost"
                                            >
                                                Grant {globalRoleLabel(only)}
                                            </button>
                                        {:else}
                                            <select
                                                name="role"
                                                class="field h-8 w-auto px-2"
                                            >
                                                {#each missing as role (role)}
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
                                                class="btn btn-sm btn-ghost"
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
    {:else}
        <!-- Cards: the same register at 320px, where a seven-column table is a
             horizontal scroll. Role granting stays in the table view — it is a
             row action, and a card is for reading. -->
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each filtered as user (user.id)}
                <div class="card flex items-start gap-3 p-4">
                    <div
                        class="flex size-9 shrink-0 items-center justify-center rounded-full
                               border border-line bg-raised text-xs font-bold text-ink"
                        aria-hidden="true"
                    >
                        {initials(user.displayName, user.username)}
                    </div>
                    <div class="flex min-w-0 flex-col gap-1">
                        <span class="truncate text-sm font-semibold text-ink">
                            {user.displayName || user.username}
                        </span>
                        <span class="truncate text-xs text-ink-3">{user.email}</span>
                        <div class="flex flex-wrap gap-1">
                            {#each user.roles as role (role)}
                                <span class="badge {globalRoleBadgeVariant(role) ?? 'badge-neutral'}">
                                    {globalRoleLabel(role)}
                                </span>
                            {/each}
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>
