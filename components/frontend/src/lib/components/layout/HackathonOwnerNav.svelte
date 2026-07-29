<script lang="ts">
    import { resolve } from '$app/paths';
    import SidebarNavSection from './SidebarNavSection.svelte';
    import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard';
    import FileText from 'lucide-svelte/icons/file-text';
    import Route from 'lucide-svelte/icons/route';
    import Milestone from 'lucide-svelte/icons/milestone';

    let { slug, collapsed }: { slug: string; collapsed: boolean } = $props();

    const items = $derived([
        { label: 'Overview', icon: LayoutDashboard, href: resolve(`/owner/hackathon/${slug}`) },
        { label: 'Pages', icon: FileText, href: resolve(`/owner/hackathon/${slug}/pages`) },
        { label: 'Phases', icon: Milestone, href: resolve(`/owner/hackathon/${slug}/phases`) },
        { label: 'Tracks', icon: Route, href: resolve(`/owner/hackathon/${slug}/tracks`) },
    ]);
</script>

<SidebarNavSection label="Owner" {items} {collapsed} activeColor="secondary" />
