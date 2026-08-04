<script lang="ts">
    import { signOut } from '@auth/sveltekit/client';
    import type { Session } from '@auth/sveltekit';
    import { resolve } from '$app/paths';
    import LightSwitch from './LightSwitch.svelte';
    import LogOut from 'lucide-svelte/icons/log-out';
    import { globalRoleBadges, profileInitials } from '$lib/utils/profile';

    let {
        session,
        collapsed,
        username,
        displayName,
        roles = [],
        active = false
    }: {
        session: Omit<Session, 'accessToken'> | null;
        collapsed: boolean;
        /**
         * From WhoAmI via the (app) layout. Optional because that call is allowed
         * to fail — the layout degrades the whole sidebar to an empty nav rather
         * than blanking the shell — in which case the panel falls back to the
         * session's name and stops linking anywhere useful.
         */
        username?: string;
        displayName?: string;
        /** GlobalRole numbers from casbin; unnamed values are dropped. */
        roles?: number[];
        /** Whether the profile route is the current page. */
        active?: boolean;
    } = $props();

    const name = $derived(
        (displayName ?? '').trim() ||
            (username ?? '').trim() ||
            session?.user?.name ||
            'User'
    );
    // `?? undefined` because Auth.js types the session name as `string | null`,
    // which is not the `string | undefined` the helper takes.
    const initials = $derived(
        profileInitials(displayName ?? session?.user?.name ?? undefined, username)
    );

    // Only the first badge: the panel is a narrow column, and a second chip
    // wraps the name onto its own line. An admin who is also an organiser sees
    // "Admin", the stronger of the two; the profile page shows both.
    const badge = $derived(globalRoleBadges(roles)[0]);

    // No platform user means WhoAmI failed, and the profile page would 503. Render
    // the panel as static text rather than a link into an error.
    const linkable = $derived(Boolean(username));
</script>

<div class="flex flex-col border-t border-surface-200-800">
    <!-- The user's own entry point to their profile. It sits in the footer where
         the avatar already was, so the affordance lands where people look for
         account things rather than becoming a nav item competing with hackathons. -->
    {#if linkable}
        <a
            href={resolve('/(app)/profile')}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? name : undefined}
            class="flex items-center gap-2 p-2 no-underline transition-colors
                   hover:bg-surface-100-900
                   {active ? 'bg-surface-100-900' : ''}
                   {collapsed ? 'justify-center' : ''}"
        >
            <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                       preset-filled-primary-500 text-sm font-bold"
            >
                {initials}
            </div>
            {#if !collapsed}
                <div class="flex min-w-0 flex-1 items-center gap-1.5">
                    <span class="truncate text-sm font-medium">{name}</span>
                    {#if badge}
                        <span class="badge {badge.preset} shrink-0 text-[10px]">
                            {badge.label}
                        </span>
                    {/if}
                </div>
            {/if}
        </a>
    {:else}
        <div class="flex items-center gap-2 p-2 {collapsed ? 'justify-center' : ''}">
            <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                       preset-filled-primary-500 text-sm font-bold"
                title={name}
            >
                {initials}
            </div>
            {#if !collapsed}
                <span class="truncate text-sm font-medium">{name}</span>
            {/if}
        </div>
    {/if}

    <div
        class="flex items-center gap-1 px-2 pb-2 {collapsed
            ? 'flex-col'
            : 'justify-end'}"
    >
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
