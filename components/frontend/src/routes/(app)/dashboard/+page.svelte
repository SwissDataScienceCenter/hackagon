<script lang="ts">
    import DashboardView from '$lib/components/dashboard/DashboardView.svelte';

    const { data, form } = $props();

    // The Join action's verdict as one sentence. A join that queued on a full
    // event SUCCEEDED — the row's badge says "Waitlisted", this says where in
    // the queue, and a confirmed place is told outright.
    const joinNotice = $derived(
        form?.joined
            ? form.waitlisted
                ? `You're on the waiting list — number ${form.queuePosition} in the queue.`
                : "You're in — your place is confirmed."
            : ''
    );
</script>

<div class="mx-auto w-full max-w-7xl">
    <!-- The role data all comes from (app)/+layout.server.ts, which reads it off
         the casbin roles WhoAmI already put on locals — no extra RPC here. Same
         pair `homeNav` gates Create Hackathon on, since it is the same backend
         permission. `isGlobalAdmin` goes through on its own as well: the platform
         settings tiles need admin specifically, not either of the two. And
         `globalRoles` is the unreduced set, for the badges that only display. -->
    <DashboardView
        session={data.session}
        myHackathons={data.myHackathons}
        otherHackathons={data.otherHackathons}
        canCreate={data.isGlobalAdmin || data.isHackathonOrganizer}
        isGlobalAdmin={data.isGlobalAdmin}
        globalRoles={data.globalRoles}
        joinError={form?.message ?? ''}
        {joinNotice}
    />
</div>
