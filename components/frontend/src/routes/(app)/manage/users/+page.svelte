<script lang="ts">
    import { Search, X } from 'lucide-svelte';
    import { enhance } from '$app/forms';
    import { SvelteMap, SvelteSet } from 'svelte/reactivity';
    import { ASSIGNABLE_GLOBAL_ROLES, globalRoleBadgeVariant, globalRoleLabel } from '$lib/utils/globalRole';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type UserRow = PageData['users'][number];

    let search = $state('');

    // Grant and revoke both take a row's whole control group out of service
    // while either is in flight, so one submit handler serves both.
    const pendingIds = new SvelteSet<string>();

    // GlobalRole numbers, named so the Admin special cases below read as intent
    // rather than as bare numbers. See $lib/utils/globalRole.
    const ADMIN = 1;
    const HACKATHON_ORGANIZER = 2;

    // The one change awaiting confirmation, or null. A single slot shared by
    // both verbs: two half-confirmed changes at once is not a state anyone means
    // to be in, so arming one disarms any other.
    type Confirmable = { verb: 'grant' | 'revoke'; userId: string; role: number };
    let confirming = $state<Confirmable | null>(null);

    function isConfirming(verb: Confirmable['verb'], userId: string, role: number): boolean {
        return (
            confirming?.verb === verb && confirming.userId === userId && confirming.role === role
        );
    }

    // Which role each row's picker is pointing at; a row absent from the map has
    // not been touched and falls back to the default below.
    const picked = new SvelteMap<string, number>();

    function selectedRole(user: UserRow, options: number[]): number {
        const chosen = picked.get(user.id);
        if (chosen !== undefined && options.includes(chosen)) return chosen;
        // Organizer is the default whenever it is still on offer, so the picker
        // never sits pre-loaded with the role that can do everything. The last
        // fallback is unreachable — a picker is only rendered when at least one
        // role is grantable — and is here to keep the return type a number.
        if (options.includes(HACKATHON_ORGANIZER)) return HACKATHON_ORGANIZER;
        return options[0] ?? HACKATHON_ORGANIZER;
    }

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

    // Counts the rows on screen, not the rows loaded: a search that narrows 42
    // users to 3 while the header still reads "42 users" is simply wrong. The
    // total stays alongside it so the filter's effect is visible.
    const countLabel = $derived(
        filtered.length === data.users.length
            ? `${data.users.length} ${data.users.length === 1 ? 'user' : 'users'} registered on the platform`
            : `${filtered.length} of ${data.users.length} users match your search`
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

    // ISO-8601 rather than a locale format: fixed width, so the column lines up
    // under .tnum, and unambiguous about which number is the month. Assembled
    // from the local calendar fields because toISOString() converts to UTC
    // first, which lands on the previous day for anyone east of Greenwich.
    function joined(createdAt: UserRow['createdAt']): string {
        if (!createdAt) return '—';
        const d = new Date(createdAt);
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${month}-${day}`;
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
        {#if isConfirming('revoke', user.id, role)}
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
                {#if !(user.id === data.currentUserId && role === ADMIN)}
                    <button
                        type="button"
                        onclick={() => (confirming = { verb: 'revoke', userId: user.id, role })}
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
  Picker plus one button that spells out what pressing it will do, so the row
  never shows a bare "Grant" whose meaning lives in a neighbouring control. The
  picker keeps its caption in both layouts; `wide` is the phone card, where the
  caption is visible because there is no column header to name the control, and
  the whole thing stretches to the card's width.
-->
{#snippet grantForm(user: UserRow, options: number[], wide: boolean)}
    {@const selected = selectedRole(user, options)}
    {@const label = globalRoleLabel(selected) ?? 'Unknown'}
    {@const busy = pendingIds.has(user.id)}
    <form
        method="POST"
        action="?/addRole"
        use:enhance={submitting(user.id)}
        class="flex flex-wrap items-end gap-2 {wide ? 'w-full' : ''}"
    >
        <input type="hidden" name="userId" value={user.id} />
        <label class="field-label {wide ? 'flex-1' : ''}">
            <span class={wide ? '' : 'sr-only'}>Grant role</span>
            <select
                name="role"
                disabled={busy}
                onchange={(e) => {
                    picked.set(user.id, Number(e.currentTarget.value));
                    // Picking a different role invalidates an armed Admin
                    // confirmation, so it cannot be inherited by another role.
                    confirming = null;
                }}
                class="field h-8 px-2 {wide ? 'w-full' : 'w-auto'}"
            >
                {#each options as role (role)}
                    <!-- The selection is carried by `selected` on the options
                         rather than `value` on the select: the browser honours it
                         on first paint without depending on attribute-vs-children
                         ordering. Falling back to the first option would mean
                         Admin, which is both the wrong default and a label that
                         disagrees with what the form posts. -->
                    <option value={role} selected={role === selected}>
                        {globalRoleLabel(role)}
                    </option>
                {/each}
            </select>
        </label>

        {#if isConfirming('grant', user.id, selected)}
            <span class="badge badge-warning">
                Grant {label}?
                <button
                    type="submit"
                    disabled={busy}
                    class="-my-1 rounded-control px-1.5 py-1 font-semibold
                           hover:bg-warning/20 disabled:opacity-50"
                    aria-label="Confirm granting {label} to {fullName(user)}"
                >
                    Yes
                </button>
                <button
                    type="button"
                    onclick={() => (confirming = null)}
                    class="-my-1 -mr-1.5 rounded-control px-1.5 py-1 text-ink-2
                           hover:bg-raised hover:text-ink"
                    aria-label="Don't grant {label} to {fullName(user)}"
                >
                    No
                </button>
            </span>
        {:else}
            <!-- Admin passes every permission check in every hackathon — the
                 casbin matcher ends in `|| g2(r.sub, "admin")` — so granting it
                 gets the same second look revoking does. Organizer carries one
                 policy row and stays a single press. -->
            {@const confirmFirst = selected === ADMIN}
            <button
                type={confirmFirst ? 'button' : 'submit'}
                onclick={confirmFirst
                    ? () => (confirming = { verb: 'grant', userId: user.id, role: selected })
                    : undefined}
                disabled={busy}
                class="btn btn-sm btn-outline"
            >
                Grant {label}
            </button>
        {/if}
    </form>
{/snippet}

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h1 class="m-0 text-title text-ink">Users</h1>
            <p class="m-0 text-xs text-ink-3">{countLabel}</p>
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

    <!--
      What the two roles actually carry, read off the casbin policy rather than
      guessed from the labels: `admin` has no policy rows at all because the
      matcher ends in `|| g2(r.sub, "admin")` and short-circuits every check,
      while `hackathon_organizer` carries exactly one row, hackathon:create. See
      components/backend/internal/middleware/rbac.go. Neither name says this on
      its own, and one of them is the keys to the building.
    -->
    <p class="m-0 max-w-prose font-sans text-xs leading-relaxed text-ink-3">
        <span class="badge {globalRoleBadgeVariant(ADMIN) ?? 'badge-neutral'}">
            {globalRoleLabel(ADMIN)}
        </span>
        passes every permission check in every hackathon, and is the only role that can open
        this page. Grant it sparingly.
        <span class="badge {globalRoleBadgeVariant(HACKATHON_ORGANIZER) ?? 'badge-neutral'}">
            {globalRoleLabel(HACKATHON_ORGANIZER)}
        </span>
        may create hackathons, and nothing else.
    </p>

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
                        <!-- Names what the column does, which "Actions" did not.
                             It also labels the picker below it, whose own
                             caption is screen-reader-only here to keep rows to
                             one line. -->
                        <th class="px-3 py-2 font-semibold">Grant role</th>
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
