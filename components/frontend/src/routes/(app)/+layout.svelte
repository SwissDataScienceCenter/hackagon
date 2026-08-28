<script lang="ts">
    // The app shell is a top bar and nothing else: identity, theme and sign-out.
    // Per-hackathon navigation is not shell chrome — it belongs to one hackathon,
    // so HackathonSidebar renders inside my/hackathon/[id] instead of here, where
    // it followed you onto the dashboard and the admin routes it had nothing to
    // say about.
    import NavBar from '$lib/components/layout/NavBar.svelte';
    import AppFooter from '$lib/components/layout/AppFooter.svelte';
    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';

    let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<div class="flex min-h-screen flex-col">
    <NavBar session={data.session ?? null} sessionExpired={data.sessionExpired ?? false} />
    <main class="flex-1">
        {@render children()}
    </main>
    <!-- The app shell had no footer, so a signed-in user — the one most likely
         to be reporting a bug — could not see which build they were on. It
         carries the version and nothing else the shell does not already say. -->
    <AppFooter buildCommit={data.buildCommit ?? null} />
</div>
