<script lang="ts">
    // The app shell is a top bar and nothing else: identity, theme and sign-out.
    // Per-hackathon navigation is not shell chrome — it belongs to one hackathon,
    // so HackathonSidebar renders inside my/hackathon/[id] instead of here, where
    // it followed you onto the dashboard and the admin routes it had nothing to
    // say about.
    import NavBar from '$lib/components/layout/NavBar.svelte';
    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';

    let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<div class="flex min-h-screen flex-col">
    <NavBar session={data.session ?? null} />
    <main class="flex-1">
        {@render children()}
    </main>
</div>
