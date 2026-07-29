<script lang="ts">
    import { resolve } from '$app/paths';
    import SidebarNavSection from './SidebarNavSection.svelte';
    import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard';
    import Users from 'lucide-svelte/icons/users';
    import Lightbulb from 'lucide-svelte/icons/lightbulb';
    import UsersRound from 'lucide-svelte/icons/users-round';
    import Send from 'lucide-svelte/icons/send';
    import CalendarClock from 'lucide-svelte/icons/calendar-clock';
    import Video from 'lucide-svelte/icons/video';
    import Image from 'lucide-svelte/icons/image';

    let { slug, collapsed }: { slug: string; collapsed: boolean } = $props();

    const items = $derived([
        { label: 'Overview', icon: LayoutDashboard, href: resolve(`/hackathon/${slug}/overview`) },
        { label: 'Participants', icon: Users, href: resolve(`/hackathon/${slug}/participants`) },
        { label: 'Proposals', icon: Lightbulb, href: resolve(`/hackathon/${slug}/proposals`) },
        { label: 'Teams', icon: UsersRound, href: resolve(`/hackathon/${slug}/teams`) },
        { label: 'Submissions', icon: Send, href: resolve(`/hackathon/${slug}/submissions`) },
        { label: 'Timeline', icon: CalendarClock, href: resolve(`/hackathon/${slug}/timeline`) },
        { label: 'Webinars', icon: Video, href: resolve(`/hackathon/${slug}/webinars`) },
        { label: 'Photos', icon: Image, href: resolve(`/hackathon/${slug}/photos`) },
    ]);
</script>

<SidebarNavSection label="Hackathon" {items} {collapsed} activeColor="primary" />
