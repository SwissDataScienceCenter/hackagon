<script lang="ts">
    import { page } from '$app/stores';
    import { resolve } from '$app/paths';
    import Menu from 'lucide-svelte/icons/menu';
    import X from 'lucide-svelte/icons/x';
    import PanelLeftClose from 'lucide-svelte/icons/panel-left-close';
    import SidebarNavSection from './SidebarNavSection.svelte';
    import NavModeSwitch from './NavModeSwitch.svelte';
    import SidebarUserFooter from './SidebarUserFooter.svelte';
    import { isOwnerRole } from '$lib/utils/hackathonStatus';
    import {
        activeNavId,
        counterpartHref,
        homeNav,
        manageNav,
        memberNav,
        navModeFromRouteId,
        platformNav,
    } from '$lib/navigation';
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

    interface HackathonPage {
        id: string;
        title: string;
    }

    let {
        myHackathons,
        hackathonPages,
        isGlobalAdmin,
        isHackathonOrganizer,
        session,
    }: {
        myHackathons: HackathonEntry[];
        hackathonPages: HackathonPage[];
        isGlobalAdmin: boolean;
        isHackathonOrganizer: boolean;
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
    const mode = $derived(navModeFromRouteId($page.route.id ?? null));

    // Owners of this hackathon, plus global admins (who can manage any of them —
    // and who need the isGlobalAdmin branch because a non-participant admin never
    // appears in myHackathons, so there is no membership row to read a role from).
    // `viewerMembership.role` is sourced from casbin and populated by
    // HackathonService.List whenever participant_id is set — always, here.
    const showModeSwitch = $derived(
        Boolean(activeSlug) &&
            (isGlobalAdmin || isOwnerRole(activeHackathon?.viewerMembership?.role ?? 0)),
    );

    const hackathonItems = $derived(
        activeSlug
            ? mode === 'manage'
                ? manageNav(activeSlug)
                : memberNav(activeSlug, hackathonPages)
            : [],
    );
    const homeItems = $derived(homeNav());
    const platformItems = $derived(platformNav({ isGlobalAdmin, isHackathonOrganizer }));
    const activeId = $derived(
        activeNavId($page.url.pathname, [...homeItems, ...hackathonItems, ...platformItems]),
    );

    const viewHref = $derived(
        activeSlug ? counterpartHref(activeId, 'view', activeSlug, hackathonPages) : '',
    );
    const manageHref = $derived(
        activeSlug ? counterpartHref(activeId, 'manage', activeSlug, hackathonPages) : '',
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
    <a href={resolve('/(app)/(member)/dashboard')} class="flex items-center gap-2 no-underline">
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
        {#if effectiveCollapsed}
            <!-- The collapsed rail keeps the wordmark: hiding it outright made a
                 collapsed sidebar indistinguishable from a broken one. There is
                 no square SDSC mark, so the wordmark is scaled to the 4rem rail
                 and doubles as the expand affordance. -->
            <button
                onclick={toggleCollapsed}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                class="flex h-full w-full items-center justify-center px-2"
            >
                <img
                    src="/logos/sdsc_white.svg"
                    alt=""
                    class="hidden h-4 w-full object-contain dark:block"
                />
                <img
                    src="/logos/sdsc.svg"
                    alt=""
                    class="block h-4 w-full object-contain dark:hidden"
                />
            </button>
        {:else}
            <a
                href={resolve('/(app)/(member)/dashboard')}
                class="flex items-center gap-2 no-underline"
            >
                <img src="/logos/sdsc_white.svg" alt="SDSC" class="hidden h-6 dark:block" />
                <img src="/logos/sdsc.svg" alt="SDSC" class="block h-6 dark:hidden" />
                <span class="text-sm font-bold">Hackathons</span>
            </a>
            <button
                onclick={toggleCollapsed}
                aria-label="Collapse sidebar"
                class="btn-icon btn-sm hidden md:inline-flex"
            >
                <PanelLeftClose class="h-4 w-4" />
            </button>
            <button
                onclick={() => (mobileOpen = false)}
                aria-label="Close navigation"
                class="btn-icon btn-sm md:hidden"
            >
                <X class="h-4 w-4" />
            </button>
        {/if}
    </div>

    {#if showModeSwitch && activeSlug}
        <NavModeSwitch {viewHref} {manageHref} {mode} collapsed={effectiveCollapsed} />
    {/if}

    <nav class="flex-1 overflow-y-auto">
        <!-- The way back out of a hackathon, so it stays put whether or not one
             is open. -->
        <SidebarNavSection
            items={homeItems}
            {activeId}
            collapsed={effectiveCollapsed}
        />

        {#if activeSlug}
            <!-- No section heading: the page header names the hackathon on every
                 screen, and the mode switch above names the mode. There is
                 deliberately no way to hop sideways into another hackathon from
                 here — being inside one should mean being inside one. My
                 Hackathons above is the single way back out. -->
            <SidebarNavSection
                items={hackathonItems}
                {activeId}
                collapsed={effectiveCollapsed}
                activeColor={mode === 'manage' ? 'secondary' : 'primary'}
            />
        {/if}
    </nav>

    <!-- Platform scope is not part of the current hackathon, so it sits pinned
         outside the scrolling hackathon nav rather than trailing it. -->
    {#if platformItems.length > 0}
        <SidebarNavSection
            label="Platform"
            items={platformItems}
            {activeId}
            collapsed={effectiveCollapsed}
            activeColor="tertiary"
        />
    {/if}

    <SidebarUserFooter {session} collapsed={effectiveCollapsed} />
</aside>
