<script lang="ts">
    import { resolve } from '$app/paths';
    import { Users } from 'lucide-svelte';
    import { usableImage } from '$lib/utils/imageUrl';

    let {
        href,
        name,
        org,
        meta,
        imageUrl,
        badge,
        badgeVariant = 'badge-accent',
        count,
        size = 'default',
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
        count?: string;
        size?: 'default' | 'compact';
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

{#if href}
    <a href={resolve(href)} class="{layout} no-underline transition-colors hover:bg-raised">
        {@render row()}
    </a>
{:else}
    <!-- No hover affordance: the row is content, and reacting to the pointer
         would promise a click that goes nowhere. -->
    <div class={layout}>
        {@render row()}
    </div>
{/if}

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
        <span class="truncate text-sm font-semibold text-ink">{name}</span>
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
