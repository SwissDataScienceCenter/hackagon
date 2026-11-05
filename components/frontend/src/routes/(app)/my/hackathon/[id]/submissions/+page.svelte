<script lang="ts">
    import ChevronsDownUp from 'lucide-svelte/icons/chevrons-down-up';
    import ChevronsUpDown from 'lucide-svelte/icons/chevrons-up-down';
    import { resolve } from '$app/paths';
    import SubmissionContent from '$lib/components/hackathon/SubmissionContent.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    // Derived from the load's return shape rather than restated, so the two
    // can't drift.
    type Card = PageData['ours'][number];

    // Every description open or folded at once. Open to start: most entries
    // are short, and a page of closed toggles hides what it exists to show.
    let detailsOpen = $state(true);
    const anyDescription = $derived(
        [...data.ours, ...data.others].some((c) => c.entry?.description),
    );

    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }
</script>

<!--
  One team's entry. `id` so the ballot and the results can link straight to a
  team's card; `scroll-mt` keeps it clear of the sticky nav bar (its `h-14`
  row plus its 1px border) when the link lands on it.
-->
{#snippet card(c: Card)}
    <div
        id="team-{c.teamId}"
        class="card card-raised box-border flex w-full scroll-mt-[calc(3.5rem+1px)] flex-col
               gap-2 px-5 py-4"
    >
        <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div class="flex min-w-0 flex-col gap-0.5">
                <h3 class="m-0 text-sm leading-snug text-ink">{c.projectTitle}</h3>
                <span class="text-xs text-ink-3">{c.teamName}</span>
            </div>
            <div class="flex shrink-0 items-center gap-2">
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
                <a
                    href={resolve(`/my/hackathon/${data.hackathonId}/teams/${c.teamId}`)}
                    class="btn btn-sm btn-ghost no-underline"
                >
                    View team
                </a>
            </div>
        </div>

        <!-- Foldable, all at once from the button by the heading: one long
             description pushes every team below it down. -->
        <div class="flex flex-col gap-1 border-t border-line pt-2">
            {#if c.entry}
                <SubmissionContent
                    repositoryUrl={c.entry.repositoryUrl}
                    attachmentFolderUrl={c.entry.attachmentFolderUrl}
                    description={c.entry.description}
                    collapseDescription
                    descriptionOpen={detailsOpen}
                />
                <span class="text-xs text-ink-3">
                    Last updated {formatDate(c.entry.updatedAt)}{#if c.entry.updatedBy}
                        by {c.entry.updatedBy}{/if}
                </span>
            {:else}
                <span class="text-xs text-ink-3">Not submitted yet</span>
            {/if}
        </div>
    </div>
{/snippet}

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/projects). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-wrap items-end justify-between gap-2">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-title text-ink">Submissions</h2>
            {#if data.teamCount > 0}
                <span class="text-xs text-ink-3">
                    {data.submittedCount} of {data.teamCount}
                    {data.teamCount === 1 ? 'team has' : 'teams have'} submitted
                </span>
            {/if}
        </div>
        {#if anyDescription}
            <button
                type="button"
                class="btn btn-sm btn-ghost"
                aria-expanded={detailsOpen}
                onclick={() => (detailsOpen = !detailsOpen)}
            >
                {#if detailsOpen}
                    <ChevronsDownUp class="h-3 w-3 shrink-0" aria-hidden="true" />
                    Collapse details
                {:else}
                    <ChevronsUpDown class="h-3 w-3 shrink-0" aria-hidden="true" />
                    Open details
                {/if}
            </button>
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
