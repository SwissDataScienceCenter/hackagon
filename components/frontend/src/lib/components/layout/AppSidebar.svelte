<script lang="ts">
    import { page } from '$app/stores';
    import { resolve } from '$app/paths';
    import Menu from 'lucide-svelte/icons/menu';
    import X from 'lucide-svelte/icons/x';
    import PanelLeftClose from 'lucide-svelte/icons/panel-left-close';
    import PanelLeftOpen from 'lucide-svelte/icons/panel-left-open';
    import HackathonSwitcher from './HackathonSwitcher.svelte';
    import HackathonNav from './HackathonNav.svelte';
    import HackathonAdminNav from './HackathonAdminNav.svelte';
    import SiteAdminNav from './SiteAdminNav.svelte';
    import SidebarUserFooter from './SidebarUserFooter.svelte';
    import { isOwnerRole } from '$lib/utils/hackathonStatus';
    import type { Session } from '@auth/sveltekit';

    interface HackathonMember {
        role: number;
        isWaiting: boolean;
    }

    interface HackathonEntry {
        id: string;
        name: string;
        viewerMembership?: HackathonMember;
    }

    let {
        myHackathons,
        isGlobalAdmin,
        session,
    }: {
        myHackathons: HackathonEntry[];
        isGlobalAdmin: boolean;
        session: Omit<Session, 'accessToken'> | null;
    } = $props();

    let collapsed = $state(false);
    let mobileOpen = $state(false);
    let isDesktop = $state(true);

    // `collapsed` is a desktop-only preference (persisted below); on a narrow
    // viewport the drawer must always render fully expanded regardless of it.
    const effectiveCollapsed = $derived(collapsed && isDesktop);
    const activeSlug = $derived($page.params.slug);
    const activeHackathon = $derived(myHackathons.find((h) => h.id === activeSlug));
    const canManageActiveHackathon = $derived(
        Boolean(activeSlug) &&
            (isGlobalAdmin || isOwnerRole(activeHackathon?.viewerMembership?.role ?? 0)),
    );

    $effect(() => {
        if (typeof localStorage === 'undefined') return;
        collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    });

    $effect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(min-width: 768px)');
        isDesktop = mq.matches;
        const handler = (e: MediaQueryListEvent) => {
            isDesktop = e.matches;
        };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    });

    $effect(() => {
        $page.url.pathname;
        mobileOpen = false;
    });

    // Lock background scroll while the mobile drawer is open — it's an
    // overlay, not part of the page flow.
    $effect(() => {
        if (typeof document === 'undefined') return;
        document.body.style.overflow = mobileOpen ? 'hidden' : '';
        return () => {
            document.body.style.overflow = '';
        };
    });

    function toggleCollapsed() {
        collapsed = !collapsed;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('sidebar-collapsed', String(collapsed));
        }
    }
</script>

<div
    class="flex h-14 items-center gap-3 border-b border-surface-200-800 bg-surface-50-950 px-4
           md:hidden"
>
    <button
        onclick={() => (mobileOpen = true)}
        aria-label="Open navigation"
        class="btn-icon btn-sm"
    >
        <Menu class="h-5 w-5" />
    </button>
    <a href={resolve('/(app)/(participant)/dashboard')} class="flex items-center gap-2 no-underline">
        <img src="/logos/sdsc_white.svg" alt="SDSC" class="hidden h-6 dark:block" />
        <img src="/logos/sdsc.svg" alt="SDSC" class="block h-6 dark:hidden" />
        <span class="text-sm font-bold">Hackathons</span>
    </a>
</div>

{#if mobileOpen}
    <button
        aria-label="Close navigation"
        class="fixed inset-0 z-30 bg-black/50 md:hidden"
        onclick={() => (mobileOpen = false)}
    ></button>
{/if}

<aside
    class="fixed inset-y-0 left-0 z-40 flex h-screen w-64 -translate-x-full flex-col
           border-r border-surface-200-800 bg-surface-50-950 transition-transform
           duration-200 md:static md:z-auto md:h-auto md:translate-x-0 md:transition-[width]
           {mobileOpen ? 'translate-x-0' : ''} {collapsed ? 'md:w-16' : 'md:w-64'}"
>
    <div
        class="flex h-14 shrink-0 items-center gap-3 border-b border-surface-200-800 px-4
               {effectiveCollapsed ? 'justify-center px-0' : 'justify-between'}"
    >
        {#if !effectiveCollapsed}
            <a
                href={resolve('/(app)/(participant)/dashboard')}
                class="flex items-center gap-2 no-underline"
            >
                <img src="/logos/sdsc_white.svg" alt="SDSC" class="hidden h-6 dark:block" />
                <img src="/logos/sdsc.svg" alt="SDSC" class="block h-6 dark:hidden" />
                <span class="text-sm font-bold">Hackathons</span>
            </a>
        {/if}
        <button
            onclick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            class="btn-icon btn-sm hidden md:inline-flex"
        >
            {#if collapsed}
                <PanelLeftOpen class="h-4 w-4" />
            {:else}
                <PanelLeftClose class="h-4 w-4" />
            {/if}
        </button>
        <button
            onclick={() => (mobileOpen = false)}
            aria-label="Close navigation"
            class="btn-icon btn-sm md:hidden"
        >
            <X class="h-4 w-4" />
        </button>
    </div>

    <HackathonSwitcher hackathons={myHackathons} collapsed={effectiveCollapsed} />

    <nav class="flex-1 overflow-y-auto">
        {#if activeSlug}
            <HackathonNav slug={activeSlug} collapsed={effectiveCollapsed} />
            {#if canManageActiveHackathon}
                <HackathonAdminNav slug={activeSlug} collapsed={effectiveCollapsed} />
            {/if}
        {/if}
        {#if isGlobalAdmin}
            <SiteAdminNav collapsed={effectiveCollapsed} />
        {/if}
    </nav>

    <SidebarUserFooter {session} collapsed={effectiveCollapsed} />
</aside>
