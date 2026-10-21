<script lang="ts">
    import { resolve } from '$app/paths';
    import { ordinal, placementMedal } from '$lib/utils/voting';

    /**
     * One category's places, best first — the single way results look, for the
     * organizer's count and final results and for the participants' Results
     * page alike, so what an organizer checks is what participants get.
     */
    let {
        rows,
        method,
        hackathonId
    }: {
        rows: {
            key: string;
            place: number;
            projectTitle: string;
            teamName: string;
            /** Links the entry to its team's page; absent when unresolvable. */
            teamId?: string;
            /** Absent when the viewer cannot know it (participants, for now). */
            score?: number;
            title?: string;
        }[];
        /** Decides the score's unit: votes, points, or a ranked score. */
        method: string;
        hackathonId: string;
    } = $props();

    function score(n: number): string {
        if (method === 'points') return n === 1 ? '1 point' : `${n} points`;
        if (method === 'ranked') return `score ${n}`;
        return n === 1 ? '1 vote' : `${n} votes`;
    }
</script>

<ol class="m-0 flex list-none flex-col gap-2 p-0">
    {#each rows as row (row.key)}
        <li class="card card-raised box-border flex w-full items-center gap-4 px-5 py-3">
            <!-- The ordinal carries the place; the medal is decoration on top of
                 it, so it is aria-hidden rather than announced twice. -->
            <span class="w-16 shrink-0 text-sm font-semibold text-ink">
                {#if placementMedal(row.place)}
                    <span aria-hidden="true">{placementMedal(row.place)}</span>
                {/if}
                {ordinal(row.place)}
            </span>

            <span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                <span class="text-sm text-ink">{row.projectTitle}</span>
                {#if row.teamName}
                    <span class="text-xs text-ink-3">{row.teamName}</span>
                {/if}
                {#if row.title}
                    <span class="badge badge-neutral">{row.title}</span>
                {/if}
            </span>

            {#if row.score !== undefined}
                <span class="shrink-0 text-sm text-ink-2">{score(row.score)}</span>
            {/if}

            <!-- The same "View entry" the ballot has, to the team's page, which is
                 where the submission itself is shown. Absent when the entry could
                 not be resolved — that row reads "Unknown submission" and there is
                 no team to send anyone to. -->
            {#if row.teamId}
                <a
                    href={resolve(`/my/hackathon/${hackathonId}/teams/${row.teamId}`)}
                    class="shrink-0 whitespace-nowrap text-xs font-semibold text-accent-ink
                           no-underline hover:underline"
                >
                    View entry<span class="sr-only">: {row.projectTitle}</span>
                </a>
            {/if}
        </li>
    {/each}
</ol>
