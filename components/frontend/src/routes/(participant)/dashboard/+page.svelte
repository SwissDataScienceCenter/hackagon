<script lang="ts">
    import DashboardView from '$lib/components/dashboard/DashboardView.svelte';

    const { data } = $props();
</script>

<div class="mx-auto w-full max-w-7xl">
    <DashboardView session={data.session} hackathons={data.hackathons} myHackathons={data.myHackathons} />
</div>
