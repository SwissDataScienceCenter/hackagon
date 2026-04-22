<script lang="ts">
    import DashboardView from '$lib/components/dashboard/DashboardView.svelte';

    const { data } = $props();
</script>

<DashboardView session={data.session} />
