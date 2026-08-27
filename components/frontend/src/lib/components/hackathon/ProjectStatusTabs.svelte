<script lang="ts">
    import { resolve } from '$app/paths';
    import {
        PROJECT_FILTERS,
        PROJECT_FILTER_LABEL,
        projectFilterQuery,
        type ProjectFilter
    } from '$lib/utils/projectFilter';

    /**
     * The review queue, sliced by status.
     *
     * Links rather than buttons, the same choice `ParticipantsManageTabs` makes:
     * each slice is a real address that can be bookmarked and that the back
     * button understands. Unlike that component these point at one route with a
     * query parameter, because the slices share a card and a detail page — one
     * list narrowed, not separate surfaces.
     *
     * All three are always here, including the one you are on. A tab that
     * disappeared once selected would leave no way back to it, and the point of
     * showing Approved at all is that its projects never look gone.
     *
     * `.chip` is this theme's segmented-control vocabulary (see frontend-theme),
     * and `aria-current="page"` is the accessible form of "you are here" for a
     * link.
     *
     * Counts come from the whole set, never from the rows on screen, so the tab
     * you are not on still tells you what is waiting there. They live here
     * rather than under the page heading for the same reason they do on
     * Participants: the number you want is usually the one you are not looking at.
     */
    let {
        hackathonId,
        current,
        counts
    }: {
        hackathonId: string;
        current: ProjectFilter;
        counts: Record<ProjectFilter, number>;
    } = $props();
</script>

<nav class="flex flex-wrap gap-1" aria-label="Filter projects by status">
    {#each PROJECT_FILTERS as filter (filter)}
        {@const active = current === filter}
        <!-- `resolve()` inline rather than hoisted into a `$derived`:
             svelte/no-navigation-without-resolve reads the href expression
             itself, and cannot tell that a variable already holds a resolved
             path. Same shape as ParticipantsManageTabs. -->
        <a
            href="{resolve(
                `/my/hackathon/${hackathonId}/projects/manage`
            )}{projectFilterQuery(filter)}"
            aria-current={active ? 'page' : undefined}
            class="chip no-underline {active ? 'chip-active' : ''}"
        >
            {PROJECT_FILTER_LABEL[filter]}
            <!-- Warning, not neutral, on the one tab that is asking for work —
                 the same signal the Waitlist tab carries. This badge is what
                 draws an organiser to the queue, now that arriving no longer
                 does it for them. Zero shows as a plain count: nothing to chase. -->
            {#if filter === 'proposed' && counts.proposed > 0}
                <span class="badge badge-warning tnum">{counts.proposed}</span>
            {:else}
                <span class="tnum">{counts[filter]}</span>
            {/if}
        </a>
    {/each}
</nav>
