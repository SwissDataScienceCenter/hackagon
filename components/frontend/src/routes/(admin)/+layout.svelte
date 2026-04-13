<script lang="ts">
    import LeftSidebar from '$lib/components/layout/HackathonSidebar.svelte';
    import RightSidebar from '$lib/components/layout/UserSidebar.svelte';
    import '../../app.css';

    const { children, data } = $props();
    const session = data?.session;
</script>

<div class="grid grid-cols-[240px_minmax(0,1fr)_280px]">
    <LeftSidebar />
    <main class="overflow-y-auto">
        {@render children()}
    </main>
    <RightSidebar {session} />
</div>
