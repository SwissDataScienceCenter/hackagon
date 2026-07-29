<script lang="ts">
    import { page } from '$app/stores';
    import { resolve } from '$app/paths';
    import Menu from 'lucide-svelte/icons/menu';
    import X from 'lucide-svelte/icons/x';
    import PanelLeftClose from 'lucide-svelte/icons/panel-left-close';
    import PanelLeftOpen from 'lucide-svelte/icons/panel-left-open';

    let collapsed = $state(false);
    let mobileOpen = $state(false);

    $effect(() => {
        if (typeof localStorage === 'undefined') return;
        collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    });

    $effect(() => {
        $page.url.pathname;
        mobileOpen = false;
    });

    function toggleCollapsed() {
        collapsed = !collapsed;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('sidebar-collapsed', String(collapsed));
        }
    }
</script>

<div
    class="flex h-14 items-center gap-3 border-b border-surface-200-800 bg-surface-50-950 px-4
           md:hidden"
>
    <button
        onclick={() => (mobileOpen = true)}
        aria-label="Open navigation"
        class="btn-icon btn-sm"
    >
        <Menu class="h-5 w-5" />
    </button>
    <a href={resolve('/(app)/(participant)/dashboard')} class="flex items-center gap-2 no-underline">
        <img src="/logos/sdsc_white.svg" alt="SDSC" class="hidden h-6 dark:block" />
        <img src="/logos/sdsc.svg" alt="SDSC" class="block h-6 dark:hidden" />
        <span class="text-sm font-bold">Hackathons</span>
    </a>
</div>

{#if mobileOpen}
    <button
        aria-label="Close navigation"
        class="fixed inset-0 z-30 bg-black/50 md:hidden"
        onclick={() => (mobileOpen = false)}
    ></button>
{/if}

<aside
    class="fixed inset-y-0 left-0 z-40 flex h-screen w-64 -translate-x-full flex-col
           border-r border-surface-200-800 bg-surface-50-950 transition-transform
           duration-200 md:static md:z-auto md:h-auto md:translate-x-0 md:transition-[width]
           {mobileOpen ? 'translate-x-0' : ''} {collapsed ? 'md:w-16' : 'md:w-64'}"
>
    <div
        class="flex h-14 shrink-0 items-center gap-3 border-b border-surface-200-800 px-4
               {collapsed ? 'md:justify-center md:px-0' : 'justify-between'}"
    >
        {#if !collapsed}
            <a
                href={resolve('/(app)/(participant)/dashboard')}
                class="flex items-center gap-2 no-underline"
            >
                <img src="/logos/sdsc_white.svg" alt="SDSC" class="hidden h-6 dark:block" />
                <img src="/logos/sdsc.svg" alt="SDSC" class="block h-6 dark:hidden" />
                <span class="text-sm font-bold">Hackathons</span>
            </a>
        {/if}
        <button
            onclick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            class="btn-icon btn-sm hidden md:inline-flex"
        >
            {#if collapsed}
                <PanelLeftOpen class="h-4 w-4" />
            {:else}
                <PanelLeftClose class="h-4 w-4" />
            {/if}
        </button>
        <button
            onclick={() => (mobileOpen = false)}
            aria-label="Close navigation"
            class="btn-icon btn-sm md:hidden"
        >
            <X class="h-4 w-4" />
        </button>
    </div>

    <nav class="flex-1 overflow-y-auto p-2"></nav>
</aside>
