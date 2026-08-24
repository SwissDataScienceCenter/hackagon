<script lang="ts">
    import ProjectDetail from '$lib/components/hackathon/ProjectDetail.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!-- Thin by design: `ProjectDetail` is shared with the organiser's detail route
     under projects/manage, so the two cannot drift apart on how a project reads.
     All that differs is where "back" goes — and this route has two answers to
     that, resolved in the load rather than here. -->
<ProjectDetail
    project={data.project}
    backHref={data.backHref}
    backQuery={data.backQuery}
    backLabel={data.backLabel}
/>
