<script lang="ts">
    import { signIn, signOut } from '@auth/sveltekit/client';
    import { page } from '$app/stores';
    import { afterNavigate } from '$app/navigation';
    import { resolve } from '$app/paths';
    import Menu from 'lucide-svelte/icons/menu';
    import X from 'lucide-svelte/icons/x';
    import type { Session } from '@auth/sveltekit';
    import LightSwitch from './LightSwitch.svelte';
    import UserCog from 'lucide-svelte/icons/user-cog';

    // The header carries identity, theme and sign-out — no administration entry.
    // That moved to the dashboard's Manage platform section, which is the single
    // place the platform pages are offered from. The trade is deliberate: from
    // inside a hackathon an admin now returns to the dashboard first, via the
    // wordmark, rather than jumping straight there from the header — on a phone
    // as much as on a desktop, since the mobile panel drops the entry too.
    let {
        session,
    }: {
        session: Omit<Session, 'accessToken'> | null;
    } = $props();

    let mobileOpen = $state(false);

    const userName = $derived(session?.user?.name ?? 'User');
    const initial = $derived(userName.charAt(0).toUpperCase());

    // The accent marks where you are rather than decorating the monogram, so the
    // header spends no accent and leaves the page's one primary action to own it.
    //
    // Two separate flags, because the two entries are two destinations: your own
    // events and every event. They used to be one flag over one entry that
    // changed target with your session, which lit "Hackathons" on the landing
    // page and left the browse page — the searchable list the entry names —
    // unreachable from the chrome once you signed in.
    const onDashboard = $derived($page.url.pathname.startsWith('/dashboard'));
    const onHackathons = $derived(
        $page.url.pathname === '/hackathon' || $page.url.pathname.startsWith('/hackathon/')
    );

    // Where signing in returns you. Back to the page you were on, EXCEPT the
    // public pages that are not a destination once you have an account: landing
    // on "/" after a login reads as "nothing happened". Pages with a reason to
    // return — an event you were about to join — pass their own callbackUrl.
    const loginReturn = $derived(
        $page.url.pathname === '/' ? '/dashboard' : $page.url.pathname
    );

    const TAB = 'pb-0.5 text-sm font-medium no-underline hover:text-accent-ink';
    const TAB_ON = 'text-ink shadow-[inset_0_-2px_0_var(--color-accent)]';
    const TAB_OFF = 'text-ink-2';

    // The row vocabulary is SidebarNavSection's, so the two navigations read as
    // one system rather than drifting into separate dialects of the same idea.
    const ROW =
        'flex h-10 items-center rounded-control px-2 text-sm no-underline transition-colors';
    const ROW_ACTIVE = 'bg-raised font-medium text-accent-ink';
    const ROW_IDLE = 'text-ink-3 hover:text-ink-2';

    // Any navigation closes the panel. It sits in the header's own flow rather
    // than over the page, so leaving it open would push the destination down
    // instead of merely covering it.
    afterNavigate(() => {
        mobileOpen = false;
    });
</script>

<header class="sticky top-0 z-50 flex flex-col border-b border-line bg-surface">
    <!-- Chrome hugs the viewport instead of matching the page shell's
         sm:px-10 md:px-20 inset. At md that inset is 5.6rem, which left the
         wordmark adrift mid-bar rather than anchored to the edge it belongs to. -->
    <div class="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <!-- The wordmark is the platform instance, so it goes to the platform's
             own front page — for everyone. It used to send signed-in people to
             their dashboard instead, which made the landing page unreachable
             once you had an account: the one control every page carries pointed
             back into the app you were already in. -->
        <a href={resolve('/')} class="flex min-w-0 items-center gap-2 no-underline sm:gap-3">
            <img
                src="/logos/sdsc_white.svg"
                alt="SDSC"
                class="hidden h-6 shrink-0 dark:block sm:h-7"
            />
            <img
                src="/logos/sdsc.svg"
                alt="SDSC"
                class="block h-6 shrink-0 dark:hidden sm:h-7"
            />
            <span class="truncate text-section">Hackathons</span>
        </a>

        <nav class="hidden items-center gap-6 md:flex">
            <!-- Your events, only once you have some. First, because it is where
                 a signed-in person is going nine times out of ten. -->
            {#if session?.user}
                <a
                    href={resolve('/(app)/dashboard')}
                    aria-current={onDashboard ? 'page' : undefined}
                    class="{TAB} {onDashboard ? TAB_ON : TAB_OFF}"
                >
                    Dashboard
                </a>
            {/if}
            <!-- "Hackathons" is the browse page — every event, searchable —
                 whoever is asking. The label names a list, so it has to reach
                 the list; when it pointed at the dashboard while signed in, the
                 same word meant "yours" or "all" depending on your session. -->
            <a href="/hackathon" aria-current={onHackathons ? 'page' : undefined} class="{TAB} {onHackathons ? TAB_ON : TAB_OFF}">
                Hackathons
            </a>
            <!-- Always here, signed in or out. It used to be hidden inside the
                 app shell as a "marketing link", which made the nav change
                 shape the moment you reached the dashboard: three entries on
                 the way in, two once you arrived. A navigation you cannot point
                 at is worse than one carrying an entry you rarely need.

                 About is a real SitePage, served by [slug=sitepage]. The
                 "Challenges" entry that used to sit beside it pointed at "/" —
                 no backing entity yet, and a link to nowhere is worse than a
                 missing one. It comes back the day the feature does. -->
            <a href="/about" class="{TAB} {TAB_OFF}">About</a>
        </nav>

        <div class="flex shrink-0 items-center gap-2 sm:gap-3">
            <LightSwitch />

            {#if session?.user}
                <!-- A quiet outlined tile, not an accent-filled disc: a monogram is
                     identity, not an action to be drawn toward. The header's accent
                     is spent on the active-nav underline instead. -->
                <div class="flex min-w-0 items-center gap-2">
                    <span
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-field
                           border border-line-strong bg-raised text-sm font-semibold text-ink-2"
                        title={userName}
                    >
                        {initial}
                    </span>
                    <span class="hidden max-w-40 truncate text-sm font-medium sm:inline">
                        {userName}
                    </span>
                </div>
                <!-- Your account. It belongs next to sign-out — both are about
                     you rather than about a hackathon — and this bar is the only
                     chrome the app shell renders: AppSidebar, where the
                     SidebarUserFooter version of this link lives, is not mounted
                     by any route, so without this entry /account exists and
                     nothing reaches it. -->
                <a
                    href="/account"
                    title="Your account"
                    aria-label="Your account"
                    class="btn btn-icon btn-sm btn-quiet hidden md:inline-flex"
                >
                    <UserCog class="h-4 w-4" />
                </a>
                <!-- Desktop only. Below md it moves into the panel, and the width
                     that frees is what keeps the bar from overflowing at 320px. -->
                <button
                    onclick={() => signOut({ callbackUrl: '/' })}
                    class="btn btn-sm btn-quiet hidden md:inline-flex"
                >
                    Log out
                </button>
            {:else}
                <!-- Outline, not solid: the bar sits over public pages that carry
                     their own CTA, and shell chrome does not outrank the thing the
                     page is for. Kept in the bar at every width — signing in is why
                     a signed-out visitor is here, so it should not need a tap to
                     find. -->
                <button
                    onclick={() => signIn('keycloak', { callbackUrl: loginReturn })}
                    class="btn btn-sm btn-outline-accent"
                >
                    Log in
                </button>
            {/if}

            <button
                onclick={() => (mobileOpen = !mobileOpen)}
                aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
                aria-expanded={mobileOpen}
                aria-controls="navbar-mobile-nav"
                class="btn btn-icon btn-sm btn-quiet md:hidden"
            >
                {#if mobileOpen}
                    <X class="h-5 w-5" />
                {:else}
                    <Menu class="h-5 w-5" />
                {/if}
            </button>
        </div>
    </div>

    <!-- In the header's own flow rather than an off-canvas drawer: on mobile
         HackathonSidebar already owns the left edge at z-40, and a second drawer
         there would slide out on top of it. Staying inside the sticky header also
         keeps the panel out of any stacking argument with the page. -->
    {#if mobileOpen}
        <nav
            id="navbar-mobile-nav"
            class="flex flex-col gap-0.5 border-t border-line px-4 py-2 md:hidden"
        >
            <!-- Same entries as the bar above, in the same order: the panel is
                 the bar at 320px, not a second navigation with its own ideas. -->
            {#if session?.user}
                <a
                    href={resolve('/(app)/dashboard')}
                    aria-current={onDashboard ? 'page' : undefined}
                    class="{ROW} {onDashboard ? ROW_ACTIVE : ROW_IDLE}"
                >
                    Dashboard
                </a>
            {/if}
            <a
                href="/hackathon"
                aria-current={onHackathons ? 'page' : undefined}
                class="{ROW} {onHackathons ? ROW_ACTIVE : ROW_IDLE}"
            >
                Hackathons
            </a>
            <a href="/about" class="{ROW} {ROW_IDLE}">About</a>
            {#if session?.user}
                <!-- Below md the account link moves in here with sign-out, for
                     the same reason sign-out does: the bar has no room for it
                     at 320px. -->
                <a href="/account" class="{ROW} {ROW_IDLE}">Your account</a>
                <button
                    onclick={() => signOut({ callbackUrl: '/' })}
                    class="btn btn-sm btn-quiet mt-1 self-start"
                >
                    Log out
                </button>
            {/if}
        </nav>
    {/if}
</header>
