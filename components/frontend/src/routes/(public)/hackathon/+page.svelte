<script lang="ts">
    import HackathonCard from '$lib/components/hackathon/HackathonCard.svelte';
    import Seo from '$lib/components/layout/Seo.svelte';
    import DataToolbar from '$lib/components/data/DataToolbar.svelte';
    import { statusLabel, statusBadgeVariant } from '$lib/utils/hackathonStatus';
    import { matchesQuery, type FilterDef } from '$lib/utils/dataView';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    type Listed = PageData['hackathons'][number];

    // HackathonStatus: PENDING=1, ACTIVE=2, FINISHED=3. Raw numbers on purpose
    // — the generated enum lives under $lib/server.
    const UPCOMING = 1;
    const ACTIVE = 2;
    const FINISHED = 3;

    const GRADIENTS = [
        { from: 'var(--color-primary-700)', to: 'var(--color-primary-950)' },
        { from: 'var(--color-secondary-500)', to: 'var(--color-secondary-950)' },
        { from: 'var(--color-tertiary-500)', to: 'var(--color-tertiary-950)' },
    ];

    function gradient(i: number) {
        return GRADIENTS[i % GRADIENTS.length]!;
    }

    function formatMeta(h: { startsAt?: Date; endsAt?: Date }): string {
        const fmt = (d: Date) =>
            d.toLocaleDateString('en-CH', { day: 'numeric', month: 'short', year: 'numeric' });
        if (h.startsAt && h.endsAt) return `${fmt(h.startsAt)} – ${fmt(h.endsAt)}`;
        if (h.startsAt) return `Starts ${fmt(h.startsAt)}`;
        return '';
    }

    /** Live first, then upcoming, then most recently finished. */
    const RANK: Partial<Record<number, number>> = { [ACTIVE]: 0, [UPCOMING]: 1, [FINISHED]: 2 };

    function byRelevance(a: Listed, b: Listed): number {
        const rankA = RANK[a.status] ?? 9;
        const rankB = RANK[b.status] ?? 9;
        if (rankA !== rankB) return rankA - rankB;
        const startA = a.startsAt?.getTime() ?? 0;
        const startB = b.startsAt?.getTime() ?? 0;

        return a.status === UPCOMING ? startA - startB : startB - startA;
    }

    let search = $state('');
    let filterValues = $state<Record<string, string>>({ status: '' });

    const FILTERS: FilterDef[] = [
        {
            id: 'status',
            label: 'Status',
            options: [
                { value: String(ACTIVE), label: 'Live now' },
                { value: String(UPCOMING), label: 'Upcoming' },
                { value: String(FINISHED), label: 'Past' },
            ],
        },
    ];

    const ranked = $derived([...data.hackathons].sort(byRelevance));
    const shown = $derived(
        ranked.filter(
            (h) =>
                (filterValues.status === '' || String(h.status) === filterValues.status) &&
                matchesQuery(search, h.name, h.description),
        ),
    );
</script>

<Seo
    title="Hackathons"
    description="Every hackathon hosted on the SDSC platform — live, upcoming and past."
/>

<div class="mx-auto w-full max-w-5xl px-4 py-10 sm:px-10">
    <h1 class="text-2xl font-bold sm:text-3xl">Hackathons</h1>
    <p class="mt-1 text-sm text-ink-3">
        Everything hosted here — live, upcoming and past. Private events appear only for the
        people invited to them.
    </p>

    {#if data.hackathons.length === 0}
        <p class="mt-8 text-ink-3">No hackathons have been published yet.</p>
    {:else}
        <div class="mt-6">
            <!-- The same toolbar the management lists use. No view toggle:
                 panels ARE the view this page is for. -->
            <DataToolbar
                bind:search
                bind:filterValues
                filters={FILTERS}
                placeholder="Search hackathons…"
                summary="{data.hackathons.length} hackathon{data.hackathons.length === 1
                    ? ''
                    : 's'}"
                shown={shown.length}
                total={data.hackathons.length}
            />
        </div>

        {#if shown.length === 0}
            <p class="py-10 text-center text-sm text-ink-3">
                No hackathons match your search.
            </p>
        {:else}
            <!-- Panels, not rows: this is the page you browse, so each event
                 gets its artwork, its dates and enough of its description to
                 decide from. -->
            <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {#each shown as h, i (h.id)}
                    <HackathonCard
                        href="/hackathon/{h.id}"
                        name={h.name}
                        meta={formatMeta(h)}
                        description={h.description}
                        logo={h.logo}
                        badge={statusLabel(h.status)}
                        badgeVariant={statusBadgeVariant(h.status)}
                        gradFrom={gradient(i).from}
                        gradTo={gradient(i).to}
                    />
                {/each}
            </div>
        {/if}
    {/if}
</div>
