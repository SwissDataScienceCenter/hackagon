<script lang="ts">
    import { page } from '$app/stores';
    import { afterNavigate } from '$app/navigation';
    import { resolve } from '$app/paths';
    import Menu from 'lucide-svelte/icons/menu';
    import X from 'lucide-svelte/icons/x';
    import PanelLeftClose from 'lucide-svelte/icons/panel-left-close';
    import SidebarNavSection from './SidebarNavSection.svelte';
    import SidebarUserFooter from './SidebarUserFooter.svelte';
    import {
        activeNavId,
        defaultHackathon,
        hackathonRoleBadge,
        hackathonsRoleBadge,
        homeNav,
        memberNav,
        platformNav,
        platformRoleBadge,
    } from '$lib/navigation';
    import type { Session } from '@auth/sveltekit';

    interface HackathonMember {
        role: number;
        isWaiting: boolean;
    }

    interface HackathonEntry {
        id: string;
        name: string;
        /** HackathonStatus: PENDING=1, ACTIVE=2, FINISHED=3. */
        status: number;
        startsAt?: Date;
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
        /**
         * The active hackathon's content pages, already filtered to the visible
         * ones and ordered by the backend. Empty outside a hackathon.
         */
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

    // With no hackathon in the URL the nav still shows one — the one you are
    // most likely to want — so the sidebar is not a dead end on the dashboard.
    const urlHackathonId = $derived($page.params.id);
    const navId = $derived(urlHackathonId ?? defaultHackathon(myHackathons)?.id);
    const navHackathon = $derived(myHackathons.find((h) => h.id === navId));

    // Pages are only loaded for the hackathon the URL names, so when navId comes
    // from the default-hackathon fallback there are none to append.
    const hackathonItems = $derived(
        navId ? memberNav(navId, navId === urlHackathonId ? hackathonPages : []) : [],
    );
    const homeItems = $derived(homeNav({ isGlobalAdmin, isHackathonOrganizer }));
    const platformItems = $derived(platformNav({ isGlobalAdmin }));
    const activeId = $derived(
        activeNavId($page.url.pathname, [...homeItems, ...hackathonItems, ...platformItems]),
    );

    // `viewerMembership.role` is sourced from casbin and populated by
    // HackathonService.List whenever participant_id is set — always, here. It is
    // absent for a global admin who never joined, hence the second argument.
    const hackathonBadge = $derived(
        hackathonRoleBadge(navHackathon?.viewerMembership, isGlobalAdmin),
    );
    const homeBadge = $derived(hackathonsRoleBadge({ isHackathonOrganizer }));
    const platformBadge = $derived(platformRoleBadge({ isGlobalAdmin }));

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

    // Any navigation closes the mobile drawer — it overlays the page, so leaving
    // it open over the destination would hide what the user just navigated to.
    afterNavigate(() => {
        mobileOpen = false;
    });

    // Lock background scroll while the mobile drawer is open — it's an overlay,
    // not part of the page flow.
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

<!-- The (app) shell has no header, so the drawer needs its own trigger on
     mobile: without this bar there is no way to reach the navigation there. -->
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
    <a href={resolve('/(app)/dashboard')} class="flex items-center gap-2 no-underline">
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

<!-- Desktop: a sticky, viewport-tall column rather than one that stretches with
     the page. Stretching put the Hackathons and Platform sections below the fold
     on any long page — they are the way out of the current hackathon, so they
     have to stay on screen — and left the nav's own overflow-y-auto inert, since
     an unbounded height never overflows. md:self-start keeps the flex row from
     stretching it back out. -->
<aside
    class="fixed inset-y-0 left-0 z-40 flex h-screen w-64 -translate-x-full flex-col
           border-r border-surface-200-800 bg-surface-50-950 transition-transform
           duration-200 md:sticky md:top-0 md:bottom-auto md:z-auto md:h-screen
           md:translate-x-0 md:self-start md:transition-[width]
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
            <a href={resolve('/(app)/dashboard')} class="flex items-center gap-2 no-underline">
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

    <!-- Scope widens downwards: the hackathon you are in, then all of them, then
         the platform. Only the hackathon's own nav scrolls — it is the longest,
         and the two below it have to stay reachable when it overflows. -->
    <nav class="flex-1 overflow-y-auto">
        {#if hackathonItems.length > 0}
            <!-- Headed by the hackathon's own name, which is load-bearing rather
                 than decorative: with no id in the URL these entries belong to a
                 hackathon nothing else on the page names. There is deliberately
                 no way to hop sideways into another one from here — Hackathons
                 below is the single way out. -->
            <!-- The name falls back to a generic heading rather than vanishing:
                 an admin can open a hackathon they never joined, so it is absent
                 from myHackathons and there is no name to read from it. -->
            <SidebarNavSection
                label={navHackathon?.name ?? 'Hackathon'}
                badge={hackathonBadge}
                items={hackathonItems}
                {activeId}
                collapsed={effectiveCollapsed}
            />
        {/if}
    </nav>

    <!-- The way back out to all of them, so it stays put whether or not one is
         open. An organiser's Create Hackathon sits here rather than under
         Platform — it acts on hackathons, which is what this section is. -->
    <SidebarNavSection
        label="Hackathons"
        badge={homeBadge}
        items={homeItems}
        {activeId}
        collapsed={effectiveCollapsed}
    />

    <!-- Admin-only: platformNav is empty for everyone else, so the section is
         absent rather than a heading with nothing under it. -->
    {#if platformItems.length > 0}
        <SidebarNavSection
            label="Platform"
            badge={platformBadge}
            items={platformItems}
            {activeId}
            collapsed={effectiveCollapsed}
            accent="tertiary"
        />
    {/if}

    <SidebarUserFooter {session} collapsed={effectiveCollapsed} />
</aside>
