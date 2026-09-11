<script lang="ts">
    import type { Snippet } from 'svelte';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import HeroSection from './HeroSection.svelte';
    import JoinCta from './JoinCta.svelte';
    import { formatDateRange } from '$lib/utils/hackathonDates';
    import { statusLabel } from '$lib/utils/hackathonStatus';

    let {
        id,
        name,
        description,
        logo,
        startsAt,
        endsAt,
        status,
        signedIn,
        preview = false,
        nav,
    }: {
        id: string;
        name: string;
        description: string;
        logo?: string;
        startsAt?: Date;
        endsAt?: Date;
        /** Raw HackathonStatus number, as the loader returns it. */
        status: number;
        /** Unused when `preview` is set — the preview draws no Join block. */
        signedIn?: boolean;
        /**
         * Drawn for an organiser checking their own page rather than for a
         * visitor. Everything is rendered the same; only the interaction is
         * withdrawn, because a Join button that works inside the editor would
         * enrol the organiser in their own hackathon by accident.
         */
        preview?: boolean;
        /**
         * Navigation drawn between the hero and the description — the public
         * route's tab strip.
         *
         * A snippet the caller supplies rather than a `pages` prop this
         * component turns into links: what it *is* belongs to the route that
         * knows which entry is current, and this component's job is where it
         * sits. The preview passes none, for the same reason it draws no Join
         * block: chrome that leads somewhere is not something an organiser
         * checking their own copy should be able to click out through.
         */
        nav?: Snippet;
    } = $props();

    // Derived here, not passed in, for the same reason the whole view is one
    // component: a preview that formats its own dates or labels its own status
    // is a second implementation, and second implementations drift.
    const dates = $derived(formatDateRange({ startsAt, endsAt }));
</script>

<!--
  What a visitor sees at /hackathon/<id>, defined once.

  The public route renders this, and so does the organiser's Public page editor.
  That is the whole point: a preview built from its own markup looks right on the
  day it is written and lies by the end of the month, and the lie is worst
  exactly where it matters — the picture, whose shape nobody can predict from the
  URL they pasted.
-->
<div inert={preview}>
    <HeroSection
        title={name}
        {dates}
        imageUrl={logo}
        status={statusLabel(status)}
        breadcrumbs={[
            { label: 'Hackathons', href: '/' },
            { label: name, href: `/hackathon/${id}` },
        ]}
    />

    {#if nav}
        {@render nav()}
    {/if}

    <div class="mx-auto w-full max-w-7xl">
        <section class="px-4 py-12 sm:px-10 md:px-20">
            {#if description}
                <!-- The organizer's own markdown, through the same component the
                     editor previews with, so what they wrote is what shows. -->
                <div class="max-w-3xl">
                    <MarkdownContent content={description} />
                </div>
            {:else}
                <!-- Said plainly rather than filled with something inviting: this
                     page has one job, and an empty description means the organizer
                     has not done it yet. -->
                <p class="m-0 text-sm text-ink-3">
                    The organizers have not written a description for this hackathon yet.
                </p>
            {/if}
        </section>

        <!-- The way in, at the foot of the page: everything above is what the
             hackathon is, and this is what to do about it. One `btn-solid` on the
             page, which is the theme's rule — the hero above carries no action.

             Left out of the preview: it is the same block for every hackathon and
             nothing on the form beside it changes what it says, so in the editor
             it is a fixed footer taking the room the organiser wants for their
             own content. -->
        {#if !preview}
            <JoinCta hackathonId={id} {name} {status} signedIn={signedIn ?? false} />
        {/if}
    </div>
</div>
