<script lang="ts">
    import { Search } from 'lucide-svelte';
    import { membershipBadgeLabel, membershipBadgePreset } from '$lib/utils/hackathonStatus';
    import type { PageData } from './$types';

    // Every row below is a real participant row from the backend. Affiliation,
    // skills and LinkedIn profiles are not in the schema, so the card shows
    // what exists — name, handle, role, membership state, join date — instead
    // of padding the layout with invented attributes.
    let { data }: { data: PageData } = $props();

    type Person = PageData['confirmed'][number];

    let search = $state('');

    const query = $derived(search.trim().toLowerCase());

    function matches(p: Person, q: string): boolean {
        if (q === '') return true;
        return `${p.name} ${p.username}`.toLowerCase().includes(q);
    }

    const confirmed = $derived(data.confirmed.filter((p) => matches(p, query)));
    const waitlisted = $derived(data.waitlisted.filter((p) => matches(p, query)));
    const nothingMatches = $derived(confirmed.length === 0 && waitlisted.length === 0);

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
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-lg font-bold text-surface-950-50">Participants</h2>
            <span class="text-xs text-surface-500">{countLabel}</span>
        </div>
        <div class="relative w-full sm:w-72">
            <Search
                class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2
                       text-surface-400"
                aria-hidden="true"
            />
            <input
                type="search"
                bind:value={search}
                placeholder="Search participants by name or handle…"
                class="h-9 w-full rounded-none border border-surface-200-800 bg-surface-50-950
                       pl-9 pr-3 text-xs text-surface-950-50 placeholder:text-surface-700-300
                       focus:border-primary-500 focus:outline-none"
            />
        </div>
    </div>

    {#if data.confirmed.length === 0 && data.waitlisted.length === 0}
        <p class="m-0 py-6 text-center text-sm text-surface-500">
            Nobody has joined this hackathon yet.
        </p>
    {:else if nothingMatches}
        <p class="m-0 py-6 text-center text-sm text-surface-500">
            No participants match your search.
        </p>
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
