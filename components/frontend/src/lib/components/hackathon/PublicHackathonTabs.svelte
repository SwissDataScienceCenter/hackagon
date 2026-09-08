<script lang="ts">
    import { resolve } from '$app/paths';

    let {
        hackathonId,
        pages,
        current,
    }: {
        hackathonId: string;
        /** Public pages, already ordered by the backend. */
        pages: { id: string; title: string }[];
        /** `'overview'`, or the id of the page being rendered. */
        current: string;
    } = $props();
</script>

<!--
  The way around a public hackathon: its landing page, then whatever information
  pages the organisers published — Schedule, Rules, FAQ, Venue.

  A strip rather than a sidebar, because the (public) shell deliberately has none
  (`showNav={false}` in (public)/+layout.svelte) and the member rail's entries all
  point into /my/, which is exactly where a visitor cannot go.

  `.chip` is this theme's segmented-control vocabulary, the same one
  ParticipantsManageTabs uses, and `aria-current="page"` is the accessible form
  of "you are here" for a link.

  Wraps rather than scrolls. A horizontally scrolling strip centred on the page
  clips its own first entry at the moment it overflows, and page titles are the
  organiser's prose — six of them, any length. Wrapping has no such edge.

  Drawn only when there is somewhere to go: a lone "Overview" chip on a hackathon
  that has published nothing is a control that does not control anything.
-->
{#if pages.length > 0}
    <nav
        class="flex flex-wrap justify-center gap-1 px-4 sm:px-10 md:px-20"
        aria-label="Hackathon pages"
    >
        <a
            href={resolve(`/hackathon/${hackathonId}`)}
            aria-current={current === 'overview' ? 'page' : undefined}
            class="chip no-underline {current === 'overview' ? 'chip-active' : ''}"
        >
            Overview
        </a>
        {#each pages as page (page.id)}
            <a
                href={resolve(`/hackathon/${hackathonId}/pages/${page.id}`)}
                aria-current={current === page.id ? 'page' : undefined}
                class="chip no-underline {current === page.id ? 'chip-active' : ''}"
            >
                {page.title}
            </a>
        {/each}
    </nav>
{/if}
