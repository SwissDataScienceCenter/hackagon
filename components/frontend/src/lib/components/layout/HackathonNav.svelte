<script lang="ts">
    import { page } from '$app/stores';
    import { resolve } from '$app/paths';
    import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard';
    import Users from 'lucide-svelte/icons/users';
    import Lightbulb from 'lucide-svelte/icons/lightbulb';
    import UsersRound from 'lucide-svelte/icons/users-round';
    import Send from 'lucide-svelte/icons/send';
    import CalendarClock from 'lucide-svelte/icons/calendar-clock';
    import Video from 'lucide-svelte/icons/video';
    import Image from 'lucide-svelte/icons/image';

    let { slug, collapsed }: { slug: string; collapsed: boolean } = $props();

    const tabs = [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'participants', label: 'Participants', icon: Users },
        { id: 'proposals', label: 'Proposals', icon: Lightbulb },
        { id: 'teams', label: 'Teams', icon: UsersRound },
        { id: 'submissions', label: 'Submissions', icon: Send },
        { id: 'timeline', label: 'Timeline', icon: CalendarClock },
        { id: 'webinars', label: 'Webinars', icon: Video },
        { id: 'photos', label: 'Photos', icon: Image },
    ];
</script>

<div class="flex flex-col gap-0.5 p-2">
    {#if !collapsed}
        <span class="px-2 pb-1 text-xs font-bold tracking-widest text-surface-500">Hackathon</span>
    {/if}
    {#each tabs as tab (tab.id)}
        {@const href = resolve(`/hackathon/${slug}/${tab.id}`)}
        {@const isActive =
            $page.url.pathname === href || $page.url.pathname.startsWith(href + '/')}
        {@const Icon = tab.icon}
        <a
            {href}
            title={collapsed ? tab.label : undefined}
            class="flex h-8 items-center gap-2 rounded-lg px-2 text-sm no-underline
                   transition-colors
                   {isActive
                ? 'bg-surface-100-900 font-medium text-primary-700-300'
                : 'text-surface-500 hover:text-surface-700-300'}
                   {collapsed ? 'justify-center' : ''}"
        >
            <Icon class="h-4 w-4 shrink-0" />
            {#if !collapsed}
                <span>{tab.label}</span>
            {/if}
        </a>
    {/each}
</div>
