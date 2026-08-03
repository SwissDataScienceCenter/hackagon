<script lang="ts">
    // No header/footer in the app shell — authenticated chrome (sidebar,
    // hackathon nav) lands in the left column instead. On mobile AppSidebar
    // brings its own header bar, since there is no NavBar here to hang a menu
    // button off.
    import AppSidebar from '$lib/components/layout/AppSidebar.svelte';
    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';

    let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<div class="flex min-h-screen flex-col md:flex-row">
    <AppSidebar
        myHackathons={data.myHackathons}
        isGlobalAdmin={data.isGlobalAdmin}
        isHackathonOrganizer={data.isHackathonOrganizer}
        session={data.session ?? null}
    />
    <main class="flex-1 overflow-y-auto">
        {@render children()}
    </main>
</div>
