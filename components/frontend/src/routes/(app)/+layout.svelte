<script lang="ts">
    import AppSidebar from '$lib/components/layout/AppSidebar.svelte';
    import type { Snippet } from 'svelte';

    let { children }: { children: Snippet } = $props();
</script>

<div class="flex min-h-screen flex-col md:flex-row">
    <AppSidebar />
    <main class="flex-1 overflow-y-auto">
        {@render children()}
    </main>
</div>
