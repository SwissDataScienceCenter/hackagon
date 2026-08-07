<script lang="ts">
    import { Search, X } from 'lucide-svelte';
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import { SvelteSet } from 'svelte/reactivity';
    import {
        ASSIGNABLE_GLOBAL_ROLES,
        globalRoleBadgeVariant,
        globalRoleDescription,
        globalRoleLabel,
    } from '$lib/utils/globalRole';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    type UserRow = PageData['users'][number];

    let search = $state('');

    // Grant and revoke both take a row's whole control group out of service
    // while either is in flight, so one submit handler serves both.
    const pendingIds = new SvelteSet<string>();

    // Named so the own-Admin guard below reads as intent rather than as a bare
    // number. See $lib/utils/globalRole.
    const ADMIN = 1;

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

    // The role this row's picker is currently pointing at, or undefined when the
    // picker sits on its placeholder. Doubles as "is a grant armed here", which
    // is why the picker needs no selection state of its own.
    function armedGrant(userId: string): number | undefined {
        return confirming?.verb === 'grant' && confirming.userId === userId
            ? confirming.role
            : undefined;
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

    // The global roles are mutually exclusive: a user is an Admin or a Hackathon
    // Organizer, never both. So a user holding either has nothing to be granted —
    // changing their role means revoking the one they have first, which is why
    // the picker disappears instead of offering the other one.
    //
    // Nothing below the UI enforces this. UserService.AddRole appends a casbin
    // grouping row without consulting the roles already there, and the proto
    // carries `repeated GlobalRole`, so the pair is representable and the API will
    // accept it. Withholding the option is the only thing preventing it, and a
    // user who already holds both (granted out of band) still renders both badges
    // rather than having one quietly hidden.
    function grantableRoles(roles: number[]): number[] {
        if (ASSIGNABLE_GLOBAL_ROLES.some((r) => roles.includes(r))) return [];
        return [...ASSIGNABLE_GLOBAL_ROLES];
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
  One control at rest: a picker that names each role and what it carries, so the
  choice is made with the consequence in view rather than after it. There is no
  standing Grant button — picking arms the confirmation below, and only that
  commits.

  The picker deliberately does not carry `name`, so it posts nothing; the armed
  role travels in a hidden input instead. That also means a picker left mid-
  traversal cannot contribute a role to a submission it was never pointed at.

  Arming rather than submitting on change is what makes this safe for the
  keyboard: on Windows, arrow keys on a closed select move the selection and fire
  `change` on every press, so a select that granted on change would hand out
  every role it was arrowed past.

  The confirmation replaces the picker instead of appearing beneath it, so the
  control occupies one line in either state and arming a role cannot grow the row
  it sits in.
-->
{#snippet grantForm(user: UserRow, options: number[])}
    {@const armed = armedGrant(user.id)}
    {@const busy = pendingIds.has(user.id)}
    <form method="POST" action="?/addRole" use:enhance={submitting(user.id)} class="w-full">
        <input type="hidden" name="userId" value={user.id} />
        {#if armed === undefined}
            <!-- w-full, never `w-auto`: a select sized automatically takes the
                 width of its widest option, and every option here carries a
                 sentence. Closed it only has to show the placeholder. -->
            <select
                disabled={busy}
                aria-label="Grant a role to {fullName(user)}"
                onchange={(e) => {
                    const role = Number(e.currentTarget.value);
                    if (Number.isNaN(role) || role === 0) return;
                    confirming = { verb: 'grant', userId: user.id, role };
                }}
                class="field h-8 w-full px-2"
            >
                <option value="" disabled selected>Grant a role…</option>
                {#each options as role (role)}
                    <option value={role}>
                        {globalRoleLabel(role)} — {globalRoleDescription(role) ?? 'no description'}
                    </option>
                {/each}
            </select>
        {:else}
            {@const label = globalRoleLabel(armed) ?? 'Unknown'}
            <input type="hidden" name="role" value={armed} />
            <div class="flex items-center gap-1.5">
                <!-- truncate is the safety valve for a narrow column, and the title
                     keeps the role recoverable when it fires. -->
                <span class="min-w-0 truncate text-ink-2" title="{label}?">{label}?</span>
                <button type="submit" disabled={busy} class="btn btn-sm btn-warning">Grant</button>
                <button
                    type="button"
                    onclick={() => (confirming = null)}
                    class="btn btn-sm btn-quiet"
                >
                    Cancel
                </button>
            </div>
        {/if}
    </form>
{/snippet}

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <a
                href={resolve('/(app)/dashboard')}
                class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
            >
                &larr; Back to dashboard
            </a>
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
      Neither role name says what it carries, and one of them is the keys to the
      building. Built from the same descriptions the picker shows, so the page
      cannot end up explaining a role one way here and another way there.
    -->
    <ul class="m-0 flex list-none flex-col gap-1 p-0">
        {#each ASSIGNABLE_GLOBAL_ROLES as role (role)}
            <li class="flex flex-wrap items-center gap-2">
                <span class="badge {globalRoleBadgeVariant(role) ?? 'badge-neutral'}">
                    {globalRoleLabel(role)}
                </span>
                <span class="font-sans text-xs text-ink-3">
                    {globalRoleDescription(role) ?? 'no description'}
                </span>
            </li>
        {/each}
    </ul>
    <!-- Says why the picker is missing from most rows; without it the absence
         reads as a bug or as a permission the viewer lacks. -->
    <p class="m-0 text-xs text-ink-3">
        A user holds one of these at a time. To change someone's role, revoke the one
        they have and then grant the other.
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
          Two presentations of one list. The table below buries Roles and Grant
          role — the only interactive columns — behind a horizontal scroll on a
          phone, so under `md` the same rows become cards with the controls in
          reach. The markup that does the work lives in the snippets above, so
          neither layout owns a private copy of it.
        -->
        <div class="flex flex-col gap-2 md:hidden">
            {#each filtered as user (user.id)}
                {@const grantable = grantableRoles(user.roles)}
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

                    <!-- Held role or picker, never both — see the Role column. -->
                    <div class="mt-3 flex border-t border-line pt-3">
                        {#if user.roles.length > 0}
                            <div class="flex flex-wrap gap-1">
                                {@render roleBadges(user)}
                            </div>
                        {:else}
                            {@render grantForm(user, grantable)}
                        {/if}
                    </div>
                </div>
            {/each}
        </div>

        <div class="hidden w-full overflow-x-auto rounded-card border border-line md:block">
            <!--
              `table-fixed` is what keeps the table still. Under auto layout every
              column is measured from its content, so one ADMIN badge appearing
              widened Roles, stole the width back off Email and Display Name, and
              reflowed every row on the page. Fixed layout takes the widths from
              the colgroup below and ignores content entirely.

              The widths are percentages so the table always fits its container,
              with a min-width underneath them. Role sets that floor, and its armed
              confirmation — the role named, plus Grant and Cancel, none of which
              wrap — is the widest thing on the page at ~300px. Narrow desktop
              windows scroll horizontally instead, which is what the wrapper's
              overflow-x-auto is for. The other columns are free to truncate, so
              they only need a share, not a floor.
            -->
            <table class="w-full min-w-[900px] table-fixed border-collapse text-left text-xs">
                <colgroup>
                    <col class="w-[5%]" />
                    <col class="w-[17%]" />
                    <col class="w-[13%]" />
                    <col class="w-[17%]" />
                    <col class="w-[10%]" />
                    <col class="w-[38%]" />
                </colgroup>
                <thead>
                    <tr class="border-b border-line bg-raised text-ink-3">
                        <th class="px-3 py-2 font-semibold">
                            <span class="sr-only">Avatar</span>
                        </th>
                        <th class="px-3 py-2 font-semibold">Display Name</th>
                        <th class="px-3 py-2 font-semibold">Username</th>
                        <th class="px-3 py-2 font-semibold">Email</th>
                        <th class="px-3 py-2 font-semibold">Joined</th>
                        <!--
                          Held role and the picker share one column because the
                          roles are exclusive: a user with a role has nothing to be
                          granted, and a user with none has no badge, so the two
                          never occupy a row at the same time. Split across two
                          columns every row showed one dash.
                        -->
                        <th class="px-3 py-2 font-semibold">Role</th>
                    </tr>
                </thead>
                <tbody>
                    {#each filtered as user (user.id)}
                        {@const grantable = grantableRoles(user.roles)}
                        <tr class="border-b border-line last:border-0">
                            <td class="px-3 py-2">
                                {@render avatar(user, 'size-8 text-[10px]')}
                            </td>
                            <!-- Fixed layout clips rather than wraps, so the long
                                 values keep their full text in a tooltip. -->
                            <td
                                class="truncate px-3 py-2 font-semibold text-ink"
                                title={fullName(user)}
                            >
                                {fullName(user)}
                            </td>
                            <td class="truncate px-3 py-2 text-ink-3" title={user.username}>
                                {user.username}
                            </td>
                            <td class="truncate px-3 py-2 text-ink-3" title={user.email || ''}>
                                {user.email || '—'}
                            </td>
                            <td class="px-3 py-2 text-ink-3 tnum">{joined(user.createdAt)}</td>
                            <!-- min-h-8 is the height of the picker, so a row is the
                                 same height whether it holds a badge, a picker or a
                                 confirmation, and committing either action doesn't
                                 shift the rows below. -->
                            <td class="px-3 py-2">
                                <div class="flex min-h-8 items-center">
                                    {#if user.roles.length > 0}
                                        <div class="flex flex-wrap gap-1">
                                            {@render roleBadges(user)}
                                        </div>
                                    {:else}
                                        {@render grantForm(user, grantable)}
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
