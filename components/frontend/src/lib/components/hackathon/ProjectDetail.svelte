<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { projectStatusLabel, projectStatusBadgeVariant } from '$lib/utils/projectStatus';

    /**
     * One project, read in full. Presentation only: there is deliberately no
     * action here, not even a snippet for one — approving, revoking, preferring
     * and editing all live on the list pages, so a project has exactly one place
     * each of those can be done from. This page is what you open to read the
     * proposal before going back and deciding.
     *
     * Shared by the participant detail route and the organiser's under
     * `projects/manage`, which differ only in what they let you reach and where
     * "back" goes — so the two cannot drift apart on how a project reads.
     */
    let {
        project,
        backHref,
        backLabel
    }: {
        project: {
            title: string;
            description: string;
            /** ProjectStatus enum value; labelled via $lib/utils/projectStatus. */
            status: number;
            imageUrl?: string;
            track?: string;
            proposer?: string;
            createdAt?: Date;
            modifiedAt?: Date;
        };
        /** Unresolved route path — `resolve()` is called at the anchor below,
            same as PhaseForm's `cancelHref`. */
        backHref: string;
        backLabel: string;
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
    <a href={resolve(backHref as any)} class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline">
        &larr; {backLabel}
    </a>

    <!-- Identity block: same size-16 round media and text scale as ProjectCard,
         so arriving here from a row reads as the same project enlarged. -->
    <div class="flex items-start gap-4">
        {#if project.imageUrl}
            <div
                class="relative size-16 shrink-0 overflow-hidden rounded-full border-2
                       border-line bg-raised"
            >
                <img
                    src={project.imageUrl}
                    alt=""
                    class="absolute inset-0 block h-full w-full object-cover object-center"
                />
            </div>
        {:else}
            <div
                class="flex size-16 shrink-0 items-center justify-center rounded-full border-2
                       border-line bg-overlay text-xs font-bold
                       text-ink"
            >
                {initials}
            </div>
        {/if}

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
         find out exactly these things. Status joins them only while there is a
         status worth naming — see $lib/utils/projectStatus. An approved project
         drops the cell rather than printing "Approved" or, worse, "Unknown". -->
    <dl class="m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {#if statusText}
            <div class="flex flex-col gap-1">
                <dt class="text-xs font-semibold text-ink-3">Status</dt>
                <dd class="m-0 text-xs text-ink">
                    {statusText}
                </dd>
            </div>
        {/if}
        <div class="flex flex-col gap-1">
            <dt class="text-xs font-semibold text-ink-3">Track</dt>
            <dd class="m-0 text-xs text-ink">
                {project.track ?? 'No track'}
            </dd>
        </div>
    </dl>

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
</div>
