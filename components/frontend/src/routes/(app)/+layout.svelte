<script lang="ts">
    // The app shell is intentionally identical to (public) for now. It exists as
    // its own layout so authenticated chrome (sidebar, hackathon switcher) can
    // land here later without touching the public marketing pages.
    import NavBar from '$lib/components/layout/NavBar.svelte';
    import AppFooter from '$lib/components/layout/AppFooter.svelte';

    const { children, data } = $props();
</script>

<!-- Nothing behind the sign-in belongs in a search index. Pages here still set
     their own <title>; this is the one thing they all share. -->
<svelte:head>
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="flex min-h-screen flex-col">
    <NavBar
        session={data.session ?? null}
        isAdmin={data.isAdmin}
        canCreateHackathon={data.canCreateHackathon}
    />
    <main class="flex-1">
        {@render children()}
    </main>
    <AppFooter />
</div>
