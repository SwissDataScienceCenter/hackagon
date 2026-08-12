<script lang="ts">
    // The app shell is a top bar and a footer: identity, theme and sign-out
    // above, the platform's own links below. Per-hackathon navigation is not
    // shell chrome — it belongs to one hackathon, so HackathonSidebar renders
    // inside my/hackathon/[id] instead of here, where it followed you onto the
    // dashboard and the admin routes it had nothing to say about.
    //
    // AppShell is shared with the (public) group. Before it, each group carried
    // its own copy of the same five lines and only (public)'s copy mounted
    // AppFooter, so the footer — the only inbound link to the Privacy, Terms
    // and About SitePages — was missing from every signed-in page.
    import AppShell from '$lib/components/layout/AppShell.svelte';
    import type { Snippet } from 'svelte';
    import type { LayoutData } from './$types';

    let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<AppShell session={data.session ?? null}>
    {@render children()}
</AppShell>
