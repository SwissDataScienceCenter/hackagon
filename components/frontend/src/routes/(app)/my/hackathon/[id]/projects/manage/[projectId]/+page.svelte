<script lang="ts">
    import ProjectDetail from '$lib/components/hackathon/ProjectDetail.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();
</script>

<!-- Same component as the participant detail route, so a project reads
     identically to both audiences. Only the way back differs — to the queue this
     was opened from, where Approve and Revoke are. -->
<ProjectDetail
    project={data.project}
    backHref={`/my/hackathon/${data.hackathonId}/projects/manage`}
    backLabel="Back to Manage Projects"
/>
