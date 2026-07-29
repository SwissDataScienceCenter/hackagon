<script lang="ts">
    import { signOut } from '@auth/sveltekit/client';
    import type { Session } from '@auth/sveltekit';
    import LightSwitch from './LightSwitch.svelte';
    import LogOut from 'lucide-svelte/icons/log-out';

    let {
        session,
        collapsed,
    }: { session: Omit<Session, 'accessToken'> | null; collapsed: boolean } = $props();

    const initial = $derived(session?.user?.name?.charAt(0).toUpperCase() ?? 'U');
</script>

<div
    class="flex items-center gap-2 border-t border-surface-200-800 p-2
           {collapsed ? 'flex-col' : 'justify-between'}"
>
    <div class="flex min-w-0 items-center gap-2">
        <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                   preset-filled-primary-500 text-sm font-bold"
        >
            {initial}
        </div>
        {#if !collapsed}
            <span class="truncate text-sm font-medium">{session?.user?.name ?? 'User'}</span>
        {/if}
    </div>
    <div class="flex items-center gap-1">
        <LightSwitch />
        <button
            onclick={() => signOut({ callbackUrl: '/' })}
            aria-label="Sign out"
            class="btn-icon btn-sm hover:preset-tonal-secondary"
        >
            <LogOut class="h-4 w-4" />
        </button>
    </div>
</div>
