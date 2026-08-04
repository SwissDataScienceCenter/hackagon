<script lang="ts">
    import { resolve } from '$app/paths';
    import MarkdownContent from '$lib/components/forms/MarkdownContent.svelte';
    import { projectStatusLabel, projectStatusBadgePreset } from '$lib/utils/projectStatus';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const statusText = $derived(projectStatusLabel(data.project.status));
    const statusPreset = $derived(
        projectStatusBadgePreset(data.project.status) ?? 'preset-tonal-surface'
    );

    function on(d: Date | undefined): string | undefined {
        if (!d) return undefined;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Stands in for the image the project has none of — same treatment as
    // ProjectCard, so a row and this header show the same two letters.
    const initials = $derived(
        data.project.title
            .split(' ')
            .filter(Boolean)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    );

    const proposedOn = $derived(on(data.project.createdAt));
    // Only worth a line when it says something the proposed date does not.
    const editedOn = $derived.by(() => {
        const edited = on(data.project.modifiedAt);
        return edited && edited !== proposedOn ? edited : undefined;
    });
</script>

<!--
  Page shell: px-4 py-8 sm:px-10 md:px-20 (matches projects/participants/teams).
-->
<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <a
        href={resolve(`/my/hackathon/${data.hackathonId}/projects`)}
        class="w-fit text-xs font-semibold text-primary-700-300 no-underline hover:underline"
    >
        &larr; Back to projects
    </a>

    <!-- Identity block: same size-16 round media and text scale as ProjectCard,
         so arriving here from a row reads as the same project enlarged. -->
    <div class="flex items-start gap-4">
        {#if data.project.imageUrl}
            <div
                class="relative size-16 shrink-0 overflow-hidden rounded-full border-2
                       border-surface-200-800 bg-surface-100-900"
            >
                <img
                    src={data.project.imageUrl}
                    alt=""
                    class="absolute inset-0 block h-full w-full object-cover object-center"
                />
            </div>
        {:else}
            <div
                class="flex size-16 shrink-0 items-center justify-center rounded-full border-2
                       border-surface-200-800 bg-surface-200-800 text-xs font-bold
                       text-surface-950-50"
            >
                {initials}
            </div>
        {/if}

        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex flex-wrap items-center gap-2">
                <h1 class="m-0 text-lg font-bold leading-snug text-surface-950-50">
                    {data.project.title}
                </h1>
                {#if statusText}
                    <span
                        class="badge {statusPreset} shrink-0 rounded-none text-[0.625rem]
                               font-semibold uppercase"
                    >
                        {statusText}
                    </span>
                {/if}
            </div>
            <p class="m-0 text-xs leading-snug text-surface-500">
                {#if data.project.proposer}Proposed by {data.project.proposer}{/if}
                {#if data.project.proposer && proposedOn}&middot;{/if}
                {#if proposedOn}{proposedOn}{/if}
                {#if editedOn}&middot; edited {editedOn}{/if}
            </p>
        </div>
    </div>

    {#if form?.message}
        <p class="m-0 text-xs text-error-500" role="alert">{form.message}</p>
    {/if}

    <!-- Track and status as a labelled pair rather than more chips: this is the
         page someone opens to find out exactly these two things. -->
    <dl class="m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="flex flex-col gap-1">
            <dt class="text-xs font-semibold text-surface-500">Status</dt>
            <dd class="m-0 text-xs text-surface-950-50">
                {statusText ?? 'Unknown'}
            </dd>
        </div>
        <div class="flex flex-col gap-1">
            <dt class="text-xs font-semibold text-surface-500">Track</dt>
            <dd class="m-0 text-xs text-surface-950-50">
                {data.project.track ?? 'No track'}
            </dd>
        </div>
    </dl>

    <div class="flex flex-col gap-1">
        <h2 class="m-0 text-xs font-semibold uppercase text-surface-500">Description</h2>
        {#if data.project.description}
            <!-- Rendered, not truncated: the proposal is written in the markdown
                 editor on the edit form, and this is the one place it is read in
                 full before a decision. -->
            <div class="text-xs leading-relaxed text-surface-600-400">
                <MarkdownContent content={data.project.description} />
            </div>
        {:else}
            <p class="m-0 text-xs text-surface-500">No description was given.</p>
        {/if}
    </div>

    {#if data.mayApprove || data.mayRevoke || data.mayEdit || data.mayPrefer}
        <div class="flex flex-wrap items-center gap-2 border-t border-surface-200-800 pt-6">
            {#if data.mayApprove}
                <!-- A plain form post, like every other write on this site:
                     `load` re-runs afterwards, so the badge above turns Approved
                     and this button is replaced by its undo.

                     No reject button: see the TODO in +page.server.ts. -->
                <form method="POST" action="?/approve">
                    <button type="submit" class="btn btn-sm preset-filled-primary-500">
                        Approve project
                    </button>
                </form>
            {/if}
            {#if data.mayRevoke}
                <!-- Not "Reject": Disapprove returns the project to the queue
                     rather than turning it down. See the TODO in
                     +page.server.ts. -->
                <form method="POST" action="?/disapprove">
                    <button type="submit" class="btn btn-sm preset-tonal-warning">
                        Revoke approval
                    </button>
                </form>
            {/if}
            {#if data.mayPrefer}
                <!-- One-way: see the TODO in +page.server.ts. The confirmation
                     lasts until the next load, because no read path exists to
                     render it from. -->
                {#if form?.preferred}
                    <span class="text-xs font-semibold text-success-700-300">
                        Marked as preferred
                    </span>
                {:else}
                    <form method="POST" action="?/prefer">
                        <button type="submit" class="btn btn-sm preset-tonal-primary">
                            Mark as preferred
                        </button>
                    </form>
                {/if}
            {/if}
            {#if data.mayEdit}
                <a
                    href={resolve(
                        `/my/hackathon/${data.hackathonId}/projects/${data.project.id}/edit`
                    )}
                    class="btn btn-sm preset-tonal-surface no-underline"
                >
                    Edit
                </a>
            {/if}
        </div>
    {/if}
</div>
