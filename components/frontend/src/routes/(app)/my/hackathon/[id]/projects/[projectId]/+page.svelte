<script lang="ts">
    import ProjectDetail from '$lib/components/hackathon/ProjectDetail.svelte';
    import ProjectReviewNotes from '$lib/components/hackathon/ProjectReviewNotes.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!-- Thin by design: `ProjectDetail` is shared with the organiser's detail route
     under projects/manage, so the two cannot drift apart on how a project reads.
     All that differs is where "back" goes — and this route has two answers to
     that, resolved in the load rather than here — and that the organiser's route
     also carries the Reject form. The review notes are the same component there,
     so a proposer reads exactly what the organiser wrote. -->
<ProjectDetail
    project={data.project}
    backHref={data.backHref}
    backQuery={data.backQuery}
    backLabel={data.backLabel}
>
    {#if data.reviewNotes.length > 0}
        <ProjectReviewNotes notes={data.reviewNotes} />
    {/if}
</ProjectDetail>
