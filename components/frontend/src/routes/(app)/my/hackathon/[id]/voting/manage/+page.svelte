<script lang="ts">
    import { Pencil, Plus, Trash2, Trophy } from 'lucide-svelte';
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/timeline). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-0.5">
            <h2 class="m-0 text-title text-ink">Manage Voting</h2>
            <span class="text-xs text-ink-3">
                {data.categories.length === 1
                    ? '1 category'
                    : `${data.categories.length} categories`}
            </span>
        </div>
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/voting/manage/new`)}
            class="btn btn-sm btn-solid no-underline"
        >
            <Plus class="h-3 w-3 shrink-0" aria-hidden="true" />
            New category
        </a>
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <!-- The capability, not the categories, is what decides whether anyone can
         vote — so an organiser who has built categories and left voting off gets
         told here rather than discovering it from participants. -->
    {#if !data.votingEnabled}
        <p class="m-0 text-xs text-ink-3">
            Voting is currently <strong>off</strong> for this hackathon, so participants
            cannot see these categories or cast a vote. Turn it on under
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/timeline/manage`)}
                class="font-semibold text-accent-ink no-underline hover:underline"
            >
                Manage Timeline
            </a>.
        </p>
    {/if}

    <p class="m-0 text-xs text-ink-3">
        A category is one question people vote on. Create as many as you want to
        award separately — "Best Demo" and "Most Useful" are two categories, not two
        prizes in one.
    </p>

    {#if data.categories.length === 0}
        <p class="m-0 py-6 text-center text-sm text-ink-3">
            No categories yet. Add one to open voting on it.
        </p>
    {:else}
        <ol class="m-0 flex list-none flex-col gap-2 p-0">
            {#each data.categories as category (category.id)}
                <li class="card card-raised box-border w-full px-5 py-4">
                    <div class="flex flex-col gap-1.5">
                        <div class="flex flex-wrap items-center gap-2">
                            <h3 class="m-0 text-sm leading-snug text-ink">
                                {category.name}
                            </h3>
                            <span class="badge badge-neutral">{category.methodLabel}</span>
                            {#if category.method === 'points' && category.maxPoints > 0}
                                <span class="badge badge-neutral">
                                    {category.maxPoints} pts each
                                </span>
                            {/if}
                            {#if category.isJury}
                                <span class="badge badge-neutral">Jury</span>
                            {/if}
                            {#if !category.votableInBooth}
                                <span class="badge badge-warning">Not votable here</span>
                            {/if}

                            <div class="ml-auto flex items-center gap-3">
                                <a
                                    href={resolve(
                                        `/my/hackathon/${data.hackathonId}/voting/manage/${category.id}/results`
                                    )}
                                    class="text-xs font-semibold text-accent-ink
                                           no-underline hover:underline"
                                >
                                    <Trophy class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                                    Results<span class="sr-only"> for {category.name}</span>
                                </a>
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

                                <!-- Disabled rather than hidden once votes exist: the
                                     reason is worth stating, and the backend cannot
                                     delete it anyway (see the action's TODO). -->
                                {#if category.voteCount > 0}
                                    <span
                                        class="text-xs font-semibold text-ink-3"
                                        title="A category with votes cannot be deleted"
                                    >
                                        <Trash2 class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                                        Delete
                                    </span>
                                {:else}
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
                            {category.voteCount === 0
                                ? 'No votes yet'
                                : category.voteCount === 1
                                  ? '1 vote cast'
                                  : `${category.voteCount} votes cast`}
                        </p>
                    </div>
                </li>
            {/each}
        </ol>
    {/if}
</div>
