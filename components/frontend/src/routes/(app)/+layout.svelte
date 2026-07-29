<script lang="ts">
    import AppSidebar from '$lib/components/layout/AppSidebar.svelte';
    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';

    let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<div class="flex min-h-screen flex-col md:flex-row">
    <AppSidebar myHackathons={data.myHackathons} />
    <main class="flex-1 overflow-y-auto">
        {@render children()}
    </main>
</div>
