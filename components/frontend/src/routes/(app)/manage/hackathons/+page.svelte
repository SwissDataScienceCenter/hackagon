<script lang="ts">
    import { onMount } from 'svelte';
    import { resolve } from '$app/paths';
    import HackathonRow from '$lib/components/hackathon/HackathonRow.svelte';
    import { formatDateRange } from '$lib/utils/hackathonDates';
    import { relativeWhen, whenGroup, type WhenGroup } from '$lib/utils/hackathonWhen';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    type Row = PageData['hackathons'][number];

    // Filled in on mount, never during SSR: the relative phrases count local
    // calendar days, and the server's are not the reader's. Undefined until the
    // browser answers, which `relativeWhen` reads as "say nothing yet".
    let now = $state<Date | undefined>(undefined);
    onMount(() => {
        now = new Date();
    });

    // The same three groups, in the same order, as the dashboard's lists: an
    // administrator looking for a hackathon is asking the same question about it
    // as anybody else, so it should not be a differently shaped answer.
    const GROUPS: { key: WhenGroup; label: string }[] = [
        { key: 'now', label: 'Happening now' },
        { key: 'upcoming', label: 'Coming up' },
        { key: 'finished', label: 'Finished' },
    ];
    const grouped = $derived(
        GROUPS.map((g) => ({
            ...g,
            items: data.hackathons.filter((h) => whenGroup(h.status) === g.key),
        })).filter((g) => g.items.length > 0),
    );

    function meta(h: Row): string {
        const rel = relativeWhen(h, now);
        const abs = formatDateRange(h);
        if (!rel) return abs;

        return abs ? `${rel} · ${abs}` : rel;
    }
</script>

<div class="px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-1">
            <h1 class="text-display">Hackathons</h1>
            <p class="m-0 text-sm text-ink-3">
                Every hackathon on the platform, including the private ones. Your
                Admin role opens any of them.
            </p>
        </div>

        {#if data.hackathons.length === 0}
            <p class="text-sm text-ink-3">There are no hackathons yet.</p>
        {:else}
            {#each grouped as group (group.key)}
                <div class="flex flex-col gap-2">
                    <h2 class="meta">{group.label}</h2>
                    <div
                        class="card overflow-hidden {group.key === 'now'
                            ? 'border-l-2 border-l-accent'
                            : ''}"
                    >
                        {#each group.items as h (h.id)}
                            <!-- Straight to Overview rather than to Settings. An
                                 admin opening a hackathon they have no part in is
                                 looking at it, not running it, and Settings is one
                                 click away once inside. -->
                            <HackathonRow
                                href={resolve(`/my/hackathon/${h.id}/overview`)}
                                name={h.name}
                                imageUrl={h.logo}
                                meta={meta(h)}
                                visibility={h.visibility}
                            />
                        {/each}
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>
