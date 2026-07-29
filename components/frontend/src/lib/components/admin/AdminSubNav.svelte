<script lang="ts">
    import { resolve } from '$app/paths';
    import { page } from '$app/stores';

    interface Tab {
        id: string;
        label: string;
        /** Route id (as passed to resolve()), e.g. '/(app)/(admin)/users'. Omit if not built yet. */
        href?: string;
    }

    let { tabs }: { tabs: Tab[] } = $props();
</script>

<nav
    class="flex flex-wrap items-center justify-center gap-3 border-b border-surface-200-800
           bg-surface-50-950 px-4 py-4 sm:px-10 md:px-20"
    aria-label="Admin"
>
    {#each tabs as tab (tab.id)}
        {#if tab.href}
            {@const href = resolve(tab.href as never)}
            {@const isActive = $page.url.pathname === href}
            <a
                {href}
                class="btn btn-sm no-underline
                       {isActive ? 'preset-filled-primary-500' : 'preset-tonal-primary'}"
            >
                {tab.label}
            </a>
        {:else}
            <span
                class="btn btn-sm preset-tonal-surface cursor-not-allowed opacity-50"
                title="Not available yet"
            >
                {tab.label}
            </span>
        {/if}
    {/each}
</nav>
