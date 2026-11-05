<script lang="ts">
    import { resolve } from '$app/paths';
    import { Clock, UsersRound } from 'lucide-svelte';
    import RoundMedia from '$lib/components/hackathon/RoundMedia.svelte';
    import { avatarInitials } from '$lib/utils/initials';
    import { isHttpUrl } from '$lib/utils/url';
    import type { Snippet } from 'svelte';

    let {
        title,
        team,
        imageUrl,
        excerpt,
        link,
        updatedAt,
        viewHref,
        actions,
    }: {
        /** The project the entry is for — what the list is read by. */
        title: string;
        team: string;
        /** The project's image: a team has none of its own. */
        imageUrl?: string;
        /** The description, flattened out of markdown and cut to a row's worth
         *  by the loader, as ProjectCard's — never the raw body. */
        excerpt?: string;
        /** Drawn only without an excerpt, so an entry that is nothing but a
         *  link still says something on its row. */
        link?: string;
        /** Absent until the team saves something; the row then says so. */
        updatedAt?: Date;
        /** The entry's own page. Unresolved; resolved at the anchor below. */
        viewHref: string;
        /** Extra controls beside View, e.g. Edit on the viewer's own team. */
        actions?: Snippet;
    } = $props();

    // The project's initials stand in for its image, so a row shows the same
    // two letters as that project's own row.
    const initials = $derived(avatarInitials(title));

    // Date only: the row is scanned, and the entry's page has the time and
    // who saved it.
    const updatedOn = $derived(
        updatedAt?.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
    );
</script>

<!-- ProjectCard's row: media | title, excerpt, attributes | controls. The
     whole entry is read on its own page, so a long description no longer
     pushes every team below it down. -->
<div class="card card-raised box-border flex w-full items-start gap-4 px-5 py-4">
    <RoundMedia src={imageUrl} {initials} />

    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 class="m-0 text-sm leading-snug text-ink">{title}</h3>
        <!-- Two lines and no more, as on ProjectCard: the loader already cut
             the text, and the clamp is what holds on a narrow screen. -->
        {#if excerpt}
            <p
                class="prose m-0 line-clamp-2 max-w-[52ch] text-xs leading-snug
                       text-ink-2"
            >
                {excerpt}
            </p>
        {:else if link}
            <p class="m-0 truncate text-xs leading-snug">
                {#if isHttpUrl(link)}
                    <!-- eslint-disable svelte/no-navigation-without-resolve -- team-provided external URL -->
                    <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-accent-ink hover:underline"
                    >
                        {link}
                    </a>
                    <!-- eslint-enable svelte/no-navigation-without-resolve -->
                {:else}
                    <!-- Notes typed into the link field before it had to be one. -->
                    <span class="text-ink-2">{link}</span>
                {/if}
            </p>
        {/if}
        <!-- Team and date behind their icons, as ProjectCard puts author and
             track: attributes of the row. The icons are aria-hidden — the text
             beside them says it. -->
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
            <span class="inline-flex items-center gap-1.5">
                <UsersRound class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {team}
            </span>
            <span class="inline-flex items-center gap-1.5">
                <Clock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {updatedOn ? `Updated ${updatedOn}` : 'Not submitted yet'}
            </span>
        </div>
    </div>

    <div class="flex shrink-0 items-center gap-2">
        {@render actions?.()}
        <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
        <a href={resolve(viewHref as any)} class="btn btn-sm btn-ghost">View</a>
    </div>
</div>
