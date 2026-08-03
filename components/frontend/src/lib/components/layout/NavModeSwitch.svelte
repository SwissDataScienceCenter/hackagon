<script lang="ts">
    import Eye from 'lucide-svelte/icons/eye';
    import Settings from 'lucide-svelte/icons/settings';
    import type { NavMode } from '$lib/navigation';

    let {
        viewHref,
        manageHref,
        mode,
        collapsed,
    }: { viewHref: string; manageHref: string; mode: NavMode; collapsed: boolean } = $props();

    const BASE =
        'flex h-8 items-center justify-center gap-1.5 rounded-md text-xs no-underline transition-colors';
    const ACTIVE = 'bg-surface-50-950 font-semibold text-surface-950-50 shadow-sm';
    const IDLE = 'text-surface-500 hover:text-surface-700-300';
</script>

<!-- Real links, not buttons: crossing modes is a navigation, so it stays
     middle-clickable and needs no client state to track the current page. -->
<div class="px-2 pb-2">
    <div
        class="grid gap-1 rounded-lg bg-surface-100-900 p-1
               {collapsed ? 'grid-cols-1' : 'grid-cols-2'}"
    >
        <!-- eslint-disable svelte/no-navigation-without-resolve -- both hrefs come
             from counterpartHref(), which returns nav entries built with resolve()
             in $lib/navigation; the rule only recognizes a literal resolve() call
             in the attribute itself. -->
        <a
            href={viewHref}
            aria-current={mode === 'view' ? 'page' : undefined}
            title={collapsed ? 'Participant view' : undefined}
            class="{BASE} {mode === 'view' ? ACTIVE : IDLE}"
        >
            <Eye class="h-3.5 w-3.5 shrink-0" />
            {#if !collapsed}
                <span>View</span>
            {/if}
        </a>
        <a
            href={manageHref}
            aria-current={mode === 'manage' ? 'page' : undefined}
            title={collapsed ? 'Manage hackathon' : undefined}
            class="{BASE} {mode === 'manage' ? ACTIVE : IDLE}"
        >
            <Settings class="h-3.5 w-3.5 shrink-0" />
            {#if !collapsed}
                <span>Manage</span>
            {/if}
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
    </div>
</div>
