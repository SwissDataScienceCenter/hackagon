<script lang="ts">
    import { resolve } from '$app/paths';
    import { page } from '$app/stores';

    let {
        tabs,
        slug,
    }: {
        tabs: { id: string; label: string }[];
        slug: string;
    } = $props();

    function tabHref(tabId: string) {
        return resolve(`/hackathon/${slug}/${tabId}`);
    }
</script>

<div
    class="touch-pan-x border-b border-surface-200-800 bg-surface-50-950 [scrollbar-width:thin]
           sm:overflow-visible"
>
    <div
        class="max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain
               [-webkit-overflow-scrolling:touch] sm:mx-auto"
    >
        <nav
            class="flex w-max min-w-full flex-nowrap justify-center gap-0 sm:w-full"
            aria-label="Hackathon"
        >
            {#each tabs as tab (tab.id)}
                {@const href = tabHref(tab.id)}
                {@const isActive = $page.url.pathname.endsWith(`/${tab.id}`)}
                <a
                    {href}
                    class="flex h-11 shrink-0 items-center px-3 text-xs font-medium no-underline
                           transition-colors sm:px-4
                           {isActive
                        ? 'border-b-2 border-primary-500 text-primary-700-300'
                        : 'text-surface-500 hover:text-surface-700-300'}"
                >
                    {tab.label}
                </a>
            {/each}
        </nav>
    </div>
</div>
