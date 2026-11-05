<script lang="ts">
    import { Lock, Pencil, Plus, Trash2 } from 'lucide-svelte';
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import ManageHubBackLink from '$lib/components/hackathon/ManageHubBackLink.svelte';
    import ResultsList from '$lib/components/hackathon/ResultsList.svelte';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // Making results final reports beside its button; everything else (a
    // refused delete) at the top, above the categories it is about.
    const finalizeMessage = $derived(
        form?.section === 'finalize' ? form.message : undefined
    );
    const topMessage = $derived(form?.section !== 'finalize' ? form?.message : undefined);

    function people(n: number): string {
        return n === 1 ? '1 person' : `${n} people`;
    }
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/timeline). -->
<div class="flex flex-col gap-8 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-0.5">
            <ManageHubBackLink hackathonId={data.hackathonId} />
            <h2 class="m-0 text-title text-ink">Manage Voting</h2>
            <span class="text-xs text-ink-3">
                {data.voterTotal === 0 ? 'Nobody has voted yet' : `${people(data.voterTotal)} voted`}
            </span>
        </div>
        <!-- Not once results are final: a category added then could never get
             any. -->
        {#if !data.resultsFinal}
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/voting/manage/new`)}
                class="btn btn-sm btn-solid no-underline"
            >
                <Plus class="h-3 w-3 shrink-0" aria-hidden="true" />
                New category
            </a>
        {/if}
    </div>

    {#if topMessage}
        <p class="m-0 text-xs text-danger-ink" role="alert">{topMessage}</p>
    {/if}

    <!-- The round in order, each step with where it stands. Voting and results
         visibility are hackathon capabilities, switched in Settings so that
         every switch stays in one place; this page only links there. -->
    <section class="card box-border w-full px-5 py-4">
        <h3 class="m-0 mb-3 text-sm font-semibold text-ink">How voting works</h3>
        <ol class="m-0 flex list-none flex-col gap-3 p-0">
            <li class="flex flex-col gap-0.5">
                <span class="text-sm text-ink">1. Set up categories</span>
                <span class="text-xs text-ink-3">
                    A category is one question people vote on, such as "Best Demo". Once
                    anyone has voted in it, it is locked and can no longer be changed.
                </span>
            </li>
            <li class="flex flex-col gap-0.5">
                <span class="flex flex-wrap items-center gap-2 text-sm text-ink">
                    2. Open voting, then close it
                    {#if data.votingOpen}
                        <span class="badge badge-success">Open</span>
                    {:else}
                        <span class="badge badge-neutral">Closed</span>
                    {/if}
                </span>
                <span class="text-xs text-ink-3">
                    Participants can vote while it is open. Switch
                    <a
                        href={resolve(`/my/hackathon/${data.hackathonId}/manage`)}
                        class="font-semibold text-accent-ink no-underline hover:underline"
                    >
                        "Vote" in Settings</a
                    >.
                </span>
            </li>
            <li class="flex flex-col gap-0.5">
                <span class="flex flex-wrap items-center gap-2 text-sm text-ink">
                    3. Make the results final
                    {#if data.resultsFinal}
                        <span class="badge badge-success">Final</span>
                    {:else}
                        <span class="badge badge-neutral">Not yet</span>
                    {/if}
                </span>
                <span class="text-xs text-ink-3">
                    Once voting is closed, below. Done once, for every category.
                </span>
            </li>
            <li class="flex flex-col gap-0.5">
                <span class="flex flex-wrap items-center gap-2 text-sm text-ink">
                    4. Publish the results
                    {#if data.resultsVisible}
                        <span class="badge badge-success">Visible</span>
                    {:else}
                        <span class="badge badge-neutral">Hidden</span>
                    {/if}
                </span>
                <span class="text-xs text-ink-3">
                    Shows participants the final results of every category — possible
                    once they are final. Switch
                    <a
                        href={resolve(`/my/hackathon/${data.hackathonId}/manage`)}
                        class="font-semibold text-accent-ink no-underline hover:underline"
                    >
                        "View results" in Settings</a
                    >.
                </span>
            </li>
        </ol>
    </section>

    <!-- Categories -->
    <section class="flex flex-col gap-3">
        <h3 class="m-0 text-sm font-semibold text-ink">Categories</h3>

        {#if data.categories.length === 0}
            <p class="m-0 py-4 text-sm text-ink-3">No categories yet. Add one to vote on.</p>
        {:else}
            <ol class="m-0 flex list-none flex-col gap-2 p-0">
                {#each data.categories as category (category.id)}
                    {@const locked = category.voterCount > 0 || data.resultsFinal}
                    <li class="card card-raised box-border w-full px-5 py-4">
                        <div class="flex flex-col gap-1.5">
                            <div class="flex flex-wrap items-center gap-2">
                                <h4 class="m-0 text-sm leading-snug text-ink">
                                    {category.name}
                                </h4>
                                <span class="badge badge-neutral">{category.methodLabel}</span>
                                {#if category.method === 'points' && category.maxPoints > 0}
                                    <span class="badge badge-neutral">
                                        {category.maxPoints} pts each
                                    </span>
                                {/if}
                                {#if !category.votableInBooth}
                                    <span class="badge badge-warning">Not votable here</span>
                                {/if}

                                <div class="ml-auto flex items-center gap-3">
                                    {#if locked}
                                        <!-- No Edit or Delete: what people voted on
                                             has to stay what it was. -->
                                        <span class="text-xs text-ink-3">
                                            <Lock class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                                            Locked
                                        </span>
                                    {:else}
                                        <a
                                            href={resolve(
                                                `/my/hackathon/${data.hackathonId}/voting/manage/${category.id}/edit`
                                            )}
                                            class="text-xs font-semibold text-accent-ink
                                                   no-underline hover:underline"
                                        >
                                            <Pencil class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                                            Edit<span class="sr-only"> {category.name}</span>
                                        </a>
                                        <form method="POST" action="?/delete" use:enhance>
                                            <input type="hidden" name="categoryId" value={category.id} />
                                            <button
                                                type="submit"
                                                class="text-xs font-semibold text-danger-ink
                                                       underline-offset-2 hover:underline"
                                            >
                                                <Trash2 class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                                                Delete<span class="sr-only"> {category.name}</span>
                                            </button>
                                        </form>
                                    {/if}
                                </div>
                            </div>

                            {#if category.description}
                                <p class="m-0 line-clamp-2 text-xs leading-snug text-ink-2">
                                    {category.description}
                                </p>
                            {/if}

                            <p class="m-0 text-xs text-ink-3">
                                {category.voterCount === 0
                                    ? 'Nobody has voted yet'
                                    : `${people(category.voterCount)} voted`}
                            </p>
                        </div>
                    </li>
                {/each}
            </ol>
        {/if}
    </section>

    <!-- Results: the live count until they are final, then the final results.
         Every category on one page, laid out exactly as participants will see
         them (they get the places; the scores need a backend change first —
         see the TODO on the Results page). -->
    {#if data.categories.length > 0}
        <section class="flex flex-col gap-4">
            {#if data.resultsFinal}
                <div class="flex flex-col gap-0.5">
                    <h3 class="m-0 text-sm font-semibold text-ink">Final results</h3>
                    <span class="text-xs text-ink-3">
                        {data.resultsVisible
                            ? 'Participants can see these.'
                            : 'Participants cannot see these yet — switch "View results" on in Settings to publish them.'}
                    </span>
                </div>
            {:else}
                <div class="flex flex-col gap-0.5">
                    <h3 class="m-0 text-sm font-semibold text-ink">Count so far</h3>
                    <span class="text-xs text-ink-3">
                        Only organizers can see this. Equal scores share a place.
                    </span>
                </div>
            {/if}

            {#each data.categories as category (category.id)}
                {@const rows = data.resultsFinal ? category.results : category.count}
                <div class="flex flex-col gap-2">
                    <h4 class="m-0 text-sm text-ink">{category.name}</h4>
                    {#if rows.length === 0}
                        <p class="m-0 text-xs text-ink-3">Nobody has voted in this category.</p>
                    {:else}
                        <ResultsList {rows} method={category.method} hackathonId={data.hackathonId} />
                    {/if}
                </div>
            {/each}

            {#if !data.resultsFinal}
                <div class="card box-border flex w-full flex-col gap-3 px-5 py-4">
                    <p class="m-0 text-xs text-ink-2">
                        Making the results final turns the count above into the results of
                        every category. <strong>It is done once and cannot be redone</strong>,
                        so it is only possible once voting is closed.
                    </p>
                    <form
                        method="POST"
                        action="?/finalize"
                        use:enhance
                        class="flex flex-wrap items-center gap-3"
                    >
                        <button
                            type="submit"
                            class="btn btn-sm btn-solid"
                            disabled={data.votingOpen || data.voterTotal === 0}
                        >
                            Make results final
                        </button>
                        {#if finalizeMessage}
                            <span class="text-xs text-danger-ink" role="alert">
                                {finalizeMessage}
                            </span>
                        {:else if data.votingOpen}
                            <span class="text-xs text-ink-3">
                                Voting is still open — switch
                                <a
                                    href={resolve(`/my/hackathon/${data.hackathonId}/manage`)}
                                    class="font-semibold text-accent-ink no-underline hover:underline"
                                >
                                    "Vote" off in Settings</a
                                > first.
                            </span>
                        {:else if data.voterTotal === 0}
                            <span class="text-xs text-ink-3">Nothing to make final until someone votes.</span>
                        {/if}
                    </form>
                </div>
            {/if}
        </section>
    {/if}
</div>
