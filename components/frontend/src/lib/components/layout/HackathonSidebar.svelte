<script lang="ts">
    import { page } from '$app/stores';
    import { afterNavigate } from '$app/navigation';
    import Menu from 'lucide-svelte/icons/menu';
    import X from 'lucide-svelte/icons/x';
    import PanelLeftClose from 'lucide-svelte/icons/panel-left-close';
    import PanelLeftOpen from 'lucide-svelte/icons/panel-left-open';
    import SidebarNavSection from './SidebarNavSection.svelte';
    import { activeNavId, hackathonRoleBadge, manageNav, memberNav } from '$lib/navigation';

    interface HackathonMember {
        role: number;
        isWaiting: boolean;
    }

    interface HackathonPage {
        id: string;
        title: string;
        /** False for a draft only its organisers can see — badged, not hidden. */
        visible: boolean;
    }

    let {
        hackathonId,
        hackathonName,
        pages,
        membership,
        isGlobalAdmin,
    }: {
        hackathonId: string;
        hackathonName: string;
        /**
         * The hackathon's content pages, already filtered to the visible ones and
         * ordered by the backend.
         */
        pages: HackathonPage[];
        /** The viewer's own membership row, absent for an admin who never joined. */
        membership: HackathonMember | null;
        isGlobalAdmin: boolean;
    } = $props();

    let collapsed = $state(false);
    let mobileOpen = $state(false);
    let isDesktop = $state(true);

    // `collapsed` is a desktop-only preference (persisted below); on a narrow
    // viewport the drawer must always render fully expanded regardless of it.
    const effectiveCollapsed = $derived(collapsed && isDesktop);

    const items = $derived(memberNav(hackathonId, pages));
    const manageItems = $derived(manageNav(hackathonId, membership ?? undefined, isGlobalAdmin));

    // One call across both sections, per activeNavId's contract: computing it per
    // section let each highlight its own best match, so two could light at once.
    // It also resolves the overlap deliberately — /timeline/new is longer than
    // /timeline, so New Phase wins there and Timeline does not stay lit behind it.
    const activeId = $derived(activeNavId($page.url.pathname, [...items, ...manageItems]));

    // `membership.role` is sourced from casbin. It is absent for a global admin who
    // never joined, hence the second argument.
    const badge = $derived(hackathonRoleBadge(membership ?? undefined, isGlobalAdmin));

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

<!-- Off-canvas on mobile, so the hackathon's nav needs its own trigger. The bar
     names the hackathon rather than repeating the wordmark, which NavBar above it
     already carries. -->
<div
    class="flex h-12 items-center gap-3 border-b border-line bg-surface px-4
           md:hidden"
>
    <button
        onclick={() => (mobileOpen = true)}
        aria-label="Open hackathon navigation"
        class="btn btn-icon btn-sm"
    >
        <Menu class="h-5 w-5" />
    </button>
    <span class="min-w-0 truncate text-sm font-bold">{hackathonName}</span>
</div>

{#if mobileOpen}
    <button
        aria-label="Close hackathon navigation"
        class="fixed inset-0 z-30 bg-scrim md:hidden"
        onclick={() => (mobileOpen = false)}
    ></button>
{/if}

<!-- Desktop: a sticky column below the 3.5rem header rather than one that
     stretches with the page. Stretching left the nav's own overflow-y-auto inert,
     since an unbounded height never overflows, and pushed a long page's content
     pages below the fold. md:self-start keeps the flex row from stretching it back
     out. -->
<aside
    class="fixed inset-y-0 left-0 z-40 flex h-screen w-64 -translate-x-full flex-col
           border-r border-line bg-surface transition-transform
           duration-200 md:sticky md:top-14 md:bottom-auto md:z-auto
           md:h-[calc(100vh-3.5rem)] md:translate-x-0 md:self-start md:transition-[width]
           {mobileOpen ? 'translate-x-0' : ''} {collapsed ? 'md:w-16' : 'md:w-64'}"
>
    <div
        class="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4
               {effectiveCollapsed ? 'justify-center px-0' : 'justify-between'}"
    >
        {#if effectiveCollapsed}
            <button
                onclick={toggleCollapsed}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                class="btn btn-icon btn-sm"
            >
                <PanelLeftOpen class="h-4 w-4" />
            </button>
        {:else}
            <!-- The heading is load-bearing rather than decorative: these entries
                 all belong to one hackathon, and once the shell-wide sidebar is
                 gone this is the only place its name appears on pages that carry no
                 hero. The role chip rides along with it — SidebarNavSection only
                 renders a badge beside a section label, and there is none here. -->
            <div class="flex min-w-0 items-baseline gap-2">
                <span class="min-w-0 truncate text-sm font-bold">{hackathonName}</span>
                {#if badge}
                    <span class="badge shrink-0 badge-accent">
                        {badge}
                    </span>
                {/if}
            </div>
            <button
                onclick={toggleCollapsed}
                aria-label="Collapse sidebar"
                class="btn btn-icon btn-sm hidden md:inline-flex"
            >
                <PanelLeftClose class="h-4 w-4" />
            </button>
            <button
                onclick={() => (mobileOpen = false)}
                aria-label="Close hackathon navigation"
                class="btn btn-icon btn-sm md:hidden"
            >
                <X class="h-4 w-4" />
            </button>
        {/if}
    </div>

    <nav class="flex-1 overflow-y-auto">
        <!-- The participant entries carry no section label: the header directly
             above already names the hackathon, and labelling this one too would
             imply the Manage section below is a peer rather than an addition to
             it. -->
        <SidebarNavSection {items} {activeId} collapsed={effectiveCollapsed} />

        <!-- Organiser-only, and empty for everyone else — SidebarNavSection drops
             a section with no items. The heading is what makes the difference
             legible, so unlike the section above this one needs it.

             No role chip here even though the section is role-gated: the header
             above already states the viewer's role, and a second "Owner" chip
             reads as two roles rather than one role stated twice. The tertiary
             accent does the distinguishing instead. -->
        <SidebarNavSection
            label="Manage"
            items={manageItems}
            {activeId}
            collapsed={effectiveCollapsed}
            accent="tertiary"
        />
    </nav>
</aside>
