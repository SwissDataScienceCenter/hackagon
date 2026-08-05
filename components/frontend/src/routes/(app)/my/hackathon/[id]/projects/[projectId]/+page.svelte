<script lang="ts">
    import ProjectDetail from '$lib/components/hackathon/ProjectDetail.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!-- Thin by design: `ProjectDetail` is shared with the organiser's detail route
     under projects/manage, so the two cannot drift apart on how a project reads.
     All that differs is where "back" goes. -->
<ProjectDetail
    project={data.project}
    backHref={`/my/hackathon/${data.hackathonId}/projects`}
    backLabel="Back to projects"
/>
