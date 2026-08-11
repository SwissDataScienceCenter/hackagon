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
-->
<section class="card flex flex-col gap-4 p-5" aria-labelledby="projects-heading">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="m-0 text-section" id="projects-heading">Projects</h2>
        <span class="tnum text-xs text-ink-3">
            {projectLabel}{tracks.length > 0 ? ` · ${trackLabel}` : ''}
        </span>
    </div>

    {#if tracks.length === 0}
        <p class="prose m-0 text-xs">
            No tracks have been defined, so projects are not grouped.
        </p>
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
            View all {projectLabel} →
        </a>
    {/if}
</section>
