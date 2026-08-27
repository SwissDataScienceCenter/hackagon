<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import RoundMedia from '$lib/components/hackathon/RoundMedia.svelte';
    import { projectStatusLabel, projectStatusBadgeVariant } from '$lib/utils/projectStatus';
    import type { Snippet } from 'svelte';

    /**
     * One project, read in full. Presentation only: this component renders no
     * action of its own — approving, revoking, reconsidering, preferring and
     * editing all live on the list pages, so a project has exactly one place
     * each of those can be done from.
     *
     * It does own the page shell, though, so anything a route wants to put
     * *inside* that shell has to come through it. That is what `children` is
     * for, and it is how the two callers add what only they have: the review
     * notes on a rejected project, and — on the organiser's route alone — the
     * one action that could not live on a list, rejecting with a reason. A
     * textarea does not fit a card's action strip, and a reason is written after
     * reading the proposal, which is here.
     *
     * Shared by the participant detail route and the organiser's under
     * `projects/manage`, which differ only in what they let you reach and where
     * "back" goes — so the two cannot drift apart on how a project reads.
     */
    let {
        project,
        backHref,
        backQuery = '',
        backLabel,
        children
    }: {
        project: {
            title: string;
            description: string;
            /** ProjectStatus enum value; labelled via $lib/utils/projectStatus. */
            status: number;
            imageUrl?: string;
            /** Omitted when the project has no track, or the hackathon has none
                at all — the Track cell is then not drawn. */
            track?: string;
            proposer?: string;
            createdAt?: Date;
            modifiedAt?: Date;
        };
        /** Unresolved route path — `resolve()` is called at the anchor below,
            same as PhaseForm's `cancelHref`. Path only: a query string belongs
            in `backQuery`, since `resolve()` takes a route and not a URL. */
        backHref: string;
        /** Query string for `backHref`, leading `?` included, appended after it
            is resolved. The participant route uses it to hand a team page back
            the origin it was opened with; the organiser's route needs none. */
        backQuery?: string;
        backLabel: string;
        /** Extra sections, rendered last inside this component's page shell so
            they pick up its padding instead of hanging off the bottom of it. */
        children?: Snippet;
    } = $props();

    const statusText = $derived(projectStatusLabel(project.status));
    const statusVariant = $derived(
        projectStatusBadgeVariant(project.status) ?? 'badge-neutral'
    );

    function on(d: Date | undefined): string | undefined {
        if (!d) return undefined;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Stands in for the image the project has none of — same treatment as
    // ProjectCard, so a row and this header show the same two letters.
    const initials = $derived(
        project.title
            .split(' ')
            .filter(Boolean)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    );

    const proposedOn = $derived(on(project.createdAt));
    // Only worth a line when it says something the proposed date does not.
    const editedOn = $derived.by(() => {
        const edited = on(project.modifiedAt);
        return edited && edited !== proposedOn ? edited : undefined;
    });
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches projects/participants/teams).
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic path from page data; resolve() is route-literal typed -->
    <a href="{resolve(backHref as any)}{backQuery}" class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline">
        &larr; {backLabel}
    </a>

    <!-- Identity block: same size-16 round media and text scale as ProjectCard,
         so arriving here from a row reads as the same project enlarged. -->
    <div class="flex items-start gap-4">
        <RoundMedia src={project.imageUrl} {initials} />

        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex flex-wrap items-center gap-2">
                <h1 class="m-0 text-title leading-snug text-ink">
                    {project.title}
                </h1>
                {#if statusText}
                    <span class="badge {statusVariant} shrink-0">
                        {statusText}
                    </span>
                {/if}
            </div>
            <p class="m-0 text-xs leading-snug text-ink-3">
                {#if project.proposer}Proposed by {project.proposer}{/if}
                {#if project.proposer && proposedOn}&middot;{/if}
                {#if proposedOn}{proposedOn}{/if}
                {#if editedOn}&middot; edited {editedOn}{/if}
            </p>
        </div>
    </div>

    <!-- Labelled pairs rather than more chips: this is the page someone opens to
         find out exactly these things. Each cell appears only while it has
         something to say. Status: only while there is a status worth naming —
         see $lib/utils/projectStatus — so an approved project drops the cell
         rather than printing "Approved" or, worse, "Unknown". Track: only while
         the project has one. Tracks are optional and a hackathon may define
         none, so "No track" was a label stating the absence of a feature that
         hackathon never had. With neither cell the list itself goes. -->
    {#if statusText || project.track}
        <dl class="m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {#if statusText}
                <div class="flex flex-col gap-1">
                    <dt class="text-xs font-semibold text-ink-3">Status</dt>
                    <dd class="m-0 text-xs text-ink">
                        {statusText}
                    </dd>
                </div>
            {/if}
            {#if project.track}
                <div class="flex flex-col gap-1">
                    <dt class="text-xs font-semibold text-ink-3">Track</dt>
                    <dd class="m-0 text-xs text-ink">
                        {project.track}
                    </dd>
                </div>
            {/if}
        </dl>
    {/if}

    <div class="flex flex-col gap-1">
        <h2 class="m-0 meta">Description</h2>
        {#if project.description}
            <!-- Rendered, not truncated: the proposal is written in the markdown
                 editor on the edit form, and this is where it is read in full
                 before a decision. -->
            <div class="text-xs leading-relaxed text-ink-2">
                <MarkdownContent content={project.description} />
            </div>
        {:else}
            <p class="m-0 text-xs text-ink-3">No description was given.</p>
        {/if}
    </div>

    {@render children?.()}
</div>
