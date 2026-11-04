<!-- The top of every signed-in page: the way back, the page's one <h1>, its ⓘ
     and what the page acts with. One component so that all of these sit in
     the same place on every page — the help button in particular is only
     findable if it is always right after the title.

     Conventions (see the frontend-dev skill):
     - `title` is the page's sidebar label where it has one; "New X" / "Edit X"
       for create and edit pages.
     - `back.label` is the title of the page it leads to, without "Back to".
     - `topic` names `$lib/content/help/<topic>.md`; the dialog is titled
       after the page, so its button reads "About <title>". -->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import { resolve } from '$app/paths';
    import InfoButton from '$lib/components/layout/InfoButton.svelte';

    let {
        title,
        back,
        topic,
        leading,
        meta,
        actions,
    }: {
        title: string;
        /** Unresolved path and the destination page's title. */
        back?: { href: string; label: string };
        /** Help text shown behind the ⓘ next to the title. */
        topic?: string;
        /** Beside the title block, before it — an avatar. */
        leading?: Snippet;
        /** Small lines under the title: a count, a username. */
        meta?: Snippet;
        /** Right-aligned on wide screens, below the title on narrow ones. */
        actions?: Snippet;
    } = $props();
</script>

<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div class="flex min-w-0 flex-col gap-1">
        {#if back}
            <a
                href={resolve(back.href)}
                class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
            >
                &larr; {back.label}
            </a>
        {/if}
        <div class="flex min-w-0 items-center gap-4">
            {@render leading?.()}
            <div class="flex min-w-0 flex-col gap-1">
                <div class="flex min-w-0 items-center gap-2">
                    <h1 class="m-0 break-words text-title leading-snug text-ink">{title}</h1>
                    {#if topic}
                        <InfoButton {topic} {title} />
                    {/if}
                </div>
                {#if meta}
                    <div class="flex flex-col gap-1 text-xs text-ink-3">
                        {@render meta()}
                    </div>
                {/if}
            </div>
        </div>
    </div>
    {#if actions}
        <div class="flex flex-wrap items-center gap-2">
            {@render actions()}
        </div>
    {/if}
</header>
