<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import ProjectCard from '$lib/components/hackathon/ProjectCard.svelte';
    import SubmissionContent from '$lib/components/hackathon/SubmissionContent.svelte';
    import TeamCard from '$lib/components/hackathon/TeamCard.svelte';
    import type { Snippet } from 'svelte';

    /**
     * One team's submission, read in full — the way everyone sees it. Laid out
     * like the team's page: a heading, then sections, each the way that thing
     * is drawn elsewhere, so nothing here has a look of its own.
     *
     * No page shell and no back link: the submission's own page wraps it in
     * both, and a page showing the viewer's own entry can use it as it is.
     * Presentation only — a caller that offers Edit passes it in `actions`.
     */
    let {
        projectTitle,
        teamName,
        entry,
        team,
        project,
        actions,
    }: {
        projectTitle: string;
        teamName: string;
        /** Plain fields, not the server's `SubmissionEntry`: that type lives
            behind $lib/server. Null until the team saves something. */
        entry: {
            repositoryUrl?: string;
            attachmentFolderUrl?: string;
            /** Markdown, as the team typed it. */
            description?: string;
            updatedAt?: Date;
            updatedBy?: string;
        } | null;
        /** The team as the teams list draws it. `href` is an unresolved route
            path, resolved at the anchor below; members' hrefs come resolved,
            as `TeamMembers` takes them. */
        team: {
            href: string;
            imageUrl?: string;
            members: { name: string; href?: string }[];
        };
        /** The project as the projects list draws it. Absent when its own page
            would refuse the reader — the section is then left out. */
        project?: {
            /** Unresolved; ProjectCard resolves it. */
            href: string;
            excerpt?: string;
            creator: string | undefined;
            track?: string;
            imageUrl?: string;
        };
        /** Controls under the heading, e.g. Edit on the viewer's own team. */
        actions?: Snippet;
    } = $props();

    function formatDate(d: Date | undefined): string {
        if (!d) return '';
        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }

    // Built as one string: Svelte trims the whitespace that opens an `{#if}`
    // block, which glued "by" to the time ("11:22 AMby").
    const status = $derived(
        entry
            ? `Last updated ${formatDate(entry.updatedAt)}${entry.updatedBy ? ` by ${entry.updatedBy}` : ''}`
            : 'Not submitted yet'
    );
</script>

<div class="flex w-full flex-col gap-6">
    <!-- The project is the heading, as on the list's card; the team that
         handed it in is the first thing under it, since one project can have
         several teams. -->
    <div class="flex flex-col items-start gap-3">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-title text-ink">{projectTitle}</h2>
            <span class="text-xs text-ink-3">{teamName} &middot; {status}</span>
        </div>
        {#if actions}
            <div class="flex items-center gap-2">
                {@render actions()}
            </div>
        {/if}
    </div>

    {#if entry}
        <section class="flex flex-col gap-2">
            <h3 class="meta m-0">Description</h3>
            {#if entry.description}
                <!-- Rendered, not truncated: the list shows an excerpt, and
                     this is where the entry is read in full. -->
                <div class="text-xs leading-relaxed text-ink-2">
                    <MarkdownContent content={entry.description} />
                </div>
            {:else}
                <p class="m-0 text-xs text-ink-3">No description was given.</p>
            {/if}
        </section>

        <!-- Through SubmissionContent, so this page makes the same call about
             which links to linkify as every other page showing an entry. -->
        {#if entry.repositoryUrl || entry.attachmentFolderUrl}
            <section class="flex flex-col gap-2">
                <h3 class="meta m-0">Links</h3>
                <SubmissionContent
                    repositoryUrl={entry.repositoryUrl}
                    attachmentFolderUrl={entry.attachmentFolderUrl}
                />
            </section>
        {/if}
    {/if}

    <section class="flex flex-col gap-2">
        <h3 class="meta m-0">Team</h3>
        <!-- The teams list's own card. No project line: the project has its
             own section below, so the card only borrows its title for the
             initials. -->
        <TeamCard
            title={teamName}
            {projectTitle}
            imageUrl={team.imageUrl}
            members={team.members}
        >
            {#snippet actions()}
                <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
                <a href={resolve(team.href as any)} class="btn btn-sm btn-ghost no-underline">
                    View
                </a>
            {/snippet}
        </TeamCard>
    </section>

    {#if project}
        <section class="flex flex-col gap-2">
            <h3 class="meta m-0">Project</h3>
            <ProjectCard
                title={projectTitle}
                excerpt={project.excerpt}
                creator={project.creator}
                track={project.track}
                imageUrl={project.imageUrl}
                moreInfoHref={project.href}
            />
        </section>
    {/if}
</div>
