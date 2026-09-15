<script lang="ts">
    import { resolve } from '$app/paths';
    import { Calendar, MapPin, Users } from 'lucide-svelte';
    import StoredImage from './StoredImage.svelte';

    // One hero, two densities — not two heroes that happen to sit above the same
    // hackathon. A visitor and a member see the same elements in the same order,
    // which is what makes the public page and the member area read as one thing
    // seen from outside and in; `compact` only decides how much room they take.
    //
    // Only the title is required. Everything else is optional because a hackathon
    // may genuinely not have it: dates are nullable in the schema, and venue and
    // capacity have no field at all yet. The alternative — a required prop the
    // caller fills with a plausible-looking constant — is how a page ends up
    // stating a capacity nobody set.
    let {
        title,
        compact = false,
        breadcrumbs = [],
        dates,
        venue,
        imageUrl,
        badges = [],
        participantCount,
        participantCapacity,
        organizers = [],
    }: {
        title: string;
        /** Tighter, left-aligned, for the member shell. Full-size and centred otherwise. */
        compact?: boolean;
        /** Public only: inside the hackathon the sidebar already says where you are. */
        breadcrumbs?: { label: string; href: string }[];
        dates?: string;
        venue?: string;
        imageUrl?: string;
        badges?: { label: string; variant: string }[];
        participantCount?: number;
        /**
         * TODO(backend: hackathon-venue-capacity): omitted by every caller —
         * Hackathon has no capacity field. Until one exists the count renders on
         * its own, without a "/ N" denominator.
         */
        participantCapacity?: number;
        organizers?: { name: string; logoUrl: string; logoDarkUrl?: string }[];
    } = $props();

    const hasMeta = $derived(
        Boolean(dates) || Boolean(venue) || participantCount !== undefined,
    );

    // The description is deliberately not here. It is markdown — headings, lists,
    // links — and a hero rendered it as plain text in a two-line clamp, so a
    // member read `## About` and `- item` as literal characters. Markdown needs
    // room, not a subtitle slot.
</script>

<!--
  The hackathon's picture is shown, not used as wallpaper. Drawn by `StoredImage`
  at its own proportions, exactly as the member's About page and the organiser's
  preview draw it — one field, one appearance, wherever the reader meets it.
-->
<section
    class="flex flex-col gap-4 {compact
        ? 'bg-raised px-4 py-4 sm:px-10 sm:py-6 md:px-20'
        : 'items-center px-4 pt-8 pb-12 text-center sm:px-10 md:px-20'}"
>
    {#if breadcrumbs.length > 0}
        <nav class="flex items-center gap-1.5 text-xs text-ink-2">
            {#each breadcrumbs as crumb, i (i)}
                {#if i > 0}
                    <span>/</span>
                {/if}
                <a href={resolve(crumb.href)} class="no-underline hover:text-accent-ink"
                    >{crumb.label}</a
                >
            {/each}
        </nav>
    {/if}

    <StoredImage
        src={imageUrl}
        alt={title}
        maxHeight={compact ? 'max-h-24' : 'max-h-64'}
        class={compact ? 'shrink-0' : 'max-w-3xl'}
    />

    {#if badges.length > 0}
        <div class="flex flex-wrap gap-1.5 {compact ? '' : 'justify-center'}">
            {#each badges as b (b.label)}
                <span class="badge {b.variant}">{b.label}</span>
            {/each}
        </div>
    {/if}

    <!-- The one element whose size differs rather than only its spacing: the
         name is the page's subject on both sides, and it stopped reading that way
         when the member hero shrank it to a label above a participant count. -->
    <h1
        class="whitespace-pre-line {compact
            ? 'text-title'
            : 'max-w-2xl text-3xl font-bold leading-tight sm:text-4xl'}"
    >
        {title}
    </h1>

    {#if hasMeta}
        <div
            class="flex flex-col gap-3 text-sm text-ink-2 sm:flex-row sm:flex-wrap
                   sm:items-center sm:gap-6 {compact ? '' : 'items-center sm:justify-center'}"
        >
            {#if dates}
                <span class="flex min-w-0 items-center gap-2">
                    <Calendar class="h-4 w-4 shrink-0 text-accent-ink" />
                    {dates}
                </span>
            {/if}
            {#if venue}
                <span class="flex min-w-0 items-center gap-2">
                    <MapPin class="h-4 w-4 shrink-0 text-accent-ink" />
                    {venue}
                </span>
            {/if}
            {#if participantCount !== undefined}
                <span class="flex min-w-0 items-center gap-2">
                    <Users class="h-4 w-4 shrink-0 text-accent-ink" />
                    {participantCount}{participantCapacity !== undefined
                        ? ` / ${participantCapacity}`
                        : ''} participants
                </span>
            {/if}
        </div>
    {/if}

    <!-- Guarded rather than always rendered: `organizers` is empty on every
         hackathon there is, and an empty flex row still spends vertical rhythm. -->
    {#if organizers.length > 0}
        <div class="flex flex-wrap items-center gap-3 sm:gap-4 {compact ? '' : 'justify-center'}">
            {#each organizers as org (org.name)}
                <div class="flex h-4 min-w-0 max-w-24 items-center sm:w-16">
                    {#if org.logoDarkUrl}
                        <img src={org.logoUrl} alt={org.name} class="block max-h-full max-w-full object-contain dark:hidden" />
                        <img src={org.logoDarkUrl} alt={org.name} class="hidden max-h-full max-w-full object-contain dark:block" />
                    {:else}
                        <img src={org.logoUrl} alt={org.name} class="max-h-full max-w-full object-contain invert dark:invert-0" />
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</section>
