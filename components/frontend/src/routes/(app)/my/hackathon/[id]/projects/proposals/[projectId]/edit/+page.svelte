<script lang="ts">
    import { resolve } from '$app/paths';
    import ProjectEditForm from '$lib/components/hackathon/ProjectEditForm.svelte';
    import { projectStatusLabel, projectStatusBadgeVariant } from '$lib/utils/projectStatus';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const statusText = $derived(projectStatusLabel(data.project.status));
    const statusVariant = $derived(
        projectStatusBadgeVariant(data.project.status) ?? 'badge-neutral'
    );

    // Unresolved: `ProjectEditForm` calls `resolve()` at its own anchor, and the
    // back link below resolves a literal inline — extracting a resolved string
    // would widen it past the route-literal type `resolve()` expects.
    const backHref = $derived(`/my/hackathon/${data.hackathonId}/projects/proposals`);
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <div class="flex flex-col gap-1">
        <a
            href={resolve(`/my/hackathon/${data.hackathonId}/projects/proposals`)}
            class="w-fit text-xs font-semibold text-accent-ink no-underline hover:underline"
        >
            &larr; Back to proposals
        </a>
        <div class="flex flex-wrap items-center gap-2">
            <h1 class="m-0 text-lg font-bold text-ink">Edit Proposal</h1>
            {#if statusText}
                <span
                    class="badge {statusVariant} text-[0.625rem] font-semibold uppercase"
                >
                    {statusText}
                </span>
            {/if}
        </div>
        <p class="m-0 text-xs text-ink-3">
            Changes apply immediately, whether or not the project has been approved.
        </p>
    </div>

    <ProjectEditForm
        project={data.project}
        tracks={data.tracks}
        cancelHref={backHref}
        message={form?.message}
    />
</div>
