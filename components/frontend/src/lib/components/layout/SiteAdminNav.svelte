<script lang="ts">
    import { resolve } from '$app/paths';
    import SidebarNavSection from './SidebarNavSection.svelte';
    import Users from 'lucide-svelte/icons/users';
    import CalendarDays from 'lucide-svelte/icons/calendar-days';
    import Plus from 'lucide-svelte/icons/plus';

    let { collapsed }: { collapsed: boolean } = $props();

    const items = [
        { label: 'Users', icon: Users, href: resolve('/(app)/(admin)/users') },
        { label: 'All Hackathons', icon: CalendarDays, href: resolve('/(app)/(admin)/hackathons') },
        {
            label: 'Create Hackathon',
            icon: Plus,
            href: resolve('/(app)/(admin)/hackathons/new'),
        },
    ];
</script>

<SidebarNavSection label="Site Admin" {items} {collapsed} activeColor="tertiary" />
