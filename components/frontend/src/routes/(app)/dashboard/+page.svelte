<script lang="ts">
    import DashboardView from '$lib/components/dashboard/DashboardView.svelte';

    const { data } = $props();
</script>

<div class="mx-auto w-full max-w-7xl">
    <!-- The two role flags come from (app)/+layout.server.ts, which reads them off
         the casbin roles WhoAmI already put on locals — no extra RPC here. Same
         pair `homeNav` gates Create Hackathon on, since it is the same backend
         permission. -->
    <DashboardView
        session={data.session}
        myHackathons={data.myHackathons}
        otherHackathons={data.otherHackathons}
        canCreate={data.isGlobalAdmin || data.isHackathonOrganizer}
        isGlobalAdmin={data.isGlobalAdmin}
    />
</div>
