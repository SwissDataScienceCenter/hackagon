<script lang="ts">
    import { resolve } from '$app/paths';
    import SidebarNavSection from './SidebarNavSection.svelte';
    import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard';

    let { slug, collapsed }: { slug: string; collapsed: boolean } = $props();

    const items = $derived([
        { label: 'Overview', icon: LayoutDashboard, href: resolve(`/owner/hackathon/${slug}`) },
    ]);
</script>

<SidebarNavSection label="Owner" {items} {collapsed} activeColor="secondary" />
