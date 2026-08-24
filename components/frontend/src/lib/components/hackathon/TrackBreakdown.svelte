<script lang="ts">
    import { resolve } from '$app/paths';

    let {
        hackathonId,
        approvedCount,
        tracks,
    }: {
        hackathonId: string;
        /** Approved projects only, so this agrees with what /projects lists. */
        approvedCount: number;
        tracks: { id: string; name: string; count: number }[];
    } = $props();

    // The busiest track sets full width, so the bars compare tracks against each
    // other rather than against the total. Guarded at 1: with every track empty
    // the divisor would be zero and every bar would be NaN wide.
    const busiest = $derived(Math.max(1, ...tracks.map((t) => t.count)));

    const projectLabel = $derived(
        approvedCount === 1 ? '1 project' : `${approvedCount} projects`,
    );
    const trackLabel = $derived(tracks.length === 1 ? '1 track' : `${tracks.length} tracks`);
    // The count is already the figure when there are no bars, so the link does not
    // repeat it — three renderings of the same number in one card is what this
    // card is trying to stop being.
    const linkLabel = $derived(tracks.length > 0 ? projectLabel : 'projects');
</script>

<!--
  Where the projects are, as magnitude rather than as a sample.

  This replaced a preview of the two newest projects, which was too few to browse
  and carried numbers that only made sense on the page it linked to — and a pair
  of grey squares standing in for images that no project has. Counts are what the
  overview can honestly say about a list it is not showing.

  One hue throughout: the tiles this replaced alternated accent and info by index
  parity, so the colour changed with position and meant nothing. Length carries
  the magnitude, and a track with no projects still shows its name — an empty
  track is worth knowing about, especially for whoever created it.

  With no tracks there is nothing to group by and the count is the whole content,
  so it is shown as a figure rather than under an apology for the missing bars: a
  participant cannot create a track and does not need to be told grouping is off,
  and an organiser has Manage Tracks with its own empty state. The overview drops
  this card altogether when there is neither a track nor an approved project —
  see the guard there, which is what stops an empty box holding half the row.
-->
<section class="card flex flex-col gap-4 p-5" aria-labelledby="projects-heading">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="m-0 text-section" id="projects-heading">Projects</h2>
        <!-- Only alongside the bars. Without them the figure below says the same
             number, and saying it twice in one card reads as two facts. -->
        {#if tracks.length > 0}
            <span class="tnum text-xs text-ink-3">{projectLabel} · {trackLabel}</span>
        {/if}
    </div>

    {#if tracks.length === 0}
        {#if approvedCount > 0}
            <div class="flex items-baseline gap-2">
                <span class="tnum text-display text-ink">{approvedCount}</span>
                <span class="text-xs text-ink-3">
                    approved {approvedCount === 1 ? 'project' : 'projects'}
                </span>
            </div>
        {/if}
    {:else}
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
            {#each tracks as track (track.id)}
                <li class="flex flex-col gap-1">
                    <div class="flex items-baseline justify-between gap-3">
                        <span class="min-w-0 truncate text-xs text-ink-2">{track.name}</span>
                        <span class="tnum text-xs text-ink-3">{track.count}</span>
                    </div>
                    <!-- Tonal, never the solid accent: this is data, and the one
                         full-strength accent on the screen belongs to the phase
                         bar above it. -->
                    <div class="h-1.5 w-full overflow-hidden rounded-control bg-raised">
                        <div
                            class="h-full rounded-control bg-accent/40"
                            style="width: {(track.count / busiest) * 100}%"
                        ></div>
                    </div>
                </li>
            {/each}
        </ul>
    {/if}

    {#if approvedCount === 0}
        <p class="prose m-0 text-xs">No projects have been approved yet.</p>
    {:else}
        <a
            href={resolve(`/my/hackathon/${hackathonId}/projects`)}
            class="text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            View all {linkLabel} →
        </a>
    {/if}
</section>
