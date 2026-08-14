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
    import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard';
    import Compass from 'lucide-svelte/icons/compass';
    import { loginDestination } from '$lib/utils/returnTo';

    // The header carries identity, theme and sign-out — no administration entry.
    // That moved to the dashboard's Manage platform section, which is the single
    // place the platform pages are offered from. The trade is deliberate: from
    // inside a hackathon an admin now returns to the dashboard first, via the
    // wordmark, rather than jumping straight there from the header — on a phone
    // as much as on a desktop, since the mobile panel drops the entry too.
    //
    // The primary nav is TWO entries: Dashboard (yours) and All Hackathons
    // (everyone's). About is gone from it — the page stays, the entry does not.
    // It is a SitePage that most people read once, if ever, and the footer's
    // Platform column already links it from every page in the app (AppFooter,
    // beside Privacy and Terms, which are the same kind of page and were never
    // in the bar). Spending a third of the primary nav on it made the two
    // entries that DO get used every day one item in a list of three rather
    // than a pair to tell apart.
    //
    // "Every entry present on every page" still holds — that rule was about an
    // entry appearing and disappearing under you as you moved through the app,
    // which is why About was hoisted out of the app shell in the first place. It
    // is now absent consistently, which the rule permits and the footer covers.
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

    // What each entry is FOR, in one line, stated once and rendered on both
    // surfaces.
    //
    // Two distinct labels were not enough on their own: "Dashboard" and
    // "Hackathons" are both nouns for a list of hackathons, and nothing in
    // either word says whose. So the pair is separated three ways instead of
    // one — the label names the SCOPE ("All Hackathons", against a Dashboard
    // that is yours), an icon carries it pre-reading (a personal panel against
    // a compass for browsing), and the sentence below spells it out where there
    // is room for a sentence.
    //
    // "All Hackathons" rather than "Hackathons" for a second reason as well:
    // the wordmark to its left already reads "Hackathons", so the bare noun was
    // the same word twice in one bar, once as the platform's name and once as a
    // destination inside it.
    // Phrased as a contrast, not as two independent blurbs: "the events you're
    // part of" against "every event", so reading either one answers the question
    // the other raises.
    const DASHBOARD_HINT = "The events you're part of";
    const BROWSE_HINT = 'Every event on the platform, searchable';

    // The desktop tab. `inline-flex` so the icon sits on the label's baseline
    // row and the active underline spans both rather than the text alone.
    const TAB =
        'inline-flex items-center gap-1.5 pb-0.5 text-sm font-medium no-underline hover:text-accent-ink';
    const TAB_ON = 'text-ink shadow-[inset_0_-2px_0_var(--color-accent)]';
    const TAB_OFF = 'text-ink-2';

    // The row vocabulary is SidebarNavSection's, so the two navigations read as
    // one system rather than drifting into separate dialects of the same idea.
    //
    // `min-h-10` rather than `h-10`: the two primary entries carry their hint
    // underneath, and a fixed height would clip the second line at the widths
    // where it wraps. The single-line rows below keep the same 2.5rem they had.
    const ROW =
        'flex min-h-10 items-center gap-2 rounded-control px-2 py-1.5 text-sm no-underline transition-colors';
    const ROW_ACTIVE = 'bg-raised font-medium text-accent-ink';
    const ROW_IDLE = 'text-ink-3 hover:text-ink-2';
    const ROW_HINT = 'text-xs font-normal text-ink-3';

    // Where signing in returns you.
    //
    // A PARKED destination wins. When a guard bounced someone off a deep link it
    // put that link in `?returnTo=`, and this button used to ignore the query
    // entirely and compute a destination from the pathname — so the deep link
    // was dropped by the one control the visitor was being asked to press. That
    // was the whole reason "log in from a link and you end up somewhere else"
    // happened.
    //
    // Otherwise: back to the page you were on, EXCEPT "/", which is not a
    // destination once you have an account — landing there after a login reads
    // as "nothing happened". `loginDestination` supplies the dashboard for that
    // case and refuses to send anyone back to the interstitial.
    //
    // Validated, always: this value becomes an Auth.js callbackUrl, and an
    // unchecked one is an open redirect off the site.
    const loginReturn = $derived(
        loginDestination(
            $page.url.searchParams.get('returnTo') ??
                ($page.url.pathname === '/'
                    ? null
                    : $page.url.pathname + $page.url.search)
        )
    );

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
    <!-- Three columns at md+, not justify-between: with the latter the nav is
         only centred when the wordmark and the actions happen to be the same
         width, and they never are once you sign in — the right side gains a
         monogram, a name and a sign-out button, so the nav visibly slid left
         the moment you logged in. The outer columns are 1fr each and the
         middle is auto, which centres the nav on the VIEWPORT regardless of
         what either side holds. min-w-0 on the sides so a long display name
         truncates instead of pushing the centre off.
         (Pinned by tests/smoke/14-nav-centering.spec.ts.)

         BELOW md the grid must go: the nav it centres is hidden there, but
         the two 1fr columns still split the bar in half — and the right half
         (theme switch, Log in, hamburger) holds its content while the left
         half squeezed the wordmark to "H…" on a phone. With nothing to
         centre, plain justify-between gives each side its natural width.
         (Pinned across widths by tests/mobile/chrome-reflow.spec.ts.) -->
    <div
        class="flex h-14 items-center justify-between gap-3 px-4 sm:px-6
               md:grid md:grid-cols-[1fr_auto_1fr]"
    >
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
            <!-- Below 390px the TEXT is dropped deliberately and the logo
                 stays — the alternative is `truncate` quietly eating it to
                 "H…", which is a bug, not a layout choice. 390 because the
                 signed-out bar (theme switch + Log in + hamburger) leaves the
                 full word ~22px short at 360; measured, not guessed. The
                 cutoff is mirrored by WORDMARK_MIN in
                 tests/mobile/chrome-reflow.spec.ts; move both together.
                 `truncate` stays as a last resort for widths the app does
                 not support (<320px). -->
            <span class="truncate text-section max-[389px]:hidden">Hackathons</span>
        </a>

        <!-- Two entries, and only two: your events, and all of them. About is
             deliberately absent (the footer links it) — see the script above. -->
        <nav class="hidden items-center gap-6 md:flex">
            <!-- Yours. First, because it is where a signed-in person is going
                 nine times out of ten, and because "yours" before "everyone's"
                 is the order the two entries contrast in. -->
            {#if session?.user}
                <a
                    href={resolve('/(app)/dashboard')}
                    aria-current={onDashboard ? 'page' : undefined}
                    title={DASHBOARD_HINT}
                    class="{TAB} {onDashboard ? TAB_ON : TAB_OFF}"
                >
                    <LayoutDashboard class="h-4 w-4 shrink-0" aria-hidden="true" />
                    Dashboard
                </a>
            {/if}
            <!-- Everyone's: the browse page — every event, searchable —
                 whoever is asking. The label names a list, so it has to reach
                 the list; when it pointed at the dashboard while signed in, the
                 same word meant "yours" or "all" depending on your session.
                 It says "All" now for the same reason it stopped moving: the
                 scope belongs in the label, not in the reader's session.

                 One label whoever is asking, signed in or out. A word that
                 renames itself once you have an account is the same bug as one
                 that re-points itself. -->
            <!-- Block-scoped rather than -next-line: the anchor spans several
                 lines, so the rule reports on the href line, not the tag line
                 a -next-line comment would cover. -->
            <!-- eslint-disable svelte/no-navigation-without-resolve -- static route, matches AppFooter's own convention -->
            <a
                href="/hackathon"
                aria-current={onHackathons ? 'page' : undefined}
                title={BROWSE_HINT}
                class="{TAB} {onHackathons ? TAB_ON : TAB_OFF}"
            >
                <Compass class="h-4 w-4 shrink-0" aria-hidden="true" />
                All Hackathons
            </a>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
        </nav>

        <div class="flex min-w-0 shrink-0 items-center justify-end gap-2 sm:gap-3">
            <LightSwitch />

            {#if session?.user}
                <!-- A quiet outlined tile, not an accent-filled disc: a monogram is
                     identity, not an action to be drawn toward. The header's accent
                     is spent on the active-nav underline instead. -->
                <div class="flex min-w-0 items-center gap-2">
                    <!-- No `title={userName}` here, deliberately. Session replay
                         (SessionReplay.svelte) masks TEXT nodes but transmits
                         attribute values verbatim — the tracker only stars `alt`
                         and `placeholder`, and blanks `href`. A tooltip carrying
                         the signed-in person's full name therefore went to the
                         ingest endpoint in clear while the very same name,
                         rendered as text in the span below, arrived as
                         asterisks. Keep personal data in text nodes, never in
                         attributes. Pinned by tests/openreplay/masking.spec.ts. -->
                    <span
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-field
                           border border-line-strong bg-raised text-sm font-semibold text-ink-2"
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
                <!-- Block-scoped rather than -next-line: the anchor spans several
                     lines, so the rule reports on the href line, not the tag line
                     a -next-line comment would cover. -->
                <!-- eslint-disable svelte/no-navigation-without-resolve -- static route, matches AppFooter's own convention -->
                <a
                    href="/account"
                    title="Your account"
                    aria-label="Your account"
                    class="btn btn-icon btn-sm btn-quiet hidden md:inline-flex"
                >
                    <UserCog class="h-4 w-4" />
                </a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
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
                 the bar at 320px, not a second navigation with its own ideas.

                 What it has that the bar cannot: room for the hint the bar can
                 only offer as a tooltip — and a phone has no hover, so a
                 title-only explanation would reach nobody here. -->
            {#if session?.user}
                <a
                    href={resolve('/(app)/dashboard')}
                    aria-current={onDashboard ? 'page' : undefined}
                    class="{ROW} {onDashboard ? ROW_ACTIVE : ROW_IDLE}"
                >
                    <LayoutDashboard class="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span class="flex min-w-0 flex-col">
                        <span>Dashboard</span>
                        <span class={ROW_HINT}>{DASHBOARD_HINT}</span>
                    </span>
                </a>
            {/if}
            <!-- Block-scoped rather than -next-line: the anchor spans several
                 lines, so the rule reports on the href line, not the tag line
                 a -next-line comment would cover. -->
            <!-- eslint-disable svelte/no-navigation-without-resolve -- static route, matches AppFooter's own convention -->
            <a
                href="/hackathon"
                aria-current={onHackathons ? 'page' : undefined}
                class="{ROW} {onHackathons ? ROW_ACTIVE : ROW_IDLE}"
            >
                <Compass class="h-4 w-4 shrink-0" aria-hidden="true" />
                <span class="flex min-w-0 flex-col">
                    <span>All Hackathons</span>
                    <span class={ROW_HINT}>{BROWSE_HINT}</span>
                </span>
            </a>
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
            {#if session?.user}
                <!-- Below md the account link moves in here with sign-out, for
                     the same reason sign-out does: the bar has no room for it
                     at 320px. -->
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- static route, matches AppFooter's own convention -->
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
