<script lang="ts">
    import DashboardView from '$lib/components/dashboard/DashboardView.svelte';

    const { data, form } = $props();
</script>

<div class="mx-auto w-full max-w-7xl">
    <!-- The role data all comes from (app)/+layout.server.ts, which reads it off
         the casbin roles WhoAmI already put on locals — no extra RPC here.
         `canCreate` takes either role because `hackathon:create` is granted to
         organizers outright and to admins through the escape hatch, so the pair
         mirrors the backend permission. `isGlobalAdmin` goes through on its own
         as well: the platform settings tiles need admin specifically, not either
         of the two. And `globalRoles` is the unreduced set, for the badges that
         only display. -->
    <DashboardView
        session={data.session}
        myHackathons={data.myHackathons}
        otherHackathons={data.otherHackathons}
        canCreate={data.isGlobalAdmin || data.isHackathonOrganizer}
        isGlobalAdmin={data.isGlobalAdmin}
        globalRoles={data.globalRoles}
        {form}
    />
</div>
