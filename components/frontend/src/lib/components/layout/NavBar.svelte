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

    let menuOpen = $state(false);

    // Close on route change: the menu is not part of the page it navigated to.
    $effect(() => {
        void $page.url.pathname;
        menuOpen = false;
    });

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
            <div class="relative">
                <!-- No aria-label: it would REPLACE the visible initial as the
                     accessible name, and the initial is how a signed-in user
                     (and the e2e suite) identifies whose session this is.
                     aria-haspopup/aria-expanded carry the menu semantics. -->
                <button
                    onclick={() => (menuOpen = !menuOpen)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    title="Account menu"
                    class="btn-icon btn-sm preset-filled-primary-500 rounded-full text-sm font-bold"
                >
                    {session.user.name?.charAt(0).toUpperCase() ?? 'U'}
                </button>

                {#if menuOpen}
                    <!-- Click-away layer: a plain button so Escape and focus
                         behaviour stay native, and screen readers do not see a
                         phantom control. -->
                    <button
                        class="fixed inset-0 z-40 cursor-default"
                        aria-label="Close account menu"
                        onclick={() => (menuOpen = false)}
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

                        <a href="/dashboard" role="menuitem" class="px-4 py-2 text-sm no-underline hover:bg-surface-100-900">
                            My hackathons
                        </a>
                        <a href="/account" role="menuitem" class="px-4 py-2 text-sm no-underline hover:bg-surface-100-900">
                            Your account
                        </a>

                        {#if canCreateHackathon}
                            <a href="/hackathon/create" role="menuitem" class="px-4 py-2 text-sm no-underline hover:bg-surface-100-900">
                                Create a hackathon
                            </a>
                        {/if}

                        {#if isAdmin}
                            <div class="mt-1 border-t border-surface-200-800 px-4 pt-2 pb-1">
                                <span class="text-xs font-bold tracking-widest text-surface-500">PLATFORM</span>
                            </div>
                            <a href="/manage/pages" role="menuitem" class="px-4 py-2 text-sm no-underline hover:bg-surface-100-900">
                                Pages (About, Privacy…)
                            </a>
                            <a href="/manage/users" role="menuitem" class="px-4 py-2 text-sm no-underline hover:bg-surface-100-900">
                                Users
                            </a>
                        {/if}

                        <button
                            role="menuitem"
                            onclick={() => signOut({ callbackUrl: '/' })}
                            class="mt-1 border-t border-surface-200-800 px-4 py-2 text-left text-sm hover:bg-surface-100-900"
                        >
                            Sign out
                        </button>
                    </div>
                {/if}
            </div>
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
