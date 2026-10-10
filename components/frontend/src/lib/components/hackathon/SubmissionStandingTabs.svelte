<script lang="ts">
    import { resolve } from '$app/paths';
    import {
        SUBMISSION_FILTERS,
        SUBMISSION_FILTER_LABEL,
        submissionFilterQuery,
        type SubmissionFilter
    } from '$lib/utils/submissionFilter';

    /**
     * Manage Submissions, sliced by where each team stands.
     *
     * Links rather than buttons, the same choice `ProjectStatusTabs` makes: each
     * slice is a real address that can be bookmarked and that the back button
     * understands.
     *
     * Counts come from the caller and never from the rows on screen, so the tab
     * you are not on still tells you what is there: every team normally, and
     * only the teams matching a search while there is one — which is how a
     * search says which tab its matches are on.
     */
    let {
        hackathonId,
        current,
        counts
    }: {
        hackathonId: string;
        current: SubmissionFilter;
        counts: Record<SubmissionFilter, number>;
    } = $props();
</script>

<nav class="flex flex-wrap gap-1" aria-label="Filter teams by submission">
    {#each SUBMISSION_FILTERS as filter (filter)}
        {@const active = current === filter}
        <!-- `resolve()` inline: svelte/no-navigation-without-resolve reads the
             href expression itself. Same shape as ProjectStatusTabs. -->
        <a
            href="{resolve(
                `/my/hackathon/${hackathonId}/submissions/manage`
            )}{submissionFilterQuery(filter)}"
            aria-current={active ? 'page' : undefined}
            class="chip no-underline {active ? 'chip-active' : ''}"
        >
            {SUBMISSION_FILTER_LABEL[filter]}
            <!-- Warning on the two slices that hold teams still owing an entry —
                 the ones an organiser came to find. Zero shows as a plain
                 count: nothing to chase. -->
            {#if (filter === 'missing' || filter === 'draft') && counts[filter] > 0}
                <span class="badge badge-warning tnum">{counts[filter]}</span>
            {:else}
                <span class="tnum">{counts[filter]}</span>
            {/if}
        </a>
    {/each}
</nav>
