<script lang="ts">
    import { resolve } from '$app/paths';

    let {
        hackathonId,
        pages,
        hasProjects = false,
        hasTeams = false,
        current,
    }: {
        hackathonId: string;
        /** Published pages, already ordered by the backend. */
        pages: { id: string; title: string }[];
        hasProjects?: boolean;
        hasTeams?: boolean;
        /** `'overview'`, `'projects'`, `'teams'`, or the id of the page shown. */
        current: string;
    } = $props();

    // Nothing to navigate to but the page you are on is not navigation.
    const hasSomewhereToGo = $derived(pages.length > 0 || hasProjects || hasTeams);
</script>

<!--
  The way around a public hackathon: its landing page, what is being built, who
  is building it, and whatever the organisers wrote — Schedule, Rules, FAQ.

  A strip rather than a sidebar, because the (public) shell deliberately has none
  (`showNav={false}` in (public)/+layout.svelte) and every entry in the member
  rail points into /my/, which is exactly where a visitor cannot go.

  `.chip` is this theme's segmented-control vocabulary, the same one
  ParticipantsManageTabs uses, and `aria-current="page"` is the accessible form
  of "you are here" for a link.

  Fixed entries first, the organisers' pages last. Pages are added and removed at
  will, and Projects and Teams must not shuffle sideways when that happens — the
  same ordering rule `memberNav` follows.

  Projects and Teams draw only once they have something on them. Before teams
  form, a Teams tab leads to an empty page a visitor can do nothing about.

  Wraps rather than scrolls: a horizontally scrolling strip centred on the page
  clips its own first entry the moment it overflows, and page titles are the
  organiser's prose, of any length. Wrapping has no such edge.
-->
{#if hasSomewhereToGo}
    <nav
        class="flex flex-wrap justify-center gap-1 px-4 sm:px-10 md:px-20"
        aria-label="Hackathon"
    >
        <a
            href={resolve(`/hackathon/${hackathonId}`)}
            aria-current={current === 'overview' ? 'page' : undefined}
            class="chip no-underline {current === 'overview' ? 'chip-active' : ''}"
        >
            Overview
        </a>
        {#if hasProjects}
            <a
                href={resolve(`/hackathon/${hackathonId}/projects`)}
                aria-current={current === 'projects' ? 'page' : undefined}
                class="chip no-underline {current === 'projects' ? 'chip-active' : ''}"
            >
                Projects
            </a>
        {/if}
        {#if hasTeams}
            <a
                href={resolve(`/hackathon/${hackathonId}/teams`)}
                aria-current={current === 'teams' ? 'page' : undefined}
                class="chip no-underline {current === 'teams' ? 'chip-active' : ''}"
            >
                Teams
            </a>
        {/if}
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
