<script lang="ts">
    import DashboardView from '$lib/components/dashboard/DashboardView.svelte';

    const { data } = $props();
</script>

<div class="mx-auto w-full max-w-7xl">
    <DashboardView session={data.session} myHackathons={data.myHackathons} otherHackathons={data.otherHackathons} />
</div>
