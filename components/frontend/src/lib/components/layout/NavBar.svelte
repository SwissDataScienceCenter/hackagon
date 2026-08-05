<script lang="ts">
    import { signIn, signOut } from '@auth/sveltekit/client';
    import { page } from '$app/stores';
    import { resolve } from '$app/paths';
    import type { Session } from '@auth/sveltekit';
    import LightSwitch from './LightSwitch.svelte';
    import { safeReturnTo } from '$lib/utils/returnTo';

    let {
        session,
        isAdmin = false,
        canCreateHackathon = false,
    }: {
        session: Omit<Session, 'accessToken'> | null;
        /** Backend-derived (casbin g2 via WhoAmI); every page still enforces. */
        isAdmin?: boolean;
        canCreateHackathon?: boolean;
    } = $props();

    let menuEl: HTMLDetailsElement | undefined = $state();
    let menuOpen = $state(false);
    let lastPath = $page.url.pathname;

    // menuOpen MIRRORS the <details>, it never drives it. The menu is native,
    // so it can already be open by the time this component hydrates; a
    // two-way `bind:open` would then slam it shut, because Svelte would apply
    // its own (false) idea of the state to the DOM. Symptom: you click the
    // avatar on a fresh page load, the menu appears, and vanishes again.
    const syncOpen = () => (menuOpen = menuEl?.open ?? false);

    function closeMenu() {
        if (menuEl) menuEl.open = false;
        menuOpen = false;
    }

    // Adopt whatever the browser did before hydration.
    $effect(() => {
        syncOpen();
    });

    // Close on route change: the menu is not part of the page it navigated to.
    // Guarded on an ACTUAL change — this effect also runs once on hydration,
    // and closing there would kill a menu the user had just opened.
    $effect(() => {
        const path = $page.url.pathname;
        if (path === lastPath) return;
        lastPath = path;
        closeMenu();
    });

    /** Is this entry the page we are already on? */
    const isCurrent = (href: string) => $page.url.pathname === href;

    /** Deep link the guards parked in `returnTo`, else back to the current page. */
    const loginCallbackUrl = $derived(
        safeReturnTo($page.url.searchParams.get('returnTo')) ?? $page.url.pathname,
    );
</script>

<header
    class="sticky top-0 z-50 flex h-14 items-center justify-between border-b
           border-surface-200-800 bg-surface-50-950 px-4 sm:px-10 md:px-20"
>
    {#if session?.user}
        <a href={resolve('/(app)/dashboard')} class="flex items-center gap-3 no-underline">
            <img src="/logos/sdsc_white.svg" alt="SDSC" class="hidden h-7 dark:block" />
            <img src="/logos/sdsc.svg" alt="SDSC" class="block h-7 dark:hidden" />
            <span class="text-base font-bold">Hackathons</span>
        </a>
    {:else}
        <a href={resolve('/')} class="flex items-center gap-3 no-underline">
            <img src="/logos/sdsc_white.svg" alt="SDSC" class="hidden h-7 dark:block" />
            <img src="/logos/sdsc.svg" alt="SDSC" class="block h-7 dark:hidden" />
            <span class="text-base font-bold">Hackathons</span>
        </a>
    {/if}

    <nav class="hidden items-center gap-6 md:flex">
        {#if session?.user}
            <a
                href={resolve('/(app)/dashboard')}
                class="text-sm font-medium no-underline hover:text-primary-500"
            >
                Hackathons
            </a>
        {:else}
            <a
                href={resolve('/')}
                class="text-sm font-medium no-underline hover:text-primary-500"
            >
                Hackathons
            </a>
        {/if}
        <!-- "Challenges" had no backing entity and pointed at "/" — dropped
             rather than kept as a link to nowhere. About is a real SitePage. -->
        <a
            href="/about"
            class="text-sm text-surface-400 no-underline hover:text-primary-500"
        >
            About
        </a>
    </nav>

    <div class="flex items-center gap-3">
        

        <LightSwitch />

        {#if session?.user}
            <!-- <details> rather than a button + {#if}: a native disclosure
                 opens on the very first click, before any JavaScript has
                 loaded. The hand-rolled version silently swallowed that click
                 during hydration — on a fresh page load you clicked the avatar
                 and nothing happened, which is exactly what people reported. -->
            <details class="relative" bind:this={menuEl} ontoggle={syncOpen}>
                <!-- No aria-label: it would REPLACE the visible initial as the
                     accessible name, and the initial is how a signed-in user
                     (and the e2e suite) identifies whose session this is.
                     aria-haspopup carries the menu semantics; <details> itself
                     maintains aria-expanded. -->
                <!-- svelte-ignore a11y_no_redundant_roles -->
                <!-- The linter calls role="button" redundant on <summary>, but
                     the mapping is not universal: dropping it made every
                     getByRole('button', {name: initial}) stop matching and
                     took all four auth setups down with it. Stated explicitly
                     so the control's role does not depend on the engine. -->
                <summary
                    role="button"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    title="Account menu"
                    class="btn-icon btn-sm preset-filled-primary-500 grid list-none cursor-pointer
                           place-items-center rounded-full text-sm font-bold
                           [&::-webkit-details-marker]:hidden [&::marker]:content-none"
                >
                    {session.user.name?.charAt(0).toUpperCase() ?? 'U'}
                </summary>

                <!-- Click-away layer: a plain button so Escape and focus
                     behaviour stay native, and screen readers do not see a
                     phantom control. Progressive enhancement — without JS the
                     menu still closes by clicking the summary again. -->
                <button
                    class="fixed inset-0 z-40 cursor-default"
                    aria-label="Close account menu"
                    onclick={closeMenu}
                ></button>

                <div
                    role="menu"
                    class="card preset-outlined-surface-200-800 bg-surface-50-950 absolute right-0
                           z-50 mt-2 flex w-56 flex-col py-1 shadow-xl"
                >
                    <div class="border-b border-surface-200-800 px-4 py-2">
                        <p class="truncate text-sm font-semibold">{session.user.name}</p>
                        {#if session.user.email}
                            <p class="truncate text-xs text-surface-500">{session.user.email}</p>
                        {/if}
                    </div>

                    <!-- aria-current + the dot mark the page you are already
                         on. Without it, clicking "My hackathons" from the
                         dashboard looks like a dead link: it navigates
                         correctly, to exactly where you already are. -->
                    {#each [
                        { href: '/dashboard', label: 'My hackathons', show: true },
                        { href: '/account', label: 'Your account', show: true },
                        { href: '/hackathon/create', label: 'Create a hackathon', show: canCreateHackathon }
                    ] as entry (entry.href)}
                        {#if entry.show}
                            <a
                                href={entry.href}
                                role="menuitem"
                                aria-current={isCurrent(entry.href) ? 'page' : undefined}
                                class="flex items-center justify-between gap-2 px-4 py-2 text-sm no-underline
                                       hover:bg-surface-100-900 aria-[current]:font-semibold"
                            >
                                {entry.label}
                                {#if isCurrent(entry.href)}
                                    <span class="size-1.5 rounded-full bg-primary-500" aria-hidden="true"></span>
                                {/if}
                            </a>
                        {/if}
                    {/each}

                    {#if isAdmin}
                        <div class="mt-1 border-t border-surface-200-800 px-4 pt-2 pb-1">
                            <span class="text-xs font-bold tracking-widest text-surface-500">PLATFORM</span>
                        </div>
                        {#each [
                            { href: '/manage/pages', label: 'Pages (About, Privacy…)' },
                            { href: '/manage/users', label: 'Users' }
                        ] as entry (entry.href)}
                            <a
                                href={entry.href}
                                role="menuitem"
                                aria-current={isCurrent(entry.href) ? 'page' : undefined}
                                class="flex items-center justify-between gap-2 px-4 py-2 text-sm no-underline
                                       hover:bg-surface-100-900 aria-[current]:font-semibold"
                            >
                                {entry.label}
                                {#if isCurrent(entry.href)}
                                    <span class="size-1.5 rounded-full bg-primary-500" aria-hidden="true"></span>
                                {/if}
                            </a>
                        {/each}
                    {/if}

                    <button
                        role="menuitem"
                        onclick={() => signOut({ callbackUrl: '/' })}
                        class="mt-1 border-t border-surface-200-800 px-4 py-2 text-left text-sm hover:bg-surface-100-900"
                    >
                        Sign out
                    </button>
                </div>
            </details>
        {:else}
            <button
                onclick={() => signIn('keycloak', { callbackUrl: loginCallbackUrl })}
                class="btn btn-sm preset-filled-primary-500"
            >
                Log in
            </button>
        {/if}
    </div>
</header>
