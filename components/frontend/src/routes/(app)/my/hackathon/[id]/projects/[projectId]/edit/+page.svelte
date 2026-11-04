<script lang="ts">
    import ProjectEditForm from '$lib/components/hackathon/ProjectEditForm.svelte';
    import PageHeader from '$lib/components/layout/PageHeader.svelte';
    import { projectStatusLabel, projectStatusBadgeVariant } from '$lib/utils/projectStatus';
    import type { ActionData, PageData } from './$types';

    let { data, form }: { data: PageData; form: ActionData } = $props();

    const statusText = $derived(projectStatusLabel(data.project.status));
    const statusVariant = $derived(
        projectStatusBadgeVariant(data.project.status) ?? 'badge-neutral'
    );

    // The project itself, which is also where saving returns to. Unresolved:
    // `ProjectEditForm` and `PageHeader` call `resolve()` at their own anchors.
    const backHref = $derived(
        `/my/hackathon/${data.hackathonId}/projects/${data.project.id}`
    );
</script>

<div class="flex w-full flex-col gap-6 px-4 py-8 sm:px-10 md:px-20">
    <PageHeader title="Edit Project" back={{ href: backHref, label: data.project.title }}>
        {#snippet meta()}
            {#if statusText}
                <span class="badge {statusVariant} w-fit">{statusText}</span>
            {/if}
            <p class="m-0">
                Changes apply immediately, whether or not the project has been approved.
            </p>
        {/snippet}
    </PageHeader>

    <ProjectEditForm
        project={data.project}
        tracks={data.tracks}
        cancelHref={backHref}
        message={form?.message}
    />
</div>
