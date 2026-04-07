<script lang="ts">
    import AppHeader from '$lib/components/layout/AppHeader.svelte';
    import LeftSidebar from '$lib/components/layout/HackathonSidebar.svelte';
    import RightSidebar from '$lib/components/layout/UserSidebar.svelte';
    import AppFooter from '$lib/components/layout/AppFooter.svelte';
    import '../app.css';

    const { children, data } = $props();
    const session = data?.session;
</script>

<div class="grid grid-rows-[auto_1fr_auto] min-h-screen">
    <AppHeader {session} />
    <div class="grid grid-cols-[240px_minmax(0,1fr)_280px]">
        <LeftSidebar />
        <main class="overflow-y-auto">
            {@render children()}
        </main>
        <RightSidebar {session} />
    </div>
    <AppFooter />
</div>
