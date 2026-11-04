<script lang="ts">
    import { Search } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import InfoToggle from '$lib/components/layout/InfoToggle.svelte';
    import UserAvatar from '$lib/components/user/UserAvatar.svelte';
    import {
        ASSIGNABLE_GLOBAL_ROLES,
        GLOBAL_ROLE_FILTERS,
        globalRoleBadgeVariant,
        globalRoleDescription,
        globalRoleFilterLabel,
        globalRoleLabel,
        matchesGlobalRoleFilter,
        type GlobalRoleFilter,
    } from '$lib/utils/globalRole';
    import { localIsoDate } from '$lib/utils/localDate';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    type UserRow = PageData['users'][number];

    let search = $state('');

    // One filter at a time: a platform-role slice, or the hackathon owners. Owning
    // is independent of the platform role, but the chips stay a single choice so
    // the list always answers one question. The search still applies on top.
    type UserFilter = GlobalRoleFilter | 'owners';
    const USER_FILTERS: UserFilter[] = [...GLOBAL_ROLE_FILTERS, 'owners'];

    // Page state rather than a query parameter, like the search beside it, so
    // both are kept while the page stays open and both reset on a reload.
    let filter = $state<UserFilter>('all');

    function matchesFilter(u: UserRow, f: UserFilter): boolean {
        return f === 'owners' ? u.ownedCount > 0 : matchesGlobalRoleFilter(u.roles, f);
    }

    function filterLabel(f: UserFilter): string {
        return f === 'owners' ? 'Owns a hackathon' : globalRoleFilterLabel(f);
    }

    // Matches every column the table actually shows, so a row the user can read
    // on screen is never filtered out by a term visible in it.
    const searched = $derived(
        data.users.filter((u) => {
            const q = search.trim().toLowerCase();
            if (q === '') return true;
            const roleNames = u.roles.map((r) => globalRoleLabel(r) ?? '').join(' ');
            return `${u.displayName} ${u.username} ${u.email} ${roleNames}`
                .toLowerCase()
                .includes(q);
        })
    );

    const filtered = $derived(searched.filter((u) => matchesFilter(u, filter)));

    // Counted within the search, so each chip says how many rows picking it
    // would show — a count over all users would promise rows the search then
    // hides.
    const filterCounts = $derived(
        new Map(USER_FILTERS.map((f) => [f, searched.filter((u) => matchesFilter(u, f)).length]))
    );

    const searching = $derived(search.trim() !== '');
    const narrowedBy = $derived(
        searching && filter !== 'all' ? 'filters' : searching ? 'search' : 'filter'
    );

    // Counts the rows on screen, not the rows loaded: a search that narrows 42
    // users to 3 while the header still reads "42 users" is simply wrong. The
    // total stays alongside it so the filter's effect is visible.
    const countLabel = $derived(
        filtered.length === data.users.length
            ? `${data.users.length} ${data.users.length === 1 ? 'user' : 'users'} registered on the platform`
            : `${filtered.length} of ${data.users.length} users match your ${narrowedBy}`
    );

    // Names whatever is narrowing the list, so an empty table with only a role
    // picked doesn't claim to have searched for “”.
    const emptyLabel = $derived.by(() => {
        const who =
            filter === 'all'
                ? 'users'
                : filter === 'none'
                  ? 'users without a platform role'
                  : filter === 'owners'
                    ? 'users who own a hackathon'
                    : `${globalRoleFilterLabel(filter)} users`;
        return searching ? `No ${who} match “${search.trim()}”.` : `No ${who}.`;
    });

    function fullName(user: UserRow): string {
        return user.displayName || user.username;
    }

    function ownsLabel(n: number): string {
        return `${n} ${n === 1 ? 'hackathon' : 'hackathons'}`;
    }
</script>

<!--
  Read-only badges, shared by both layouts. An unrecognized role still shows, as
  "Unknown": the point of this list is auditing who holds what.
-->
{#snippet roleBadges(user: UserRow)}
    {#if user.roles.length === 0}
        <span class="text-ink-3">—</span>
    {:else}
        <div class="flex flex-wrap gap-1">
            {#each user.roles as role (role)}
                <span class="badge {globalRoleBadgeVariant(role) ?? 'badge-neutral'}">
                    {globalRoleLabel(role) ?? 'Unknown'}
                </span>
            {/each}
        </div>
    {/if}
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

    <!-- Chips, not buttons: this picks which rows are showing, and a solid
         accent would read as an action. Rendered even when the slice is
         empty, so the way back out stays in view. What the roles mean is one
         click away rather than always on screen; it comes from the same
         descriptions the user page uses, so the two cannot disagree. -->
    {#if data.users.length > 0}
        <InfoToggle label="About platform roles">
            {#snippet heading()}
                <div class="flex flex-wrap gap-1" role="group" aria-label="Filter users">
                    {#each USER_FILTERS as f (f)}
                        <button
                            type="button"
                            onclick={() => (filter = f)}
                            aria-pressed={filter === f}
                            class="chip {filter === f ? 'chip-active' : ''}"
                        >
                            {filterLabel(f)}
                            <span class="tnum">{filterCounts.get(f) ?? 0}</span>
                        </button>
                    {/each}
                </div>
            {/snippet}
            <dl class="m-0 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5">
                {#each ASSIGNABLE_GLOBAL_ROLES as role (role)}
                    <dt class="font-mono font-semibold text-ink">{globalRoleLabel(role)}</dt>
                    <dd class="m-0">{globalRoleDescription(role) ?? 'no description'}</dd>
                {/each}
            </dl>
            <p class="m-0 mt-2">
                Open a user to change their platform role or see their hackathons. Roles
                inside a hackathon — owner or member — are separate. “Owns” counts the
                hackathons a user owns; taking part is not counted here yet, only on their
                page.
            </p>
        </InfoToggle>
    {/if}

    {#if data.users.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">No users found.</p>
    {:else if filtered.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">{emptyLabel}</p>
    {:else}
        <!--
          Two presentations of one list: cards under `md`, where a seven-column
          table would scroll sideways, and a table above it. Each card and each
          name is a link to the user's own page.
        -->
        <div class="flex flex-col gap-2 md:hidden">
            {#each filtered as user (user.id)}
                <a
                    href={resolve(`/manage/users/${user.id}`)}
                    class="card card-raised px-4 py-3 text-ink no-underline transition-colors
                           hover:bg-overlay"
                >
                    <div class="flex items-start gap-3">
                        <UserAvatar
                            displayName={user.displayName}
                            username={user.username}
                            size="size-10 text-xs"
                        />
                        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span class="truncate text-sm font-semibold text-ink">
                                {fullName(user)}
                            </span>
                            <span class="truncate text-xs text-ink-3">@{user.username}</span>
                            {#if user.email}
                                <span class="truncate text-xs text-ink-3">{user.email}</span>
                            {/if}
                            <span class="text-xs text-ink-3">
                                Joined <span class="tnum">{localIsoDate(user.createdAt)}</span>
                            </span>
                        </div>
                    </div>
                    <div class="mt-3 flex items-center gap-3 border-t border-line pt-3 text-xs">
                        {@render roleBadges(user)}
                        {#if user.ownedCount > 0}
                            <span class="ml-auto text-ink-3">
                                Owns <span class="tnum">{ownsLabel(user.ownedCount)}</span>
                            </span>
                        {/if}
                    </div>
                </a>
            {/each}
        </div>

        <div class="hidden w-full overflow-x-auto rounded-card border border-line md:block">
            <!--
              `table-fixed` takes the column widths from the colgroup instead of
              measuring content, so a badge appearing in one row cannot reflow
              every other row. The text columns truncate, with the full value in
              a tooltip, so they only need a share of the width, not a floor.
            -->
            <table class="w-full min-w-[720px] table-fixed border-collapse text-left text-xs">
                <colgroup>
                    <col class="w-[6%]" />
                    <col class="w-[20%]" />
                    <col class="w-[14%]" />
                    <col class="w-[20%]" />
                    <col class="w-[10%]" />
                    <col class="w-[11%]" />
                    <col class="w-[19%]" />
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
                        <!-- "Owns", not "Hackathons": only ownership is counted, and
                             a blank under a broader heading would read as
                             "takes part in nothing". -->
                        <th class="px-3 py-2 font-semibold">Owns</th>
                        <th class="px-3 py-2 font-semibold">Platform role</th>
                    </tr>
                </thead>
                <tbody>
                    {#each filtered as user (user.id)}
                        <tr class="border-b border-line transition-colors last:border-0 hover:bg-raised">
                            <td class="px-3 py-2">
                                <UserAvatar displayName={user.displayName} username={user.username} />
                            </td>
                            <td class="truncate px-3 py-2" title={fullName(user)}>
                                <a
                                    href={resolve(`/manage/users/${user.id}`)}
                                    class="font-semibold text-ink no-underline hover:underline"
                                >
                                    {fullName(user)}
                                </a>
                            </td>
                            <td class="truncate px-3 py-2 text-ink-3" title={user.username}>
                                {user.username}
                            </td>
                            <td class="truncate px-3 py-2 text-ink-3" title={user.email || ''}>
                                {user.email || '—'}
                            </td>
                            <td class="px-3 py-2 text-ink-3 tnum">{localIsoDate(user.createdAt)}</td>
                            <td class="px-3 py-2 tnum {user.ownedCount > 0 ? 'text-ink-2' : 'text-ink-3'}">
                                {user.ownedCount > 0 ? ownsLabel(user.ownedCount) : '—'}
                            </td>
                            <td class="px-3 py-2">
                                {@render roleBadges(user)}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
