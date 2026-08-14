<script lang="ts">
    import { signOut } from '@auth/sveltekit/client';
    import type { Session } from '@auth/sveltekit';
    import LightSwitch from './LightSwitch.svelte';
    import LogOut from 'lucide-svelte/icons/log-out';
    import UserCog from 'lucide-svelte/icons/user-cog';

    let {
        session,
        collapsed,
    }: { session: Omit<Session, 'accessToken'> | null; collapsed: boolean } = $props();

    const initial = $derived(session?.user?.name?.charAt(0).toUpperCase() ?? 'U');
</script>

<div
    class="flex items-center gap-2 border-t border-line p-2
           {collapsed ? 'flex-col' : 'justify-between'}"
>
    <div class="flex min-w-0 items-center gap-2">
        <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                   bg-accent text-on-accent text-sm font-bold"
            title={session?.user?.name ?? 'User'}
        >
            {initial}
        </div>
        {#if !collapsed}
            <span class="truncate text-sm font-medium">{session?.user?.name ?? 'User'}</span>
        {/if}
    </div>
    <div class="flex items-center gap-1">
        <LightSwitch />
        <!-- Your account sits beside sign-out because it is the same kind of
             thing: about you, not about a hackathon. It is also the only route
             to EditProfile and account deletion — without this entry the page
             exists and nothing reaches it. -->
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- static route, matches AppFooter's own convention -->
        <a href="/account" aria-label="Your account" title="Your account" class="btn btn-icon btn-sm btn-quiet">
            <UserCog class="h-4 w-4" />
        </a>
        <button
            onclick={() => signOut({ callbackUrl: '/' })}
            aria-label="Sign out"
            class="btn btn-icon btn-sm btn-quiet"
        >
            <LogOut class="h-4 w-4" />
        </button>
    </div>
</div>
