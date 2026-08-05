<script lang="ts">
    // The app shell is intentionally identical to (public) for now. It exists as
    // its own layout so authenticated chrome (sidebar, hackathon switcher) can
    // land here later without touching the public marketing pages.
    import NavBar from '$lib/components/layout/NavBar.svelte';
    import AppFooter from '$lib/components/layout/AppFooter.svelte';

    const { children, data } = $props();
</script>

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
