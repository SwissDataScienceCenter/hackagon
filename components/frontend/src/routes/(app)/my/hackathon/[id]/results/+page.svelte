<script lang="ts">
    import { ordinal, placementMedal } from '$lib/utils/voting';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/timeline). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex min-w-0 flex-col gap-0.5">
        <h2 class="m-0 text-title text-ink">Results</h2>
        {#if data.canView && data.categories.length > 0}
            <span class="text-xs text-ink-3">
                {data.categories.length === 1
                    ? '1 category'
                    : `${data.categories.length} categories`}
            </span>
        {/if}
    </div>

    {#if !data.canView}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            {data.resultsVisible
                ? 'You need to be a confirmed participant of this hackathon to see the results.'
                : 'Results have not been published yet.'}
        </p>
    {:else if data.categories.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            Nothing has been placed yet. Results appear here once the organizers
            publish them.
        </p>
    {:else}
        {#each data.categories as category (category.id)}
            <section class="flex flex-col gap-3">
                <div class="flex flex-wrap items-center gap-2">
                    <h3 class="m-0 text-sm font-semibold text-ink">{category.name}</h3>
                    {#if category.isJury}
                        <span class="badge badge-neutral">Jury</span>
                    {/if}
                </div>

                {#if category.description}
                    <p class="m-0 text-xs leading-snug text-ink-2">{category.description}</p>
                {/if}

                <ol class="m-0 flex list-none flex-col gap-2 p-0">
                    {#each category.results as result (result.id)}
                        <li class="card card-raised box-border w-full px-5 py-4">
                            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <!-- The ordinal carries the placement; the medal is
                                     decoration on top of it, so it is aria-hidden
                                     rather than announced twice. -->
                                <span class="text-sm font-semibold text-ink">
                                    {#if placementMedal(result.position)}
                                        <span aria-hidden="true">
                                            {placementMedal(result.position)}
                                        </span>
                                    {/if}
                                    {ordinal(result.position)}
                                </span>

                                <span class="text-sm text-ink">{result.projectTitle}</span>

                                {#if result.teamName}
                                    <span class="text-xs text-ink-3">{result.teamName}</span>
                                {/if}

                                {#if result.title}
                                    <span class="badge badge-neutral">{result.title}</span>
                                {/if}
                            </div>
                        </li>
                    {/each}
                </ol>
            </section>
        {/each}
    {/if}
</div>
