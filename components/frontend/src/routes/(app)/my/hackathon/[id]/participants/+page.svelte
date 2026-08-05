<script lang="ts">
    import DataToolbar from '$lib/components/data/DataToolbar.svelte';
    import DataTable from '$lib/components/data/DataTable.svelte';
    import { membershipBadgeLabel, membershipBadgePreset } from '$lib/utils/hackathonStatus';
    import { matchesQuery, type Column, type FilterDef, type ViewMode } from '$lib/utils/dataView';
    import type { PageData } from './$types';

    // Every row below is a real participant row from the backend. Affiliation,
    // skills and LinkedIn profiles are not in the schema, so the card shows
    // what exists — name, handle, role, membership state, join date — instead
    // of padding the layout with invented attributes.
    let { data }: { data: PageData } = $props();

    type Person = PageData['confirmed'][number];

    let search = $state('');
    let view = $state<ViewMode>('cards');
    let filterValues = $state<Record<string, string>>({ state: '', role: '' });

    function matches(p: Person): boolean {
        const wantState = filterValues.state;
        const wantRole = filterValues.role;

        if (wantState === 'confirmed' && p.isWaiting) return false;
        if (wantState === 'waitlisted' && !p.isWaiting) return false;
        if (wantRole !== '' && String(p.role) !== wantRole) return false;

        return matchesQuery(search, p.name, p.username);
    }

    const confirmed = $derived(data.confirmed.filter(matches));
    const waitlisted = $derived(data.waitlisted.filter(matches));
    const nothingMatches = $derived(confirmed.length === 0 && waitlisted.length === 0);

    /** One list for the table: the confirmed/waitlisted split is a column there. */
    const allShown = $derived([...confirmed, ...waitlisted]);
    const total = $derived(data.confirmed.length + data.waitlisted.length);

    // HackathonRole: UNSPECIFIED=0, OWNER=1, MEMBER=2.
    const FILTERS: FilterDef[] = [
        {
            id: 'state',
            label: 'Status',
            options: [
                { value: 'confirmed', label: 'Confirmed' },
                { value: 'waitlisted', label: 'Waitlisted' },
            ],
        },
        {
            id: 'role',
            label: 'Role',
            options: [
                { value: '1', label: 'Organizer' },
                { value: '2', label: 'Member' },
            ],
        },
    ];

    const COLUMNS: Column<Person>[] = [
        { key: 'name', label: 'Name', sort: (p) => p.name },
        { key: 'username', label: 'Handle', sort: (p) => p.username },
        { key: 'state', label: 'Status', sort: (p) => (p.isWaiting ? 1 : 0) },
        {
            key: 'joined',
            label: 'Joined',
            sort: (p) => (p.joinedAt ? new Date(p.joinedAt).getTime() : 0),
            align: 'right',
        },
    ];

    const countLabel = $derived(
        `${data.confirmed.length} confirmed · ${data.waitlisted.length} waitlisted`
    );

    function initials(name: string): string {
        return name
            .split(/\s+/)
            .filter(Boolean)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    }

    function joined(d: Date | string | null): string {
        if (!d) return '';
        return new Date(d).toLocaleDateString('en-CH', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    }
</script>

{#snippet personRow(p: Person)}
    <li
        class="flex items-center gap-3 border border-surface-200-800 bg-surface-100-900 px-4 py-3"
    >
        <div
            class="flex size-10 shrink-0 items-center justify-center rounded-full border
                   border-surface-200-800 bg-surface-200-800 text-xs font-bold text-surface-950-50"
            aria-hidden="true"
        >
            {initials(p.name)}
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="truncate text-sm font-bold text-surface-950-50">
                {p.name}{#if p.isMe}<span class="ml-1.5 text-xs font-normal text-surface-500"
                        >(you)</span
                    >{/if}
            </span>
            <span class="truncate text-xs text-surface-500">@{p.username}</span>
        </div>

        <div class="flex shrink-0 flex-col items-end gap-1">
            <span class="badge {membershipBadgePreset(p.isWaiting)} text-xs">
                {membershipBadgeLabel(p.isWaiting, p.role)}
            </span>
            {#if joined(p.joinedAt)}
                <span class="hidden text-xs text-surface-500 sm:inline">
                    Joined {joined(p.joinedAt)}
                </span>
            {/if}
        </div>
    </li>
{/snippet}

<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h2 class="m-0 text-lg font-bold text-surface-950-50">Participants</h2>
    </div>

    <DataToolbar
        bind:search
        bind:view
        bind:filterValues
        viewKey="participants"
        filters={FILTERS}
        placeholder="Search participants by name or handle…"
        summary={countLabel}
        shown={allShown.length}
        {total}
    />

    {#if data.confirmed.length === 0 && data.waitlisted.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">
            Nobody has joined this hackathon yet.
        </p>
    {:else if nothingMatches}
        <p class="m-0 py-6 text-center text-sm text-surface-500">
            No participants match your search.
        </p>
    {:else if view === 'table'}
        <!-- Confirmed and waitlisted are one list here, with the split as a
             column: sorting a table by name across two separate tables would
             not actually sort anything. -->
        <DataTable columns={COLUMNS} rows={allShown} rowKey={(p) => p.id} caption="Participants">
            {#snippet row(p)}
                <td class="px-3 py-2 font-medium">
                    {p.name}{#if p.isMe}<span class="ml-1.5 text-xs font-normal text-surface-500"
                            >(you)</span
                        >{/if}
                </td>
                <td class="px-3 py-2 text-surface-500">@{p.username}</td>
                <td class="px-3 py-2">
                    <span class="badge {membershipBadgePreset(p.isWaiting)} text-xs">
                        {membershipBadgeLabel(p.isWaiting, p.role)}
                    </span>
                </td>
                <td class="px-3 py-2 text-right whitespace-nowrap text-surface-500">
                    {joined(p.joinedAt) || '—'}
                </td>
            {/snippet}
        </DataTable>
    {:else}
        {#if confirmed.length > 0}
            <section class="flex flex-col gap-2">
                <h3 class="m-0 text-xs font-bold uppercase tracking-wide text-surface-500">
                    Confirmed ({confirmed.length})
                </h3>
                <ul class="m-0 flex list-none flex-col gap-2 p-0">
                    {#each confirmed as person (person.id)}
                        {@render personRow(person)}
                    {/each}
                </ul>
            </section>
        {/if}

        {#if waitlisted.length > 0}
            <!--
              Waitlisted people are a separate list on purpose: they have a
              participant row but no confirmed place. Approving or removing
              them belongs to the organizer cockpit (../manage), which is the
              only surface the backend lets act on them.
            -->
            <section class="flex flex-col gap-2">
                <h3 class="m-0 text-xs font-bold uppercase tracking-wide text-surface-500">
                    Waitlisted ({waitlisted.length})
                </h3>
                <ul class="m-0 flex list-none flex-col gap-2 p-0">
                    {#each waitlisted as person (person.id)}
                        {@render personRow(person)}
                    {/each}
                </ul>
            </section>
        {/if}
    {/if}
</div>
