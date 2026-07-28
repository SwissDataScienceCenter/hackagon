<script lang="ts">
    import AdminSubNav from '$lib/components/admin/AdminSubNav.svelte';

    const { children } = $props();

    const tabs = [
        { id: 'home', label: 'Home', href: '/(participant)/dashboard' },
        { id: 'projects', label: 'Administrate Projects' },
        { id: 'users', label: 'Administrate Users', href: '/(admin)/users' },
        { id: 'teams', label: 'Administrate Teams' },
        { id: 'settings', label: 'General Settings' },
    ];
</script>

<AdminSubNav {tabs} />

<main class="mx-auto w-full max-w-7xl overflow-y-auto">
    {@render children()}
</main>
