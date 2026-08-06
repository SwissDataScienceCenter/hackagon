<script lang="ts">
    import { Download, Trash2, Wand2 } from 'lucide-svelte';
    import { enhance } from '$app/forms';
    import { resolve } from '$app/paths';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    // `ActionData` is the union of every action's return, and `needsForce` is on
    // only one member of it — so it has to be narrowed rather than read off the
    // union. Set when SuggestResults refused to overwrite existing placements.
    const needsForce = $derived(form !== null && 'needsForce' in form && form.needsForce);

    // The four downloads the export endpoint serves. Built as a list so each
    // anchor resolves its own href — `resolve()` is route-literal typed, so a
    // shared base string concatenated at the anchor would not satisfy it.
    const exports = $derived([
        { file: 'results.csv', label: 'Results CSV' },
        { file: 'results.json', label: 'Results JSON' },
        { file: 'votes.csv', label: 'Votes CSV' },
        { file: 'votes.json', label: 'Votes JSON' }
    ]);

    // Submissions with no placement yet — the only ones worth offering in the
    // "add a placement" picker. A submission can legitimately be placed twice
    // (two categories, two prizes), but twice in the *same* category is almost
    // always a slip.
    const unplaced = $derived(
        data.submissions.filter((s) => !data.results.some((r) => r.submissionId === s.id))
    );
</script>

<!-- Page shell: px-4 py-8 sm:px-10 md:px-20 (matches participants/teams/timeline). -->
<div class="flex flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/voting/manage`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to voting
        </a>
        <h1 class="m-0 text-title text-ink">Results — {data.category.name}</h1>
        <p class="m-0 text-xs text-ink-3">
            {data.voteCount === 0
                ? 'No votes cast'
                : data.voteCount === 1
                  ? '1 vote cast'
                  : `${data.voteCount} votes cast`}
            · {data.category.methodLabel}
        </p>
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    <!-- Publishing and showing are two different acts, because the backend makes
         them two capabilities. Saying so here stops an organiser assuming a
         tally is live the moment they compute it. -->
    {#if data.resultsVisible}
        <p class="m-0 text-xs text-ink-3">
            Participants <strong>can</strong> see these results.
        </p>
    {:else}
        <p class="m-0 text-xs text-ink-3">
            Participants <strong>cannot</strong> see these results yet. Turn on
            "view results" under
            <a
                href={resolve(`/my/hackathon/${data.hackathonId}/timeline/manage`)}
                class="font-semibold text-accent-ink no-underline hover:underline"
            >
                Manage Timeline
            </a>
            when you are ready to publish.
        </p>
    {/if}

    <!-- Tally -->
    <section class="flex flex-col gap-3">
        <h2 class="m-0 text-sm font-semibold text-ink">Tally the votes</h2>
        <p class="m-0 text-xs text-ink-3">
            {#if data.category.method === 'points'}
                Adds up each submission's points and places them highest first.
            {:else if data.category.method === 'ranked'}
                Scores each ranking — first place on a ballot is worth the most —
                and places them highest first.
            {:else}
                Counts the votes for each submission and places them highest first.
            {/if}
            Equal scores share a position.
        </p>

        {#if needsForce}
            <!-- The backend refused rather than clobbering. Offering the
                 overwrite here is the whole point of surfacing that separately:
                 the alternative is an error the organiser cannot act on. -->
            <div class="flex flex-col gap-2">
                <p class="m-0 text-xs text-danger-ink" role="alert">
                    Recomputing <strong>deletes the {data.results.length} placement{data
                        .results.length === 1
                        ? ''
                        : 's'} below</strong>, including any titles or positions you
                    set by hand. There is no undo.
                </p>
                <form method="POST" action="?/suggest" use:enhance>
                    <input type="hidden" name="force" value="true" />
                    <button type="submit" class="btn btn-sm btn-solid">
                        <Wand2 class="h-3 w-3 shrink-0" aria-hidden="true" />
                        Overwrite and recompute
                    </button>
                </form>
            </div>
        {:else}
            <form method="POST" action="?/suggest" use:enhance>
                <button
                    type="submit"
                    class="btn btn-sm btn-solid"
                    disabled={data.voteCount === 0}
                >
                    <Wand2 class="h-3 w-3 shrink-0" aria-hidden="true" />
                    Compute from votes
                </button>
                {#if data.voteCount === 0}
                    <span class="ml-2 text-xs text-ink-3">Nothing to tally yet.</span>
                {/if}
            </form>
        {/if}
    </section>

    <!-- Placements -->
    <section class="flex flex-col gap-3">
        <h2 class="m-0 text-sm font-semibold text-ink">Placements</h2>

        {#if data.results.length === 0}
            <p class="m-0 py-4 text-sm text-ink-3">
                Nothing placed yet. Compute from the votes above, or add a placement
                by hand.
            </p>
        {:else}
            <ol class="m-0 flex list-none flex-col gap-2 p-0">
                {#each data.results as result (result.id)}
                    <li class="card card-raised box-border w-full px-5 py-4">
                        <form
                            method="POST"
                            action="?/edit"
                            use:enhance
                            class="flex flex-wrap items-end gap-3"
                        >
                            <input type="hidden" name="resultId" value={result.id} />

                            <label class="field-label">
                                Position
                                <input
                                    type="number"
                                    name="position"
                                    min="1"
                                    required
                                    value={result.position}
                                    class="field w-20"
                                />
                            </label>

                            <label class="field-label min-w-48 flex-1">
                                Title <span class="font-normal text-ink-3">(optional)</span>
                                <input
                                    type="text"
                                    name="title"
                                    maxlength="255"
                                    value={result.title}
                                    placeholder="Most Innovative"
                                    class="field w-full"
                                />
                            </label>

                            <div class="flex min-w-48 flex-1 flex-col gap-0.5 pb-2">
                                <span class="text-sm text-ink">{result.projectTitle}</span>
                                <span class="text-xs text-ink-3">{result.teamName}</span>
                            </div>

                            <div class="flex items-center gap-3 pb-1.5">
                                <button type="submit" class="btn btn-sm btn-ghost">Save</button>
                            </div>
                        </form>

                        <form method="POST" action="?/remove" use:enhance class="mt-1">
                            <input type="hidden" name="resultId" value={result.id} />
                            <button
                                type="submit"
                                class="text-xs font-semibold text-danger-ink
                                       underline-offset-2 hover:underline"
                            >
                                <Trash2 class="inline h-3 w-3 shrink-0" aria-hidden="true" />
                                Remove<span class="sr-only"> {result.projectTitle}</span>
                            </button>
                        </form>
                    </li>
                {/each}
            </ol>
        {/if}
    </section>

    <!-- Add by hand -->
    {#if unplaced.length > 0}
        <section class="flex flex-col gap-3">
            <h2 class="m-0 text-sm font-semibold text-ink">Add a placement</h2>
            <form
                method="POST"
                action="?/add"
                use:enhance
                class="flex flex-wrap items-end gap-3"
            >
                <label class="field-label min-w-56 flex-1">
                    Submission
                    <select name="submissionId" required class="field w-full">
                        {#each unplaced as submission (submission.id)}
                            <option value={submission.id}>
                                {submission.projectTitle} — {submission.teamName}
                            </option>
                        {/each}
                    </select>
                </label>

                <label class="field-label">
                    Position
                    <input type="number" name="position" min="1" value="1" required class="field w-20" />
                </label>

                <label class="field-label min-w-48 flex-1">
                    Title <span class="font-normal text-ink-3">(optional)</span>
                    <input
                        type="text"
                        name="title"
                        maxlength="255"
                        placeholder="Most Innovative"
                        class="field w-full"
                    />
                </label>

                <div class="pb-1.5">
                    <button type="submit" class="btn btn-sm btn-solid">Add</button>
                </div>
            </form>
        </section>
    {/if}

    <!-- Export -->
    <section class="flex flex-col gap-2">
        <h2 class="m-0 text-sm font-semibold text-ink">Export</h2>
        <div class="flex flex-wrap gap-3">
            {#each exports as item (item.file)}
                <a
                    href={resolve(
                        `/my/hackathon/${data.hackathonId}/voting/manage/${data.category.id}/results/export/${item.file}`
                    )}
                    class="btn btn-sm btn-ghost no-underline"
                    download
                >
                    <Download class="h-3 w-3 shrink-0" aria-hidden="true" />
                    {item.label}
                </a>
            {/each}
        </div>
        <p class="m-0 text-xs text-ink-3">
            The vote exports identify voters by Keycloak id, so they are not
            anonymous — treat them accordingly.
        </p>
    </section>
</div>
