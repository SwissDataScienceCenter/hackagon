<script lang="ts">
    import { resolve } from '$app/paths';
    import { Calendar, MapPin, Users } from 'lucide-svelte';
    import StoredImage from './StoredImage.svelte';

    // Only the name and the breadcrumbs are required. Everything else is
    // optional because a hackathon may genuinely not have it: dates are
    // nullable in the schema, and venue and the registration count have no
    // field at all yet. The alternative — a required prop the caller fills with
    // a plausible-looking constant — is how a page ends up stating a capacity
    // nobody set.
    let {
        title,
        breadcrumbs,
        dates,
        venue,
        imageUrl,
        status,
        registered,
        capacity,
    }: {
        title: string;
        breadcrumbs: { label: string; href: string }[];
        dates?: string;
        venue?: string;
        imageUrl?: string;
        status?: string;
        registered?: number;
        capacity?: number;
    } = $props();

    // Only a pair says anything; one half of it is a fragment, not a fact.
    const hasCounts = $derived(registered !== undefined && capacity !== undefined);
    const hasMeta = $derived(Boolean(dates) || Boolean(venue) || hasCounts);
</script>

<!--
  The hackathon's picture is shown, not used as wallpaper.

  It used to be an `<img>` stretched behind this whole section at 30% opacity
  under a 70% scrim — 9% of the picture, which is a tint rather than an image and
  read as something failing to load. Being `object-cover` across a 24rem band, it
  also cropped whatever was pasted to the band's shape: a square wordmark lost its
  top and bottom.

  Now it is drawn by `StoredImage`, at its own proportions, exactly as the
  member's About page and the organiser's preview draw it. One field, one
  appearance, wherever the reader meets it.

  Centred as a block — breadcrumbs, picture, status, title and dates on one
  axis — which is the landing page's hero treatment too. Left-aligned it hung off
  the edge of a picture whose width now varies with whatever was pasted, so the
  column's edge moved from hackathon to hackathon.
-->
<section
    class="flex flex-col items-center gap-4 px-4 pt-8 pb-12 text-center sm:px-10
           md:px-20"
>
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

    <StoredImage src={imageUrl} maxHeight="max-h-64" class="max-w-3xl" />

    {#if status}
        <span class="badge badge-outline-accent w-fit">
            <span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
            <span>{status}</span>
        </span>
    {/if}

    <h1 class="max-w-2xl text-3xl font-bold leading-tight whitespace-pre-line sm:text-4xl">
        {title}
    </h1>

    {#if hasMeta}
        <div
            class="flex flex-col items-center gap-3 text-sm text-ink-2 sm:flex-row
                   sm:flex-wrap sm:items-center sm:justify-center sm:gap-6"
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
            {#if hasCounts}
                <span class="flex min-w-0 items-center gap-2">
                    <Users class="h-4 w-4 shrink-0 text-accent-ink" />
                    {registered} / {capacity} registered
                </span>
            {/if}
        </div>
    {/if}
</section>
