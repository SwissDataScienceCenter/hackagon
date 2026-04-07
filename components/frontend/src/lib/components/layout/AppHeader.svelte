<script lang="ts">
    import { signIn, signOut } from '@auth/sveltekit/client';
    import { page } from '$app/stores';
    import type { Session } from '@auth/sveltekit';

    let { session }: { session: Session | null } = $props();

    function handleLogout() {
        signOut({ callbackUrl: '/' });
    }
</script>

<header class="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b bg-surface-100-900 border-surface-300-700">
    <div class="flex items-center gap-1">
        <img src="/logos/sdsc.svg" alt="SDSC" class="h-8" />
        <span class="text-lg font-bold">SDSC</span>
    </div>
    <span class="hidden text-xl font-semibold md:block">SDSC Hackathons</span>
    <div class="flex items-center gap-3">
        {#if session?.user}
            <button onclick={handleLogout}>Logout</button>
        {:else}
            <button
                onclick={() => signIn('keycloak', { callbackUrl: $page.url.pathname })}
                class="btn btn-sm preset-filled-primary-500"
                id="login-button">
                Log in
            </button>
        {/if}
    </div>
</header>
