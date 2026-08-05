<script lang="ts">
    import { signIn, signOut } from '@auth/sveltekit/client';
    import { page } from '$app/stores';
    import { resolve } from '$app/paths';
    import type { Session } from '@auth/sveltekit';
    import LightSwitch from './LightSwitch.svelte';

    let {
        session,
        showPublicLinks = true,
        isGlobalAdmin = false,
    }: {
        session: Omit<Session, 'accessToken'> | null;
        /**
         * Marketing links (Challenges, About). Off inside the app shell, where the
         * header is chrome for a signed-in workspace rather than a landing page.
         */
        showPublicLinks?: boolean;
        /**
         * Shows the platform administration entry. It lives here rather than on the
         * dashboard because it is the only route to it from inside a hackathon,
         * where the dashboard's own actions are out of reach.
         */
        isGlobalAdmin?: boolean;
    } = $props();

    const userName = $derived(session?.user?.name ?? 'User');
    const initial = $derived(userName.charAt(0).toUpperCase());
</script>

<header
    class="sticky top-0 z-50 flex h-14 items-center justify-between border-b
           border-line bg-surface px-4 sm:px-10 md:px-20"
>
    <!-- The two branches differ only in destination, but each has to spell out its
         own resolve() call: svelte/no-navigation-without-resolve only recognizes a
         literal one in the attribute, not a derived value. -->
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
                class="text-sm font-medium no-underline hover:text-accent-ink"
            >
                Hackathons
            </a>
        {:else}
            <a
                href={resolve('/')}
                class="text-sm font-medium no-underline hover:text-accent-ink"
            >
                Hackathons
            </a>
        {/if}
        {#if showPublicLinks}
            <a
                href={resolve('/')}
                class="text-sm text-ink-3 no-underline hover:text-accent-ink"
            >
                Challenges
            </a>
            <a
                href={resolve('/')}
                class="text-sm text-ink-3 no-underline hover:text-accent-ink"
            >
                About
            </a>
        {/if}
        {#if isGlobalAdmin}
            <a
                href={resolve('/(app)/manage/users')}
                class="text-sm text-ink-3 no-underline hover:text-accent-ink"
            >
                Users
            </a>
        {/if}
    </nav>

    <div class="flex items-center gap-3">
        <LightSwitch />

        {#if session?.user}
            <div class="flex min-w-0 items-center gap-2">
                <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                           bg-accent text-on-accent text-sm font-bold"
                    title={userName}
                >
                    {initial}
                </span>
                <span class="hidden max-w-40 truncate text-sm font-medium sm:inline">
                    {userName}
                </span>
            </div>
            <button
                onclick={() => signOut({ callbackUrl: '/' })}
                class="btn btn-sm btn-ghost"
            >
                Log out
            </button>
        {:else}
            <button
                onclick={() => signIn('keycloak', { callbackUrl: $page.url.pathname })}
                class="btn btn-sm btn-solid"
            >
                Log in
            </button>
        {/if}
    </div>
</header>
