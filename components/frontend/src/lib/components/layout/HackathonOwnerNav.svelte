<script lang="ts">
    import { resolve } from '$app/paths';
    import SidebarNavSection from './SidebarNavSection.svelte';
    import ShieldCheck from 'lucide-svelte/icons/shield-check';

    let { slug, collapsed }: { slug: string; collapsed: boolean } = $props();

    const items = $derived([
        { label: 'Dashboard', icon: ShieldCheck, href: resolve(`/owner/hackathon/${slug}`) },
    ]);
</script>

<SidebarNavSection label="Owner tools" {items} {collapsed} activeColor="secondary" />
