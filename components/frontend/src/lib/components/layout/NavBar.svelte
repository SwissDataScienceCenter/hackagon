<script lang="ts">
    import { signIn, signOut } from '@auth/sveltekit/client';
    import { page } from '$app/stores';
    import { afterNavigate } from '$app/navigation';
    import { resolve } from '$app/paths';
    import Menu from 'lucide-svelte/icons/menu';
    import X from 'lucide-svelte/icons/x';
    import type { Session } from '@auth/sveltekit';
    import LightSwitch from './LightSwitch.svelte';

    // The header carries identity, theme and sign-out — no administration entry.
    // That moved to the dashboard's Manage platform section, which is the single
    // place the platform pages are offered from. The trade is deliberate: from
    // inside a hackathon an admin now returns to the dashboard first, via the
    // wordmark, rather than jumping straight there from the header — on a phone
    // as much as on a desktop, since the mobile panel drops the entry too.
    let {
        session,
        showPublicLinks = true,
    }: {
        session: Omit<Session, 'accessToken'> | null;
        /**
         * Marketing links (Challenges, About). Off inside the app shell, where the
         * header is chrome for a signed-in workspace rather than a landing page.
         */
        showPublicLinks?: boolean;
    } = $props();

    let mobileOpen = $state(false);

    const userName = $derived(session?.user?.name ?? 'User');
    const initial = $derived(userName.charAt(0).toUpperCase());

    // The accent marks where you are rather than decorating the monogram, so the
    // header spends no accent and leaves the page's one primary action to own it.
    const onHackathons = $derived(
        $page.url.pathname === '/' || $page.url.pathname.startsWith('/dashboard')
    );

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
        <!-- The two branches differ only in destination, but each has to spell out its
             own resolve() call: svelte/no-navigation-without-resolve only recognizes a
             literal one in the attribute, not a derived value. -->
        {#if session?.user}
            <a
                href={resolve('/(app)/dashboard')}
                class="flex min-w-0 items-center gap-2 no-underline sm:gap-3"
            >
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
        {:else}
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
        {/if}

        <nav class="hidden items-center gap-6 md:flex">
            {#if session?.user}
                <a
                    href={resolve('/(app)/dashboard')}
                    aria-current={onHackathons ? 'page' : undefined}
                    class="pb-0.5 text-sm font-medium no-underline hover:text-accent-ink
                       {onHackathons
                        ? 'text-ink shadow-[inset_0_-2px_0_var(--color-accent)]'
                        : 'text-ink-2'}"
                >
                    Hackathons
                </a>
            {:else}
                <!-- Signed out, "Hackathons" is the public browse page, not the
                     landing page: the logo is the platform instance and this is
                     the list of its events. Signed in, it stays the dashboard —
                     your own events are the ones you came for. -->
                <a
                    href="/hackathon"
                    aria-current={onHackathons ? 'page' : undefined}
                    class="pb-0.5 text-sm font-medium no-underline hover:text-accent-ink
                       {onHackathons
                        ? 'text-ink shadow-[inset_0_-2px_0_var(--color-accent)]'
                        : 'text-ink-2'}"
                >
                    Hackathons
                </a>
            {/if}
            {#if showPublicLinks}
                <!-- About is a real SitePage, served by [slug=sitepage]. The
                     "Challenges" entry that used to sit here pointed at "/" —
                     it has no backing entity yet, and a link to nowhere is
                     worse than a missing one. It comes back the day the
                     feature does. -->
                <a
                    href="/about"
                    class="text-sm text-ink-3 no-underline hover:text-accent-ink"
                >
                    About
                </a>
            {/if}
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
                    onclick={() => signIn('keycloak', { callbackUrl: $page.url.pathname })}
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
            {#if session?.user}
                <a
                    href={resolve('/(app)/dashboard')}
                    aria-current={onHackathons ? 'page' : undefined}
                    class="{ROW} {onHackathons ? ROW_ACTIVE : ROW_IDLE}"
                >
                    Hackathons
                </a>
            {:else}
                <a
                    href="/hackathon"
                    aria-current={onHackathons ? 'page' : undefined}
                    class="{ROW} {onHackathons ? ROW_ACTIVE : ROW_IDLE}"
                >
                    Hackathons
                </a>
            {/if}
            {#if showPublicLinks}
                <a href="/about" class="{ROW} {ROW_IDLE}">About</a>
            {/if}
            {#if session?.user}
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
