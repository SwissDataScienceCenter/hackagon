<script lang="ts">
    import { enhance } from '$app/forms';
    import Plus from 'lucide-svelte/icons/plus';
    import Trash2 from 'lucide-svelte/icons/trash-2';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    let rows = $state(
        data.prizes.length > 0
            ? data.prizes.map((p) => ({ rank: p.rank, title: p.title }))
            : [{ rank: 1, title: '' }]
    );

    let confirmingFinalize = $state(false);
</script>

<div class="flex w-full flex-col gap-8 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <h1 class="m-0 text-title text-ink">Prizes</h1>
        <p class="m-0 text-xs text-ink-3">
            What this event awards. The vote is advisory — you review the tally and record who
            actually won, then finalise.
        </p>
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-danger-ink" role="alert">{form.message}</p>
    {/if}

    {#if data.finalized}
        <p class="m-0 text-xs text-ink-2">
            <span class="badge badge-success">Finalised</span>
            The awards are frozen. Editing the table no longer changes what was given.
        </p>
    {/if}

    <form method="POST" action="?/save" use:enhance class="card flex flex-col gap-4 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="m-0 text-section text-ink">The prize table</h2>
            {#if form?.saved}<span class="text-xs text-success-ink">Saved.</span>{/if}
        </div>

        {#each rows as row, i (i)}
            <div class="grid gap-2 sm:grid-cols-[6rem_1fr_auto] sm:items-end">
                <label class="flex flex-col gap-1">
                    <span class="field-label">Rank</span>
                    <!-- Rank orders the table; it is not a unique key, so two
                         joint seconds are allowed and sort together. -->
                    <input type="number" name="rank" class="field tnum" min="0" bind:value={row.rank} />
                </label>
                <label class="flex flex-col gap-1">
                    <span class="field-label">Prize</span>
                    <input
                        name="title"
                        class="field"
                        bind:value={row.title}
                        placeholder="Best use of open data — 1000 CHF"
                    />
                </label>
                <button
                    type="button"
                    class="btn btn-icon btn-sm btn-quiet"
                    aria-label="Remove prize"
                    onclick={() => (rows = rows.filter((_, n) => n !== i))}
                >
                    <Trash2 class="h-4 w-4" />
                </button>
            </div>
        {/each}

        <div class="flex flex-wrap gap-2">
            <button
                type="button"
                class="btn btn-sm"
                onclick={() => (rows = [...rows, { rank: rows.length + 1, title: '' }])}
            >
                <Plus class="h-4 w-4" /> Add prize
            </button>
            <button type="submit" class="btn btn-accent">Save prizes</button>
        </div>
    </form>

    {#if data.awards.length > 0}
        <section class="card flex flex-col gap-3 p-4">
            <h2 class="m-0 text-section text-ink">Awarded</h2>
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
                {#each data.awards as award (award.rank + award.title)}
                    <li class="flex items-baseline gap-3 text-sm">
                        <span class="tnum text-ink-3">#{award.rank}</span>
                        <span class="text-ink">{award.title}</span>
                    </li>
                {/each}
            </ul>
        </section>
    {/if}

    {#if !data.finalized}
        <section class="card flex flex-col gap-3 p-4">
            <h2 class="m-0 text-section text-ink">Finalise the awards</h2>
            <p class="m-0 text-sm text-ink-2">
                Freezes what was given. Do this once the winners are announced — it is the
                record of the event, and the tally stops being able to change it.
            </p>

            {#if !confirmingFinalize}
                <div>
                    <button class="btn" onclick={() => (confirmingFinalize = true)}>
                        Finalise…
                    </button>
                </div>
            {:else}
                <form method="POST" action="?/finalize" use:enhance class="flex flex-wrap gap-2">
                    <button type="submit" class="btn btn-accent">Yes, finalise</button>
                    <button type="button" class="btn" onclick={() => (confirmingFinalize = false)}>
                        Cancel
                    </button>
                </form>
            {/if}
        </section>
    {/if}
</div>
