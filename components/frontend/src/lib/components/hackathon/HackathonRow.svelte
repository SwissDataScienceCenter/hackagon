<script lang="ts">
    import type { Snippet } from 'svelte';
    import { resolve } from '$app/paths';
    import { Users } from 'lucide-svelte';
    import Lock from 'lucide-svelte/icons/lock';
    import { usableImage } from '$lib/utils/imageUrl';
    import { isPrivate, visibilityLabel } from '$lib/utils/hackathonStatus';

    let {
        href,
        name,
        org,
        meta,
        imageUrl,
        badge,
        badgeVariant = 'badge-accent',
        visibility,
        count,
        size = 'default',
        titleExtra,
    }: {
        /**
         * Where the row goes, or absent for a hackathon the viewer holds no
         * `hackathon:read` on — there is no destination for those, so the row
         * renders as plain content rather than a link into a 403.
         */
        href?: string;
        name: string;
        org?: string;
        meta: string;
        /**
         * The hackathon's logo — the picture an organiser chose, and the only
         * picture this row ever shows. A hackathon without one gets an empty
         * ground of the same size rather than a generated stand-in.
         */
        imageUrl?: string;
        badge?: string;
        badgeVariant?: string;
        /**
         * Raw Visibility number, and only a private hackathon draws a chip from
         * it. Public is what a row on a list of hackathons is assumed to be, so
         * saying it on every one of them is noise; saying "Private" on the few
         * that are is what explains why they have no public page and no link to
         * one. Omit it where every row is public anyway.
         */
        visibility?: number;
        count?: string;
        size?: 'default' | 'compact';
        /**
         * Rendered on the title's own line, immediately after the name. For a
         * control that belongs to the hackathon rather than to the row's own
         * destination — a link out to its public page, say. Sits above the
         * overlay link, so a click on it does not open the row.
         */
        titleExtra?: Snippet;
    } = $props();

    // A logo is typed in, never uploaded, so a link that serves a web page is
    // the ordinary mistake rather than the rare one; the empty ground absorbs it.
    let failedSrc: string | undefined = $state(undefined);
    const hasImage = $derived(usableImage(imageUrl, failedSrc));

    const thumbSize = size === 'compact' ? 'h-9 w-9' : 'h-12 w-12';
    // A floor rather than a fixed height: with `org` set the row carries three
    // stacked lines, which a fixed height would clip.
    const rowHeight = size === 'compact' ? 'min-h-14' : 'min-h-[72px]';
    const layout = `flex ${rowHeight} items-center gap-4 px-4`;
</script>

<!-- The row's link covers the row without wrapping it: an absolutely positioned
     anchor over the whole area, with the content beside it rather than inside.

     Wrapping was simpler, but it made anything else in the row an anchor inside
     an anchor, which is invalid and which browsers resolve by closing the outer
     one early. That is why the link out to a hackathon's public page used to sit
     in a column of its own on the far right: there was nowhere on the title line
     it could legally go. Raised above the overlay with `relative`, it can.

     The overlay carries the name, because a link whose whole content is an empty
     box has nothing to announce. -->
<div class="relative {layout} {href ? 'transition-colors hover:bg-raised' : ''}">
    {#if href}
        <a
            href={resolve(href)}
            aria-label={name}
            class="absolute inset-0 no-underline"
        ></a>
    {/if}
    {@render row()}
</div>

{#snippet row()}
    {#if hasImage}
        <!-- `contain` on a plain ground, not `cover`: a hackathon logo is
             usually wide and often has its own background, and cropping it to a
             square would cut the wordmark in half. -->
        <div
            class="{thumbSize} shrink-0 overflow-hidden rounded-field border border-line bg-raised"
        >
            <img
                src={imageUrl}
                alt=""
                onerror={() => (failedSrc = imageUrl)}
                class="h-full w-full object-contain"
            />
        </div>
    {:else}
        <!-- An empty ground, not a generated picture. The colour used to be
             picked by the row's position in the list, so a hackathon's tile
             changed colour whenever the backend returned the list in another
             order — a picture nobody chose, and a different one each visit. The
             box stays so rows with and without a logo keep one left edge. -->
        <div class="{thumbSize} shrink-0 rounded-field border border-line bg-overlay"></div>
    {/if}
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <!-- The organisation is an eyebrow above the name rather than sharing a
             line behind a slash, so the hackathon's own name gets the line to
             itself and every row's title starts on the same left edge. -->
        {#if org}
            <span class="meta truncate">{org}</span>
        {/if}
        <span class="flex min-w-0 items-center gap-1.5">
            <span class="truncate text-sm font-semibold text-ink">{name}</span>
            <!-- A mark after the name rather than a chip beside the status: who
                 may see a hackathon is a property of it, not a state it is
                 passing through, and a full badge gave it more weight than the
                 name it qualifies. Public gets nothing at all — it is what a
                 hackathon on a list of hackathons is assumed to be. -->
            {#if visibility !== undefined && isPrivate(visibility)}
                <Lock
                    class="h-3.5 w-3.5 shrink-0 text-ink-3"
                    aria-label={visibilityLabel(visibility)}
                />
            {/if}
            {#if titleExtra}
                <span class="relative shrink-0">{@render titleExtra()}</span>
            {/if}
        </span>
        <span class="tnum text-xs text-ink-3">{meta}</span>
    </div>
    {#if badge}
        <span class="badge {badgeVariant} shrink-0">
            {badge}
        </span>
    {/if}
    {#if count}
        <!-- Tabular so the counts line up down the column rather than wandering. -->
        <div class="flex shrink-0 items-center gap-1 text-ink-3">
            <Users class="h-3 w-3" aria-hidden="true" />
            <span class="tnum text-xs">{count}</span>
        </div>
    {/if}
{/snippet}
