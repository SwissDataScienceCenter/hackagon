<script lang="ts">
    import { resolve } from '$app/paths';
    import { Tag, User } from 'lucide-svelte';
    import RoundMedia from '$lib/components/hackathon/RoundMedia.svelte';
    import type { Snippet } from 'svelte';

    let {
        num,
        title,
        excerpt,
        creator,
        track,
        imageUrl,
        moreInfoHref = '#',
        moreInfoLabel = 'More Info',
        badge,
        badgeVariant = 'badge-neutral',
        actions,
    }: {
        num: number;
        title: string;
        /** The description, flattened out of markdown and cut to a row's worth
         *  by the loader — never the raw body. Absent when the project has no
         *  description, or has one with nothing quotable in it. */
        excerpt?: string;
        /** Who proposed it. Omitted when the creator is no longer a member. */
        creator?: string;
        /** Track name. Omitted when the project has no track, or its track was
         *  deleted — the row then simply carries no track. */
        track?: string;
        imageUrl?: string;
        moreInfoHref?: string;
        /** CTA text. The card is a row first and a "More Info" link second. */
        moreInfoLabel?: string;
        /** Generic chip text — kept a plain string so the card is not tied to
         *  any one vocabulary. Both project lists pass a status; others may not. */
        badge?: string;
        badgeVariant?: string;
        /** Extra controls beside the CTA, e.g. a prefer form. A snippet rather
         *  than props so the card stays ignorant of what the action does. */
        actions?: Snippet;
    } = $props();

    // The project's own initials stand in for the image it lacks — same
    // treatment as ParticipantCard, on the title rather than a person.
    const initials = $derived(
        title
            .split(' ')
            .filter(Boolean)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    );
</script>

<!-- Matches TeamCard: px-5 py-4, row gap-4, size-16 media, gap-1.5, title/ body scale, CTA. -->
<div
    class="card card-raised box-border flex w-full items-start gap-4 px-5 py-4"
>
    <!-- The ordinal leaves the title and becomes a gutter figure, so titles all
         start on one left edge and the numbers align down the list. -->
    <span class="tnum shrink-0 pt-0.5 text-meta text-ink-3">
        {String(num).padStart(2, '0')}
    </span>

    <RoundMedia src={imageUrl} {initials} />

    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <div class="flex flex-wrap items-center gap-2">
            <h3 class="m-0 text-sm leading-snug text-ink">
                {title}
            </h3>
            {#if badge}
                <span class="badge {badgeVariant} shrink-0">
                    {badge}
                </span>
            {/if}
        </div>
        <!-- The description is the one genuinely prose-shaped thing on the card,
             so it takes the sans face. `max-width` in `ch` rather than `w-2/3`
             keeps the measure readable at any container width.

             Two lines and no more. The loader already cut the text to a hundred
             characters, so the clamp is only what holds on a narrow screen,
             where those hundred characters still run to three lines and the row
             stops being scannable. -->
        {#if excerpt}
            <p
                class="prose m-0 line-clamp-2 max-w-[52ch] text-xs leading-snug
                       text-ink-2"
            >
                {excerpt}
            </p>
        {/if}
        <!-- Author and track on one line, each behind its own icon, so the two
             facts read as attributes of the row rather than sentences. The
             icons carry no information a sighted reader needs spelling out and
             no screen reader needs repeating — the text beside them says it —
             so they are aria-hidden. -->
        {#if creator || track}
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
                {#if creator}
                    <span class="inline-flex items-center gap-1.5">
                        <User class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {creator}
                    </span>
                {/if}
                {#if track}
                    <span class="inline-flex items-center gap-1.5">
                        <Tag class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {track}
                    </span>
                {/if}
            </div>
        {/if}
    </div>

    <div class="flex shrink-0 items-center gap-2">
        {@render actions?.()}
        <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
        <a href={resolve(moreInfoHref as any)} class="btn btn-sm btn-ghost">
            {moreInfoLabel}
        </a>
    </div>
</div>
