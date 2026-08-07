<script lang="ts">
    import NavBar from '$lib/components/layout/NavBar.svelte';
    import AppFooter from '$lib/components/layout/AppFooter.svelte';

    const { children, data } = $props();
</script>

<div class="flex min-h-screen flex-col">
    <NavBar session={data.session ?? null} showNav={false} />
    <main class="flex-1">
        {@render children()}
    </main>
    <AppFooter />
</div>
