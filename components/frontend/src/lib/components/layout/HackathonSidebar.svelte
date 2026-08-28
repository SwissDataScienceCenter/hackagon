<script lang="ts">
    import { page } from '$app/stores';
    import { afterNavigate } from '$app/navigation';
    import Menu from 'lucide-svelte/icons/menu';
    import X from 'lucide-svelte/icons/x';
    import PanelLeftClose from 'lucide-svelte/icons/panel-left-close';
    import PanelLeftOpen from 'lucide-svelte/icons/panel-left-open';
    import SidebarNavSection from './SidebarNavSection.svelte';
    import { manageNav, memberNav } from '$lib/navigation/items';
    import { activeNavId } from '$lib/navigation/active';
    import { hackathonRoleBadge } from '$lib/utils/hackathonRole';

    interface HackathonMember {
        role: number;
        isWaiting: boolean;
    }

    interface HackathonPage {
        id: string;
        title: string;
        /** False for a page only its organisers can see — badged, not omitted. */
        visible: boolean;
    }

    let {
        hackathonId,
        hackathonName,
        pages,
        membership,
        isGlobalAdmin,
        votingEnabled = false,
        resultsVisible = false,
        teamCount = 0,
        trackCount = 0,
        phaseCount = 0,
        hasDescription = false,
        stateNeedsAttention = false,
        isPrivate = false,
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
        /**
         * Whether `CAPABILITY_VOTE` is on. The participant Voting entry appears
         * only then — see `memberNav`. The organiser's Manage Voting entry is
         * unaffected.
         */
        votingEnabled?: boolean;
        /**
         * Whether `CAPABILITY_VIEW_RESULTS` is on. Gates the Results entry, and
         * is a separate switch from `votingEnabled` because the backend keeps
         * the two capabilities separate — see `memberNav`.
         */
        resultsVisible?: boolean;
        /**
         * How many teams the hackathon has. Only the count is needed: it decides
         * whether the participant Teams entry is offered at all — see
         * `memberNav`. Not a permission, unlike the two above; every confirmed
         * member may read teams, there are simply none yet.
         */
        teamCount?: number;
        /**
         * How many tracks the hackathon has. Only the count is needed: it decides
         * whether Manage Tracks is offered at all — see `manageNav`. Zero, and the
         * way to the first track is the Tracks card on Settings.
         */
        trackCount?: number;
        /**
         * How many phases the hackathon has. Only the count is needed: it decides
         * whether Timeline and Manage Timeline are offered at all — see
         * `memberNav` and `manageNav`. Zero, and the way to the first phase is the
         * "Where the hackathon is" card on Settings.
         */
        phaseCount?: number;
        /**
         * Whether the hackathon has a description at all. Gates the About entry
         * — see `memberNav`. False, and there is nothing to read, so the entry
         * is not offered rather than leading to an empty page.
         */
        hasDescription?: boolean;
        /**
         * Badges the Settings entry — the page the capability switches
         * live on. Organiser-only by construction, since the whole Manage
         * section is, and the caller passes false for anyone who could not act
         * on it anyway.
         */
        stateNeedsAttention?: boolean;
        /**
         * Whether this hackathon is private. Gates the Invitations entry — see
         * `manageNav`: a public hackathon is listed and joinable by anybody, so
         * an invitation link there grants nothing.
         */
        isPrivate?: boolean;
    } = $props();

    let collapsed = $state(false);
    let mobileOpen = $state(false);
    let isDesktop = $state(true);
    // For an owner these open the other way round from what you might expect:
    // Manage out, Participant View folded to its heading. An owner arriving in a
    // hackathon was landing on a wall of participant destinations with their own
    // section shut underneath it, and read the whole rail as their nav with the
    // controls missing. Folded and labelled, the participant entries stop being
    // the default and start being what they are — the other side of the
    // hackathon, one click away.
    //
    // Both are ignored for a participant: with no Manage section there is no
    // heading and no chevron on the entries above it, so they are simply always
    // out, exactly as before.
    let manageOpen = $state(true);
    let memberOpen = $state(false);

    // `collapsed` is a desktop-only preference (persisted below); on a narrow
    // viewport the drawer must always render fully expanded regardless of it.
    const effectiveCollapsed = $derived(collapsed && isDesktop);

    const items = $derived(
        memberNav(
            hackathonId,
            pages,
            votingEnabled,
            resultsVisible,
            teamCount,
            hasDescription,
            phaseCount
        ),
    );
    // Given the same `membership`/`isGlobalAdmin` as `badge` below, so the Manage
    // section and the "Owner" chip can never disagree about the role.
    const manageItems = $derived(
        manageNav(
            hackathonId,
            membership ?? undefined,
            isGlobalAdmin,
            stateNeedsAttention,
            trackCount,
            isPrivate,
            phaseCount,
        ),
    );

    // One call across both sections, per activeNavId's contract: computing it per
    // section let each highlight its own best match, so two could light at once.
    // It also resolves the overlaps deliberately, longest href winning:
    // /timeline/new beats /timeline so New Phase lights rather than Timeline, and
    // /teams/manage beats /teams. It cuts the other way for pages — an individual
    // /pages/<id> is longer than /pages, so opening one lights that page and not
    // Manage Pages.
    const activeId = $derived(activeNavId($page.url.pathname, [...items, ...manageItems]));

    // Settings counts as inside the section like every other screen in it: it is
    // one of the pages, not the way in. The way in is the heading, which is drawn
    // whatever the fold state.
    const insideManage = $derived(activeId?.startsWith('manage:') ?? false);
    // Its counterpart, and deliberately not `!insideManage`: with no entry lit at
    // all — a route neither section owns — neither section is forced open, and
    // whatever the reader last chose stands.
    const insideMember = $derived(activeId?.startsWith('member:') ?? false);

    // `membership.role` is sourced from casbin. It is absent for a global admin who
    // never joined, hence the second argument.
    const badge = $derived(hackathonRoleBadge(membership ?? undefined, isGlobalAdmin));

    // A saved preference and an unset key are not the same thing here, which is
    // why this reads three-valued rather than comparing to 'true': the defaults
    // above are no longer both false, so `getItem(k) === 'true'` would quietly
    // shut the Manage section for every reader who had never touched it.
    function stored(key: string): boolean | undefined {
        if (typeof localStorage === 'undefined') return undefined;
        const value = localStorage.getItem(key);
        return value === null ? undefined : value === 'true';
    }

    $effect(() => {
        collapsed = stored('sidebar-collapsed') ?? collapsed;
        manageOpen = stored('sidebar-manage-open') ?? manageOpen;
        memberOpen = stored('sidebar-member-open') ?? memberOpen;
    });

    // Entering a section opens it, rather than pinning it open while you are in
    // there: deriving the fold state from the route instead made the chevron a
    // no-op on every Manage page, which reads as a broken control. Declared after
    // the restore above so the route wins over the saved preference on arrival —
    // the section holding the lit row is never the folded one.
    $effect(() => {
        if (insideManage) manageOpen = true;
    });

    $effect(() => {
        if (insideMember) memberOpen = true;
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

    /** Both preferences are per-browser, so neither is worth a round trip. */
    function remember(key: string, value: boolean) {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(key, String(value));
    }

    function toggleCollapsed() {
        collapsed = !collapsed;
        remember('sidebar-collapsed', collapsed);
    }

    function toggleManage() {
        manageOpen = !manageOpen;
        remember('sidebar-manage-open', manageOpen);
    }

    function toggleMember() {
        memberOpen = !memberOpen;
        remember('sidebar-member-open', memberOpen);
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
        <!-- Labelled and foldable only where there is a Manage section to tell it
             apart from. For a participant these entries are simply the hackathon,
             the header above already names it, and a heading over them would say
             nothing — passing neither `label` nor `onToggle` leaves them an
             unlabelled, unfoldable list, which is what they were.

             For an owner the label is the whole fix. Unlabelled and first, this
             list read as their own nav, and its participant shape read as
             controls that had gone missing; owners kept asking why entering a
             hackathon showed them a participant's view of it. Named, it stops
             being a mistake and becomes a place to go on purpose — the thing an
             owner actually wants from it is to see what participants see.

             Still first, and every entry still in the same position it holds for
             a participant: `manageNav` keeps the two spines aligned on purpose,
             and folding this one gets the emphasis without moving a single
             row. -->
        <SidebarNavSection
            label={manageItems.length > 0 ? 'Participant View' : undefined}
            {items}
            {activeId}
            collapsed={effectiveCollapsed}
            open={memberOpen}
            onToggle={manageItems.length > 0 ? toggleMember : undefined}
        />

        <!-- Organiser-only, and open by default: for the viewer who has one, this
             is the section they came for. The heading is the only permanent row —
             it names the section, and its chevron discloses every screen in it,
             Settings included. No entry is drawn as the section's own, because
             none of them is. Its counterpart above is now labelled too, and the
             pair of headings is what makes the two sides legible as two sides.

             Guarded here rather than left to SidebarNavSection, which keeps a
             labelled empty section on purpose so a role chip has somewhere to
             sit. This section passes no chip, so for a member that rule left a
             bare heading over nothing.

             No role chip even though the section is role-gated: the header above
             already states the viewer's role, and a second "Owner" chip reads as
             two roles rather than one role stated twice. The tertiary accent does
             the distinguishing instead. -->
        {#if manageItems.length > 0}
            <SidebarNavSection
                label="Manage Hackathon"
                items={manageItems}
                {activeId}
                collapsed={effectiveCollapsed}
                accent="tertiary"
                open={manageOpen}
                onToggle={toggleManage}
            />
        {/if}
    </nav>
</aside>
