<script lang="ts">
    import { signIn, signOut } from '@auth/sveltekit/client';
    import { page } from '$app/stores';
    import { resolve } from '$app/paths';
    import type { Session } from '@auth/sveltekit';
    import LightSwitch from './LightSwitch.svelte';

    let { session }: { session: Omit<Session, 'accessToken'> | null } = $props();
</script>

<header
    class="sticky top-0 z-50 flex items-center justify-between h-14 px-20
           border-b border-surface-200 dark:border-surface-800
           bg-surface-50 dark:bg-surface-950"
>
    <a href={resolve('/')} class="flex items-center gap-3 no-underline">
        <img src="/logos/sdsc_white.svg" alt="SDSC" class="hidden h-7 dark:block" />
        <img src="/logos/sdsc.svg" alt="SDSC" class="block h-7 dark:hidden" />
        <span class="text-base font-bold">Hackathons</span>
    </a>

    <nav class="hidden items-center gap-6 md:flex">
        <a
            href={resolve('/')}
            class="text-sm font-medium no-underline hover:text-primary-500"
        >
            Hackathons
        </a>
        <a
            href={resolve('/')}
            class="text-sm text-surface-400 no-underline hover:text-primary-500"
        >
            Challenges
        </a>
        <a
            href={resolve('/')}
            class="text-sm text-surface-400 no-underline hover:text-primary-500"
        >
            About
        </a>
    </nav>

    <div class="flex items-center gap-3">
        

        <LightSwitch />

        {#if session?.user}
            <button
                onclick={() => signOut({ callbackUrl: '/' })}
                class="btn-icon btn-sm preset-filled-primary-500 rounded-full text-sm font-bold"            >
                {session.user.name?.charAt(0).toUpperCase() ?? 'U'}
            </button>
        {:else}
            <button
                onclick={() => signIn('keycloak', { callbackUrl: $page.url.pathname })}
                class="btn btn-sm preset-filled-primary-500"
            >
                Log in
            </button>
        {/if}
    </div>
</header>
