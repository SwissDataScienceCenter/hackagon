<script lang="ts">
    import { onMount } from 'svelte';
    import { Search } from 'lucide-svelte';
    import Lock from 'lucide-svelte/icons/lock';
    import { resolve } from '$app/paths';
    import { SvelteSet } from 'svelte/reactivity';
    import { formatDateRange } from '$lib/utils/hackathonDates';
    import { isPrivate, visibilityLabel } from '$lib/utils/hackathonStatus';
    import { relativeWhen, whenGroup, type WhenGroup } from '$lib/utils/hackathonWhen';
    import { usableImage } from '$lib/utils/imageUrl';
    import { matchesAny } from '$lib/utils/personSearch';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    type Row = PageData['hackathons'][number];
    type Owner = NonNullable<Row['owners']>[number];

    let search = $state('');

    // Filled in on mount, never during SSR: the relative phrases count local
    // calendar days, and the server's are not the reader's. Undefined until the
    // browser answers, which `relativeWhen` reads as "say nothing yet".
    let now = $state<Date | undefined>(undefined);
    onMount(() => {
        now = new Date();
    });

    // The same three groups, in the same order, as the dashboard's lists: an
    // administrator looking for a hackathon is asking the same question about it
    // as anybody else, so it should not be a differently shaped answer. Here they
    // are a column and a sort order rather than three lists, so one search
    // filters one table.
    const GROUP_LABEL: Record<WhenGroup, string> = {
        now: 'Happening now',
        upcoming: 'Coming up',
        finished: 'Finished',
    };
    const GROUP_ORDER: WhenGroup[] = ['now', 'upcoming', 'finished'];

    // A status this build has no group for sorts last rather than vanishing —
    // the three lists this replaced dropped such a row entirely. Within a
    // group the backend's order (oldest created first) stands.
    function rank(h: Row): number {
        const g = whenGroup(h.status);
        return g ? GROUP_ORDER.indexOf(g) : GROUP_ORDER.length;
    }
    const sorted = $derived([...data.hackathons].sort((a, b) => rank(a) - rank(b)));

    function ownerName(o: Owner): string {
        return o.displayName || o.username;
    }

    // Matches what a row shows, so nothing visible on screen is a term that
    // filters it out — the owner names included, which is what makes "what
    // does Alice run?" one search.
    const filtered = $derived(
        sorted.filter((h) => {
            const group = whenGroup(h.status);
            const owners = (h.owners ?? []).flatMap((o) => [o.displayName, o.username]);
            return matchesAny(
                [
                    h.name,
                    group ? GROUP_LABEL[group] : '',
                    visibilityLabel(h.visibility) ?? '',
                    ...owners,
                ],
                search,
            );
        }),
    );

    // Counts the rows on screen, with the total beside it while a search is
    // narrowing them — the same wording rule as the Users page.
    const countLabel = $derived(
        filtered.length === data.hackathons.length
            ? `${data.hackathons.length} ${data.hackathons.length === 1 ? 'hackathon' : 'hackathons'} on the platform`
            : `${filtered.length} of ${data.hackathons.length} hackathons match your search`,
    );

    function meta(h: Row): string {
        const rel = relativeWhen(h, now);
        const abs = formatDateRange(h);
        if (!rel) return abs;

        return abs ? `${rel} · ${abs}` : rel;
    }

    function groupLabel(h: Row): string {
        const g = whenGroup(h.status);
        return g ? GROUP_LABEL[g] : 'Unknown';
    }

    // Each logo that failed to load, by hackathon. A logo is typed in, never
    // uploaded, so a link to a web page instead of an image is the ordinary
    // mistake; the empty ground absorbs it, as on the dashboard rows.
    const failedLogos = new SvelteSet<string>();
</script>

{#snippet logo(h: Row, size: string)}
    {#if usableImage(h.logo, failedLogos.has(h.id) ? h.logo : undefined)}
        <div class="{size} shrink-0 overflow-hidden rounded-field border border-line bg-raised">
            <img
                src={h.logo}
                alt=""
                onerror={() => failedLogos.add(h.id)}
                class="h-full w-full object-contain"
            />
        </div>
    {:else}
        <div class="{size} shrink-0 rounded-field border border-line bg-overlay"></div>
    {/if}
{/snippet}

<!-- Straight to Overview rather than to Settings. An admin opening a hackathon
     they have no part in is looking at it, not running it, and Settings is one
     click away once inside. -->
{#snippet nameLink(h: Row)}
    <span class="flex min-w-0 items-center gap-1.5">
        <a
            href={resolve(`/my/hackathon/${h.id}/overview`)}
            class="truncate font-semibold text-ink hover:underline"
            title={h.name}
        >
            {h.name}
        </a>
        {#if isPrivate(h.visibility)}
            <Lock class="h-3.5 w-3.5 shrink-0 text-ink-3" aria-label={visibilityLabel(h.visibility)} />
        {/if}
    </span>
{/snippet}

{#snippet owners(h: Row)}
    {#if h.owners === null}
        <!-- Not an empty list: that would read as a hackathon nobody runs. -->
        <span class="text-ink-3" title="The owners of this hackathon could not be read">
            Couldn't load owners
        </span>
    {:else}
        <div class="flex flex-wrap gap-1">
            {#each h.owners as o (o.id)}
                <span class="badge badge-neutral" title="@{o.username}">{ownerName(o)}</span>
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
            <h1 class="m-0 text-title text-ink">Hackathons</h1>
            <p class="m-0 text-xs text-ink-3">{countLabel}</p>
        </div>
        <div class="relative w-full sm:w-72">
            <Search
                class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2
                       text-ink-3"
                aria-hidden="true"
            />
            <label class="sr-only" for="hackathon-search">Search hackathons</label>
            <input
                id="hackathon-search"
                type="search"
                bind:value={search}
                placeholder="Name or owner…"
                class="field pl-9 pr-3"
            />
        </div>
    </div>

    <p class="m-0 font-sans text-xs text-ink-3">
        Every hackathon on the platform, including the private ones. Your Admin role
        opens any of them. Its owners are the people who run it: its settings,
        participants, projects and results.
    </p>

    {#if data.hackathons.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">There are no hackathons yet.</p>
    {:else if filtered.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">No hackathons match “{search}”.</p>
    {:else}
        <!-- Two presentations of one list, as on the Users page: cards under
             `md`, where a table would bury Owners behind a horizontal scroll,
             and the table above it. -->
        <div class="flex flex-col gap-2 md:hidden">
            {#each filtered as h (h.id)}
                <div class="card card-raised px-4 py-3">
                    <div class="flex items-start gap-3">
                        {@render logo(h, 'h-10 w-10')}
                        <div class="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                            {@render nameLink(h)}
                            <span class="text-xs text-ink-2">{groupLabel(h)}</span>
                            <span class="tnum text-xs text-ink-3">{meta(h)}</span>
                            {#if h.participantCount !== undefined}
                                <span class="text-xs text-ink-3">
                                    <span class="tnum">{h.participantCount}</span>
                                    {h.participantCount === 1 ? 'participant' : 'participants'}
                                </span>
                            {/if}
                        </div>
                    </div>
                    <div class="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-xs">
                        <span class="meta">Owners</span>
                        {@render owners(h)}
                    </div>
                </div>
            {/each}
        </div>

        <div class="hidden w-full overflow-x-auto rounded-card border border-line md:block">
            <!-- `table-fixed` for the same reason as on the Users page: widths
                 come from the colgroup, so a long name or a second owner badge
                 cannot reflow every other row. -->
            <table class="w-full min-w-[900px] table-fixed border-collapse text-left text-xs">
                <colgroup>
                    <col class="w-[6%]" />
                    <col class="w-[26%]" />
                    <col class="w-[24%]" />
                    <col class="w-[10%]" />
                    <col class="w-[34%]" />
                </colgroup>
                <thead>
                    <tr class="border-b border-line bg-raised text-ink-3">
                        <th class="px-3 py-2 font-semibold">
                            <span class="sr-only">Logo</span>
                        </th>
                        <th class="px-3 py-2 font-semibold">Name</th>
                        <th class="px-3 py-2 font-semibold">When</th>
                        <th class="px-3 py-2 text-right font-semibold">Participants</th>
                        <th class="px-3 py-2 font-semibold">Owners</th>
                    </tr>
                </thead>
                <tbody>
                    {#each filtered as h (h.id)}
                        <tr class="border-b border-line last:border-0">
                            <td class="px-3 py-2">{@render logo(h, 'h-8 w-8')}</td>
                            <td class="px-3 py-2">{@render nameLink(h)}</td>
                            <td class="px-3 py-2">
                                <div class="flex min-w-0 flex-col gap-0.5">
                                    <span class="text-ink-2">{groupLabel(h)}</span>
                                    <span class="tnum truncate text-ink-3" title={meta(h)}>
                                        {meta(h)}
                                    </span>
                                </div>
                            </td>
                            <td class="tnum px-3 py-2 text-right text-ink-3">
                                {h.participantCount ?? '—'}
                            </td>
                            <td class="px-3 py-2">{@render owners(h)}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>
