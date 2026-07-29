<script lang="ts">
    import { resolve } from '$app/paths';
    import SidebarNavSection from './SidebarNavSection.svelte';
    import Users from 'lucide-svelte/icons/users';
    import FolderKanban from 'lucide-svelte/icons/folder-kanban';
    import UsersRound from 'lucide-svelte/icons/users-round';
    import Settings from 'lucide-svelte/icons/settings';

    let { collapsed }: { collapsed: boolean } = $props();

    const items = [
        { label: 'Users', icon: Users, href: resolve('/(app)/(admin)/users') },
        { label: 'Projects', icon: FolderKanban },
        { label: 'Teams', icon: UsersRound },
        { label: 'Settings', icon: Settings },
    ];
</script>

<SidebarNavSection label="Site Admin" {items} {collapsed} activeColor="tertiary" />
