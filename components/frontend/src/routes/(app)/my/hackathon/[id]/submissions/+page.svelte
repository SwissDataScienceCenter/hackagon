<script lang="ts">
    import { resolve } from '$app/paths';
    import SubmissionCard from '$lib/components/hackathon/SubmissionCard.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // Derived from the load's return shape rather than restated, so the two
    // can't drift.
    type Card = PageData['ours'][number];
</script>

<!-- One team's entry, as a row: the whole of it is read on its own page. -->
{#snippet card(c: Card)}
    <SubmissionCard
        title={c.projectTitle}
        team={c.teamName}
        imageUrl={c.imageUrl}
        excerpt={c.entry?.excerpt}
        link={c.entry?.link}
        updatedAt={c.entry?.updatedAt}
        viewHref="/my/hackathon/{data.hackathonId}/submissions/{c.teamId}"
    >
        {#snippet actions()}
            {#if c.isOwn && data.maySubmit}
                <!-- To the form rather than a form here: one place edits,
                     the one with the unsaved-changes guard. -->
                <a
                    href={resolve(`/my/hackathon/${data.hackathonId}/submissions/mine`)}
                    class="btn btn-sm btn-outline-accent no-underline"
                >
                    Edit
                </a>
            {/if}
        {/snippet}
    </SubmissionCard>
{/snippet}

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-1">
        <h2 class="m-0 text-title text-ink">Submissions</h2>
        {#if data.teamCount > 0}
            <span class="text-xs text-ink-3">
                {data.submittedCount} of {data.teamCount}
                {data.teamCount === 1 ? 'team has' : 'teams have'} submitted
            </span>
        {/if}
    </div>

    {#if !data.teamsPublished}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            Team assignments have not been published for this hackathon yet, so there are no
            submissions to show.
        </p>
    {:else if data.teamCount === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            No teams have been formed in this hackathon yet.
        </p>
    {:else}
        <!-- The viewer's own team first, entry or not: it is the card they came
             to check. Read only here; editing is on Our submission. -->
        {#if data.ours.length > 0}
            <div class="flex w-full flex-col items-stretch gap-2">
                <span class="meta">
                    {data.ours.length === 1 ? 'Your team' : 'Your teams'}
                </span>
                {#each data.ours as c (c.teamId)}
                    {@render card(c)}
                {/each}
            </div>
        {/if}

        <div class="flex w-full flex-col items-stretch gap-2">
            {#if data.ours.length > 0}
                <span class="meta">Other teams</span>
            {/if}
            {#each data.others as c (c.teamId)}
                {@render card(c)}
            {:else}
                <p class="m-0 py-6 text-center text-sm text-ink-3">
                    {data.ours.length > 0
                        ? 'No other team has submitted yet.'
                        : 'No team has submitted yet.'}
                </p>
            {/each}
        </div>
    {/if}
</div>
