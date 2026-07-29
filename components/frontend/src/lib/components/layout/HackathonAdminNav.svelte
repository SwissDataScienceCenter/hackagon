<script lang="ts">
    import { resolve } from '$app/paths';
    import SidebarNavSection from './SidebarNavSection.svelte';
    import ShieldCheck from 'lucide-svelte/icons/shield-check';

    let { slug, collapsed }: { slug: string; collapsed: boolean } = $props();

    const items = $derived([
        { label: 'Hackathon admin', icon: ShieldCheck, href: resolve(`/admin/hackathon/${slug}`) },
    ]);
</script>

<SidebarNavSection label="Manage this hackathon" {items} {collapsed} activeColor="secondary" />
