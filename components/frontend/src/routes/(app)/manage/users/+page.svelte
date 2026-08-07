<script lang="ts">
    import { Search, X } from 'lucide-svelte';
    import { enhance } from '$app/forms';
    import { SvelteSet } from 'svelte/reactivity';
    import { ASSIGNABLE_GLOBAL_ROLES, globalRoleBadgeVariant, globalRoleLabel } from '$lib/utils/globalRole';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type UserRow = PageData['users'][number];

    let search = $state('');

    // Grant and revoke both take a row's whole control group out of service
    // while either is in flight, so one submit handler serves both.
    const pendingIds = new SvelteSet<string>();

    // The single (user, role) pair sitting one tap from revocation. One value
    // rather than a set: two half-confirmed revocations at once is not a state
    // anyone means to be in, so opening one closes any other.
    let confirming = $state<string | null>(null);
    const confirmKey = (userId: string, role: number) => `${userId}:${role}`;

    const submitting = (id: string) => () => {
        pendingIds.add(id);
        return async ({ update }: { update: () => Promise<void> }) => {
            await update();
            pendingIds.delete(id);
            confirming = null;
        };
    };

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

    function fullName(user: UserRow): string {
        return user.displayName || user.username;
    }

    function joined(createdAt: UserRow['createdAt']): string {
        return createdAt ? new Date(createdAt).toLocaleDateString() : '—';
    }

    // Every assignable role the user doesn't already hold — what the picker in
    // Actions offers, since granting a role a user already has is a no-op the
    // UI shouldn't invite.
    function missingRoles(roles: number[]): number[] {
        return ASSIGNABLE_GLOBAL_ROLES.filter((r) => !roles.includes(r));
    }
</script>

{#snippet avatar(user: UserRow, size: string)}
    <div
        class="flex shrink-0 items-center justify-center rounded-full border-2
               border-line bg-overlay font-bold text-ink {size}"
        aria-hidden="true"
    >
        {initials(user.displayName, user.username)}
    </div>
{/snippet}

<!--
  The badge list, shared by both layouts. Each badge carries its own revoke, and
  a tap swaps the badge for an inline confirm rather than firing immediately:
  the control is small enough to catch a stray thumb, and a mis-revoke silently
  changes who can administer the platform.
-->
{#snippet roleBadges(user: UserRow)}
    {#each user.roles as role (role)}
        {@const label = globalRoleLabel(role) ?? 'Unknown'}
        {@const key = confirmKey(user.id, role)}
        {#if confirming === key}
            <form
                method="POST"
                action="?/removeRole"
                use:enhance={submitting(user.id)}
                class="badge badge-danger"
            >
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="role" value={role} />
                <span>Revoke {label}?</span>
                <button
                    type="submit"
                    disabled={pendingIds.has(user.id)}
                    class="-my-1 rounded-control px-1.5 py-1 font-semibold
                           hover:bg-danger/20 disabled:opacity-50"
                    aria-label="Confirm revoking {label} from {fullName(user)}"
                >
                    Yes
                </button>
                <button
                    type="button"
                    onclick={() => (confirming = null)}
                    class="-my-1 -mr-1.5 rounded-control px-1.5 py-1 text-ink-2
                           hover:bg-raised hover:text-ink"
                    aria-label="Keep {label} on {fullName(user)}"
                >
                    No
                </button>
            </form>
        {:else}
            <span class="badge {globalRoleBadgeVariant(role) ?? 'badge-neutral'}">
                {label}
                <!-- Own-Admin revoke is hidden, not just disabled: the backend
                     blocks it unconditionally (self-demotion guard in
                     UserService.RemoveRole), so offering it would only ever
                     error. -->
                {#if !(user.id === data.currentUserId && role === 1)}
                    <button
                        type="button"
                        onclick={() => (confirming = key)}
                        disabled={pendingIds.has(user.id)}
                        class="-my-1 -mr-1.5 flex items-center rounded-control px-1.5 py-1
                               text-ink/70 hover:bg-danger/15 hover:text-danger-ink
                               disabled:opacity-50"
                        aria-label="Revoke {label} from {fullName(user)}"
                    >
                        <X class="h-3 w-3" aria-hidden="true" />
                    </button>
                {/if}
            </span>
        {/if}
    {/each}
{/snippet}

<!--
  `wide` stretches the control to fill a card on the phone layout, where it is
  the row's only action and has the width to spare; the table cell wants it
  shrink-to-fit.
-->
{#snippet grantForm(user: UserRow, options: number[], wide: boolean)}
    <!-- With one role left there is nothing to choose, so the button names it
         outright instead of pairing a single-entry picker with a Grant. -->
    {@const only = options.length === 1 ? options[0] : undefined}
    <form
        method="POST"
        action="?/addRole"
        use:enhance={submitting(user.id)}
        class="flex items-center gap-1 {wide ? 'w-full' : ''}"
    >
        <input type="hidden" name="userId" value={user.id} />
        {#if only !== undefined}
            <input type="hidden" name="role" value={only} />
            <button
                type="submit"
                disabled={pendingIds.has(user.id)}
                class="btn btn-sm btn-ghost {wide ? 'w-full' : ''}"
            >
                Grant {globalRoleLabel(only)}
            </button>
        {:else}
            <select
                name="role"
                disabled={pendingIds.has(user.id)}
                class="field h-8 px-2 {wide ? 'flex-1' : 'w-auto'}"
                aria-label="Role to grant {fullName(user)}"
            >
                {#each options as role (role)}
                    <!-- Hackathon Organizer (2) is the pre-selected default, not
                         Admin (1): a dropdown that silently grants the most
                         powerful role unless someone changes it is the wrong
                         default. -->
                    <option value={role} selected={role === 2}>{globalRoleLabel(role)}</option>
                {/each}
            </select>
            <button
                type="submit"
                disabled={pendingIds.has(user.id)}
                class="btn btn-sm btn-ghost"
            >
                Grant
            </button>
        {/if}
    </form>
{/snippet}

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
        <p
            class="m-0 text-xs {form.success ? 'text-success-ink' : 'text-danger-ink'}"
            role={form.success ? 'status' : 'alert'}
        >
            {form.message}
        </p>
    {/if}

    {#if data.users.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">No users found.</p>
    {:else if filtered.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">No users match “{search}”.</p>
    {:else}
        <!--
          Two presentations of one list. The table below buries Roles and
          Actions — the only interactive columns — behind a horizontal scroll on
          a phone, so under `md` the same rows become cards with the controls in
          reach. The markup that does the work lives in the snippets above, so
          neither layout owns a private copy of it.
        -->
        <div class="flex flex-col gap-2 md:hidden">
            {#each filtered as user (user.id)}
                {@const grantable = missingRoles(user.roles)}
                <div class="card card-raised px-4 py-3">
                    <div class="flex items-start gap-3">
                        {@render avatar(user, 'size-10 text-xs')}
                        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span class="truncate text-sm font-semibold text-ink">
                                {fullName(user)}
                            </span>
                            <span class="truncate text-xs text-ink-3">@{user.username}</span>
                            {#if user.email}
                                <span class="truncate text-xs text-ink-3">{user.email}</span>
                            {/if}
                            <span class="text-xs text-ink-3">
                                Joined <span class="tnum">{joined(user.createdAt)}</span>
                            </span>
                        </div>
                    </div>

                    <div class="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                        {#if user.roles.length === 0}
                            <span class="text-xs text-ink-3">No roles</span>
                        {:else}
                            <div class="flex flex-wrap gap-1">
                                {@render roleBadges(user)}
                            </div>
                        {/if}
                        {#if grantable.length > 0}
                            {@render grantForm(user, grantable, true)}
                        {/if}
                    </div>
                </div>
            {/each}
        </div>

        <div class="hidden w-full overflow-x-auto rounded-card border border-line md:block">
            <table class="w-full border-collapse text-left text-xs">
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
                        {@const grantable = missingRoles(user.roles)}
                        <tr class="border-b border-line last:border-0">
                            <td class="px-3 py-2">
                                {@render avatar(user, 'size-8 text-[10px]')}
                            </td>
                            <td class="px-3 py-2 font-semibold text-ink">{fullName(user)}</td>
                            <td class="px-3 py-2 text-ink-3">{user.username}</td>
                            <td class="px-3 py-2 text-ink-3">{user.email || '—'}</td>
                            <td class="px-3 py-2">
                                {#if user.roles.length === 0}
                                    <span class="text-ink-3">—</span>
                                {:else}
                                    <div class="flex flex-wrap gap-1">
                                        {@render roleBadges(user)}
                                    </div>
                                {/if}
                            </td>
                            <td class="px-3 py-2 text-ink-3 tnum">{joined(user.createdAt)}</td>
                            <td class="px-3 py-2">
                                {#if grantable.length === 0}
                                    <span class="text-ink-3">—</span>
                                {:else}
                                    {@render grantForm(user, grantable, false)}
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
